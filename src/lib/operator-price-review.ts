import "server-only";

import {
  buildOperatorPriceReviewReasonLabels,
  type OperatorPriceReviewReasonFilter,
} from "@/lib/operator-price-review-reasons";
import { createSupabaseServiceClient, hasSupabaseServiceConfig } from "@/lib/supabase";
import type {
  AiPriceCandidate,
  OperatorPriceReviewDecision,
  OperatorPriceReviewDetail,
  OperatorPriceReviewListItem,
  OperatorPriceReviewState,
} from "@/lib/types";

type SupabaseServiceClient = ReturnType<typeof createSupabaseServiceClient>;

type ReviewCandidateRow = AiPriceCandidate & {
  offline_store_visits?: {
    id: string;
    visit_code?: string | null;
    visit_date?: string | null;
    created_at?: string | null;
    uploader_name?: string | null;
  } | null;
};

type SourceImageRow = {
  id: string;
  visit_id: string;
  image_path: string;
  thumbnail_path: string | null;
  deleted_at: string | null;
  replaced_by_image_id: string | null;
};

export type OperatorPriceReviewFilters = {
  state?: OperatorPriceReviewState;
  dateFrom?: string;
  dateTo?: string;
  visitCode?: string;
  reason?: OperatorPriceReviewReasonFilter;
  page?: number;
  perPage?: number;
  locale?: string;
};

export type OperatorPriceReviewPage = {
  data: OperatorPriceReviewListItem[];
  total: number;
  page: number;
  perPage: number;
  error: string | null;
  isDemo: boolean;
};

export type OperatorPriceReviewExportRow = {
  candidate_id: string;
  visit_id: string | null;
  visit_code: string | null;
  image_id: string | null;
  created_at: string | null;
  created_by: string | null;
  product_name: string;
  sku_label: string | null;
  size: string | null;
  ai_package_price: number | null;
  ai_piece_count: number | null;
  ai_price_per_piece: number | null;
  operator_reason: string;
  status: string;
};

export const MAX_QUALITY_GATE_ATTEMPTS = 3;
const MANUAL_MATCH_THRESHOLD = 0.9;
const CANDIDATE_SELECT = [
  "id",
  "visit_id",
  "source_image_id",
  "source_image_path",
  "raw_brand",
  "raw_product",
  "raw_price",
  "parsed_price_idr",
  "ai_package_price_idr",
  "ai_net_price_idr",
  "ai_piece_count",
  "ai_price_per_piece",
  "package_price_idr",
  "net_price_idr",
  "piece_count",
  "price_per_piece",
  "promo_type",
  "ai_promo_type",
  "candidate_type",
  "price_evidence_status",
  "price_evidence_reason_code",
  "conflicts",
  "warnings",
  "quality_gate_status",
  "quality_gate_reason_codes",
  "quality_gate_attempt_count",
  "benchmark_price_per_piece",
  "benchmark_deviation_pct",
  "approval_input_fingerprint",
  "ai_matched_entity_type",
  "ai_matched_entity_id",
  "ai_matched_label",
  "ai_match_method",
  "ai_match_evidence",
  "matched_entity_type",
  "matched_entity_id",
  "matched_label",
  "match_score",
  "status",
  "reviewed_piece_count",
  "reviewed_price_per_piece",
  "reviewed_at",
  "review_method",
  "h5_lifecycle_status",
  "created_at",
].join(",");

export function isPendingOperatorReviewCandidate(candidate: Pick<AiPriceCandidate,
  "status" | "candidate_type" | "h5_lifecycle_status" | "quality_gate_status" | "quality_gate_attempt_count"
>) {
  if (candidate.status !== "pending" || candidate.candidate_type !== "SKU" || candidate.h5_lifecycle_status) return false;
  if (candidate.quality_gate_status === "REVIEW_REQUIRED" || candidate.quality_gate_status === "INSUFFICIENT_BENCHMARK") return true;
  return candidate.quality_gate_status === "FAILED"
    && Number(candidate.quality_gate_attempt_count ?? 0) >= MAX_QUALITY_GATE_ATTEMPTS;
}

export function isProcessedOperatorReviewCandidate(candidate: Pick<AiPriceCandidate,
  "status" | "candidate_type" | "h5_lifecycle_status" | "review_method"
>) {
  if (candidate.candidate_type !== "SKU" || candidate.h5_lifecycle_status) return false;
  if (candidate.status !== "approved" && candidate.status !== "rejected") return false;
  if (candidate.review_method === "auto_rule") return false;
  return candidate.review_method === "manual" || candidate.review_method === "bulk_manual";
}

export function buildOperatorReason(candidate: AiPriceCandidate, locale = "zh") {
  return buildOperatorPriceReviewReasonLabels(candidate, locale).join("；") || (
    locale === "zh" ? "其他原因" : "Other reason"
  );
}

export async function getOperatorPriceReviewsPage(filters: OperatorPriceReviewFilters = {}): Promise<OperatorPriceReviewPage> {
  const state = filters.state === "processed" ? "processed" : "pending";
  const page = Math.max(1, Math.floor(filters.page ?? 1));
  const perPage = Math.min(100, Math.max(10, Math.floor(filters.perPage ?? 25)));
  if (!hasSupabaseServiceConfig()) {
    return {
      data: [],
      total: 0,
      page,
      perPage,
      error: "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
      isDemo: true,
    };
  }

  const supabase = createSupabaseServiceClient();
  const query = buildOperatorPriceReviewQuery(supabase, filters, state, true);
  const from = (page - 1) * perPage;
  const { data, error, count } = await query.range(from, from + perPage - 1);
  if (error) return { data: [], total: 0, page, perPage, error: error.message, isDemo: false };
  const rows = (data ?? []) as unknown as ReviewCandidateRow[];
  const [imageMap, matchedLabelMap] = await Promise.all([
    loadSourceImageMap(supabase, rows),
    loadMatchedLabelMap(supabase, rows),
  ]);
  const items = await Promise.all(rows.map((candidate) =>
    toListItem(supabase, candidate, state, filters.locale ?? "zh", imageMap, matchedLabelMap),
  ));
  return { data: items, total: count ?? 0, page, perPage, error: null, isDemo: false };
}

export async function getOperatorPriceReviewsExport(filters: OperatorPriceReviewFilters = {}): Promise<{
  data: OperatorPriceReviewExportRow[];
  error: string | null;
  isDemo: boolean;
}> {
  if (!hasSupabaseServiceConfig()) {
    return {
      data: [],
      error: "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
      isDemo: true,
    };
  }

  const state = filters.state === "processed" ? "processed" : "pending";
  const supabase = createSupabaseServiceClient();
  const rows: ReviewCandidateRow[] = [];
  const batchSize = 1000;

  for (let from = 0; ; from += batchSize) {
    const { data, error } = await buildOperatorPriceReviewQuery(supabase, filters, state, false)
      .range(from, from + batchSize - 1);
    if (error) return { data: [], error: error.message, isDemo: false };

    const batch = (data ?? []) as unknown as ReviewCandidateRow[];
    rows.push(...batch);
    if (batch.length < batchSize) break;
  }

  const matchedLabelMap = await loadMatchedLabelMap(supabase, rows);
  return {
    data: rows.map((candidate) => toExportRow(candidate, state, filters.locale ?? "zh", matchedLabelMap)),
    error: null,
    isDemo: false,
  };
}

function buildOperatorPriceReviewQuery(
  supabase: SupabaseServiceClient,
  filters: OperatorPriceReviewFilters,
  state: OperatorPriceReviewState,
  includeCount: boolean,
) {
  const visitSelect = filters.dateFrom || filters.dateTo || filters.visitCode
    ? "offline_store_visits!inner(id,visit_code,visit_date,created_at,uploader_name)"
    : "offline_store_visits(id,visit_code,visit_date,created_at,uploader_name)";
  let query = supabase
    .from("ai_price_candidates")
    .select(`${CANDIDATE_SELECT},${visitSelect}`, includeCount ? { count: "exact" } : undefined)
    .eq("candidate_type", "SKU")
    .is("h5_lifecycle_status", null);

  if (state === "pending") {
    query = query
      .eq("status", "pending")
      .or(`quality_gate_status.in.(REVIEW_REQUIRED,INSUFFICIENT_BENCHMARK),and(quality_gate_status.eq.FAILED,quality_gate_attempt_count.gte.${MAX_QUALITY_GATE_ATTEMPTS})`)
      .order("created_at", { ascending: false });
  } else {
    query = query
      .in("status", ["approved", "rejected"])
      .in("review_method", ["manual", "bulk_manual"])
      .order("reviewed_at", { ascending: false });
  }
  if (filters.dateFrom) query = query.gte("offline_store_visits.visit_date", filters.dateFrom);
  if (filters.dateTo) query = query.lte("offline_store_visits.visit_date", filters.dateTo);
  if (filters.visitCode) query = query.ilike("offline_store_visits.visit_code", `%${escapeIlike(filters.visitCode)}%`);

  switch (filters.reason) {
    case "DUPLICATE_MASTER_SKU":
      query = query.eq("ai_match_method", "MASTER_DATA_DUPLICATE");
      break;
    case "PRICE_DEVIATION_HIGH":
    case "PRICE_DEVIATION_CRITICAL":
    case "AMOUNT_SCALE_SUSPECTED":
    case "PROMOTION_EVIDENCE":
      query = query.filter("quality_gate_reason_codes", "cs", JSON.stringify([filters.reason]));
      break;
    case "PRICE_TAG_UNCLEAR":
    case "PRODUCT_PRICE_BINDING_UNCLEAR":
    case "PIECE_COUNT_UNCLEAR":
    case "PRICE_DERIVED":
    case "LEGACY_EVIDENCE_UNAVAILABLE":
      query = query.eq("price_evidence_reason_code", filters.reason);
      break;
    case "PRICE_MATH_CONFLICT":
      query = query.or("price_evidence_reason_code.eq.PRICE_MATH_CONFLICT,price_evidence_status.eq.CONFLICT");
      break;
    case "SKU_MATCH_UNCERTAIN":
      query = query
        .or(`quality_gate_reason_codes.cs.${JSON.stringify(["SKU_MATCH_UNCERTAIN"])},matched_entity_type.eq.unmatched,matched_entity_id.is.null`)
        .or("ai_match_method.is.null,ai_match_method.neq.MASTER_DATA_DUPLICATE");
      break;
    case "OTHER_EVIDENCE_REVIEW_REQUIRED":
      query = query
        .is("price_evidence_reason_code", null)
        .or(`quality_gate_reason_codes.cs.${JSON.stringify(["EVIDENCE_REVIEW_REQUIRED"])},price_evidence_status.in.(LOW_CONFIDENCE,REVIEW_REQUIRED)`);
      break;
    case "INSUFFICIENT_BENCHMARK":
      query = query.or(`quality_gate_reason_codes.cs.${JSON.stringify(["INSUFFICIENT_BENCHMARK"])},quality_gate_status.eq.INSUFFICIENT_BENCHMARK`);
      break;
    case "QUALITY_CHECK_FAILED":
      query = query
        .eq("quality_gate_status", "FAILED")
        .gte("quality_gate_attempt_count", MAX_QUALITY_GATE_ATTEMPTS);
      break;
    case "OTHER_REVIEW_REQUIRED":
      query = query
        .filter("quality_gate_reason_codes", "eq", JSON.stringify([]))
        .is("price_evidence_reason_code", null)
        .not("matched_entity_type", "eq", "unmatched")
        .not("matched_entity_id", "is", null)
        .or("price_evidence_status.is.null,price_evidence_status.in.(CLEAR,DERIVED)")
        .not("quality_gate_status", "eq", "FAILED");
      break;
  }

  return query;
}

export async function getOperatorPriceReviewDetail(id: string, locale = "zh"): Promise<{
  data: OperatorPriceReviewDetail | null;
  error: string | null;
  isDemo: boolean;
}> {
  if (!hasSupabaseServiceConfig()) {
    return { data: null, error: "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY", isDemo: true };
  }
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("ai_price_candidates")
    .select(`${CANDIDATE_SELECT},offline_store_visits(id,visit_code,visit_date)`)
    .eq("id", id)
    .maybeSingle();
  if (error) return { data: null, error: error.message, isDemo: false };
  if (!data) return { data: null, error: null, isDemo: false };

  const candidate = data as unknown as ReviewCandidateRow;
  const state: OperatorPriceReviewState = candidate.status === "pending" ? "pending" : "processed";
  if (state === "pending" ? !isPendingOperatorReviewCandidate(candidate) : !isProcessedOperatorReviewCandidate(candidate)) {
    return { data: null, error: null, isDemo: false };
  }
  const [imageMap, matchedLabelMap] = await Promise.all([
    loadSourceImageMap(supabase, [candidate]),
    loadMatchedLabelMap(supabase, [candidate]),
  ]);
  const sourceImage = findSourceImage(candidate, imageMap);
  const listItem = await toListItem(supabase, candidate, state, locale, imageMap, matchedLabelMap);
  const sourceImageUrl = sourceImage ? await signImage(supabase, sourceImage.image_path) : null;

  return {
    data: {
      ...listItem,
      visit_code: candidate.offline_store_visits?.visit_code ?? null,
      source_image_available: Boolean(sourceImageUrl),
      source_image_id: sourceImage?.id ?? candidate.source_image_id ?? null,
      source_image_url: sourceImageUrl,
      evidence_product_text: [candidate.raw_brand, candidate.raw_product].filter(Boolean).join(" ").trim() || candidate.raw_product,
      evidence_package_price: positiveNumber(candidate.ai_package_price_idr ?? candidate.ai_net_price_idr ?? candidate.parsed_price_idr),
      evidence_piece_count: positiveInteger(candidate.ai_piece_count ?? candidate.piece_count),
      evidence_price_per_piece: positiveNumber(candidate.ai_price_per_piece)
        ?? derivedPerPiece(candidate.ai_package_price_idr ?? candidate.parsed_price_idr, candidate.ai_piece_count ?? candidate.piece_count),
      historical_common_price_per_piece: positiveNumber(candidate.benchmark_price_per_piece),
      current_match_type: candidate.matched_entity_type,
      current_match_id: candidate.matched_entity_id,
      current_match_label: resolveMatchedLabel(candidate, matchedLabelMap),
      review_token: candidate.approval_input_fingerprint ?? "",
      visit_detail_href: candidate.visit_id ? `/${locale}/mobile/offline-capture/${candidate.visit_id}` : `/${locale}/mobile/offline-capture`,
    },
    error: null,
    isDemo: false,
  };
}

async function toListItem(
  supabase: SupabaseServiceClient,
  candidate: ReviewCandidateRow,
  state: OperatorPriceReviewState,
  locale: string,
  imageMap: Map<string, SourceImageRow>,
  matchedLabelMap: Map<string, string>,
): Promise<OperatorPriceReviewListItem> {
  const sourceImage = findSourceImage(candidate, imageMap);
  const thumbnailPath = sourceImage?.thumbnail_path ?? sourceImage?.image_path ?? null;
  const sourceImageUrl = thumbnailPath ? await signImage(supabase, thumbnailPath) : null;
  const operatorReasonLabels = buildOperatorPriceReviewReasonLabels(candidate, locale);
  const matchEvidence = candidate.ai_match_evidence as { signature?: { size?: string } } | null | undefined;
  return {
    id: candidate.id,
    state,
    source_thumbnail_url: sourceImageUrl,
    source_image_available: Boolean(sourceImageUrl),
    product_name: [candidate.raw_brand, candidate.raw_product].filter(Boolean).join(" ").trim() || candidate.raw_product || "-",
    sku_label: resolveMatchedLabel(candidate, matchedLabelMap),
    size: matchEvidence?.signature?.size || null,
    ai_package_price: positiveNumber(candidate.ai_package_price_idr ?? candidate.ai_net_price_idr ?? candidate.parsed_price_idr),
    ai_piece_count: positiveInteger(candidate.ai_piece_count ?? candidate.piece_count),
    ai_price_per_piece: positiveNumber(candidate.ai_price_per_piece)
      ?? derivedPerPiece(candidate.ai_package_price_idr ?? candidate.parsed_price_idr, candidate.ai_piece_count ?? candidate.piece_count),
    operator_reason: operatorReasonLabels.join(locale === "zh" ? "；" : "; "),
    operator_reason_labels: operatorReasonLabels,
    requires_product_correction: requiresProductCorrection(candidate),
    processed_decision: state === "processed" ? deriveProcessedDecision(candidate) : null,
    processed_at: state === "processed" ? candidate.reviewed_at : null,
    created_at: candidate.created_at,
  };
}

function toExportRow(
  candidate: ReviewCandidateRow,
  state: OperatorPriceReviewState,
  locale: string,
  matchedLabelMap: Map<string, string>,
): OperatorPriceReviewExportRow {
  const operatorReasonLabels = buildOperatorPriceReviewReasonLabels(candidate, locale);
  const matchEvidence = candidate.ai_match_evidence as { signature?: { size?: string } } | null | undefined;
  return {
    candidate_id: candidate.id,
    visit_id: candidate.offline_store_visits?.id ?? candidate.visit_id ?? null,
    visit_code: candidate.offline_store_visits?.visit_code ?? null,
    image_id: candidate.source_image_id ?? null,
    created_at: candidate.offline_store_visits?.created_at ?? candidate.created_at ?? null,
    created_by: candidate.offline_store_visits?.uploader_name ?? null,
    product_name: [candidate.raw_brand, candidate.raw_product].filter(Boolean).join(" ").trim() || candidate.raw_product || "-",
    sku_label: resolveMatchedLabel(candidate, matchedLabelMap),
    size: matchEvidence?.signature?.size || null,
    ai_package_price: positiveNumber(candidate.ai_package_price_idr ?? candidate.ai_net_price_idr ?? candidate.parsed_price_idr),
    ai_piece_count: positiveInteger(candidate.ai_piece_count ?? candidate.piece_count),
    ai_price_per_piece: positiveNumber(candidate.ai_price_per_piece)
      ?? derivedPerPiece(candidate.ai_package_price_idr ?? candidate.parsed_price_idr, candidate.ai_piece_count ?? candidate.piece_count),
    operator_reason: operatorReasonLabels.join(locale === "zh" ? "；" : "; "),
    status: exportStatus(candidate, state, locale),
  };
}

function exportStatus(candidate: ReviewCandidateRow, state: OperatorPriceReviewState, locale: string) {
  if (state === "pending") return locale === "zh" ? "需确认" : "Needs confirmation";

  const decision = deriveProcessedDecision(candidate);
  if (locale === "zh") {
    if (decision === "confirmed") return "已确认";
    if (decision === "corrected") return "已修正";
    return "已拒绝";
  }
  if (decision === "confirmed") return "Confirmed";
  if (decision === "corrected") return "Corrected";
  return "Rejected";
}

async function loadMatchedLabelMap(supabase: SupabaseServiceClient, candidates: ReviewCandidateRow[]) {
  const labelMap = new Map<string, string>();
  const materialCodes = Array.from(new Set(candidates
    .filter((candidate) => candidate.matched_entity_type === "material_master")
    .map((candidate) => candidate.matched_entity_id)
    .filter(Boolean))) as string[];
  const competitorIds = Array.from(new Set(candidates
    .filter((candidate) => candidate.matched_entity_type === "competitor_product")
    .map((candidate) => candidate.matched_entity_id)
    .filter(Boolean))) as string[];

  const [materialsResult, competitorsResult] = await Promise.all([
    materialCodes.length > 0
      ? supabase.from("material_master").select("tenant_sku_code,tenant_sku_name").in("tenant_sku_code", materialCodes)
      : Promise.resolve({ data: [] }),
    competitorIds.length > 0
      ? supabase.from("competitor_products").select("id,normalized_name,brands(name)").in("id", competitorIds)
      : Promise.resolve({ data: [] }),
  ]);

  for (const material of (materialsResult.data ?? []) as { tenant_sku_code: string; tenant_sku_name: string }[]) {
    labelMap.set(matchLabelKey("material_master", material.tenant_sku_code), `${material.tenant_sku_code} · ${material.tenant_sku_name}`);
  }
  for (const product of (competitorsResult.data ?? []) as {
    id: string;
    normalized_name: string;
    brands?: { name?: string | null } | { name?: string | null }[] | null;
  }[]) {
    const brand = Array.isArray(product.brands) ? product.brands[0]?.name : product.brands?.name;
    labelMap.set(matchLabelKey("competitor_product", product.id), [brand, product.normalized_name].filter(Boolean).join(" "));
  }
  return labelMap;
}

function resolveMatchedLabel(candidate: ReviewCandidateRow, labelMap: Map<string, string>) {
  if (!candidate.matched_entity_id) return candidate.matched_label ?? null;
  return labelMap.get(matchLabelKey(candidate.matched_entity_type, candidate.matched_entity_id))
    ?? candidate.matched_label
    ?? null;
}

function matchLabelKey(type: string, id: string) {
  return `${type}|${id}`;
}

function requiresProductCorrection(candidate: AiPriceCandidate) {
  return candidate.matched_entity_type === "unmatched"
    || !candidate.matched_entity_id
    || Number(candidate.match_score ?? 0) < MANUAL_MATCH_THRESHOLD
    || (candidate.quality_gate_reason_codes ?? []).includes("SKU_MATCH_UNCERTAIN");
}

function deriveProcessedDecision(candidate: AiPriceCandidate): OperatorPriceReviewDecision {
  if (candidate.status === "rejected") return "rejected";
  const aiPackagePrice = positiveNumber(candidate.ai_package_price_idr ?? candidate.ai_net_price_idr);
  const finalPackagePrice = positiveNumber(candidate.package_price_idr ?? candidate.net_price_idr ?? candidate.parsed_price_idr);
  const aiPieces = positiveInteger(candidate.ai_piece_count);
  const finalPieces = positiveInteger(candidate.reviewed_piece_count ?? candidate.piece_count);
  const ownerChanged = candidate.ai_matched_entity_type !== candidate.matched_entity_type
    || candidate.ai_matched_entity_id !== candidate.matched_entity_id;
  return aiPackagePrice !== finalPackagePrice || aiPieces !== finalPieces || ownerChanged ? "corrected" : "confirmed";
}

async function loadSourceImageMap(supabase: SupabaseServiceClient, candidates: ReviewCandidateRow[]) {
  const imageMap = new Map<string, SourceImageRow>();
  const ids = Array.from(new Set(candidates.map((candidate) => candidate.source_image_id).filter(Boolean))) as string[];
  if (ids.length > 0) {
    const { data } = await supabase
      .from("offline_visit_images")
      .select("id,visit_id,image_path,thumbnail_path,deleted_at,replaced_by_image_id")
      .in("id", ids);
    for (const image of (data ?? []) as SourceImageRow[]) addActiveSourceImage(imageMap, image);
  }

  const fallbackPaths = Array.from(new Set(candidates
    .filter((candidate) => !candidate.source_image_id)
    .map((candidate) => candidate.source_image_path)
    .filter(Boolean))) as string[];
  if (fallbackPaths.length > 0) {
    const { data } = await supabase
      .from("offline_visit_images")
      .select("id,visit_id,image_path,thumbnail_path,deleted_at,replaced_by_image_id")
      .in("image_path", fallbackPaths);
    for (const image of (data ?? []) as SourceImageRow[]) addActiveSourceImage(imageMap, image);
  }
  return imageMap;
}

function addActiveSourceImage(imageMap: Map<string, SourceImageRow>, image: SourceImageRow) {
  if (image.deleted_at || image.replaced_by_image_id) return;
  imageMap.set(image.id, image);
  imageMap.set(`${image.visit_id}|${image.image_path}`, image);
}

function findSourceImage(candidate: ReviewCandidateRow, imageMap: Map<string, SourceImageRow>) {
  if (candidate.source_image_id) {
    const byId = imageMap.get(candidate.source_image_id);
    return byId?.visit_id === candidate.visit_id ? byId : null;
  }
  if (candidate.visit_id && candidate.source_image_path) {
    return imageMap.get(`${candidate.visit_id}|${candidate.source_image_path}`) ?? null;
  }
  return null;
}

async function signImage(supabase: SupabaseServiceClient, path: string) {
  const { data, error } = await supabase.storage.from("offline-visit-images").createSignedUrl(path, 60 * 15);
  return error ? null : data?.signedUrl ?? null;
}

function derivedPerPiece(price: unknown, pieces: unknown) {
  const amount = positiveNumber(price);
  const count = positiveInteger(pieces);
  return amount && count ? Math.round(amount / count * 100) / 100 : null;
}

function positiveNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function positiveInteger(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : null;
}

function escapeIlike(value: string) {
  return value.replaceAll("%", "\\%").replaceAll("_", "\\_").replaceAll(",", " ");
}

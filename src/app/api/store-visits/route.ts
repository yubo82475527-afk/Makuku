import { demoOfflineStoreVisits } from "@/lib/demo-data";
import { createSupabaseServiceClient, hasSupabaseServiceConfig } from "@/lib/supabase";
import { loadActiveAiJobsForVisits } from "@/lib/store-visit-ai-jobs";
import { summarizeVisitPriceHandling } from "@/lib/price-handling-status";
import type { AiPriceCandidate, OfflineStoreVisit, StoreVisitAiResult, StoreVisitAiJobSummary, VisitPriceHandlingSummary } from "@/lib/types";

const defaultPageSize = 20;
const maxPageSize = 50;
const visitListSelect = "id,store_id,store_name,region,channel,city,province,city_name,district,channel_type,visit_date,visit_status,analysis_status,analysis_error,ai_result,created_at,image_urls";

function readPositiveInt(value: string | null, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.floor(parsed));
}

function todayRange() {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

function todayVisitDateValue(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function isVisitOnToday(visit: OfflineStoreVisit, todayVisitDate: string, start: string, end: string) {
  if (visit.visit_date) return visit.visit_date === todayVisitDate;
  return visit.created_at >= start && visit.created_at < end;
}

function isVisibleVisit(visit: OfflineStoreVisit) {
  return visit.visit_status !== "draft";
}

function storeDedupKey(visit: Pick<OfflineStoreVisit, "store_id" | "store_name" | "region" | "channel" | "city" | "channel_type">) {
  if (visit.store_id) return `store:${visit.store_id}`;
  return [
    "fallback",
    visit.store_name?.trim().toLowerCase() ?? "",
    visit.region?.trim().toLowerCase() ?? "",
    visit.channel?.trim().toLowerCase() ?? "",
    visit.city?.trim().toLowerCase() ?? "",
    visit.channel_type?.trim().toLowerCase() ?? "",
  ].join("|");
}

async function loadTodayRowsWithVisitDate(params: {
  supabase: ReturnType<typeof createSupabaseServiceClient>;
  userId: string;
  todayVisitDate: string;
}) {
  const uploaderResult = await params.supabase
    .from("offline_store_visits")
    .select("store_id,store_name,region,channel,city,channel_type")
    .eq("uploader_user_id", params.userId)
    .neq("visit_status", "draft")
    .eq("visit_date", params.todayVisitDate);

  const legacyUserResult = await params.supabase
    .from("offline_store_visits")
    .select("store_id,store_name,region,channel,city,channel_type")
    .eq("user_id", params.userId)
    .is("uploader_user_id", null)
    .neq("visit_status", "draft")
    .eq("visit_date", params.todayVisitDate);

  return {
    uploaderResult,
    legacyUserResult,
    rows: [
      ...((uploaderResult.data ?? []) as OfflineStoreVisit[]),
      ...(legacyUserResult.error ? [] : ((legacyUserResult.data ?? []) as OfflineStoreVisit[])),
    ],
  };
}

async function loadLegacyTodayRowsWithoutVisitDate(params: {
  supabase: ReturnType<typeof createSupabaseServiceClient>;
  userId: string;
  start: string;
  end: string;
}) {
  const uploaderResult = await params.supabase
    .from("offline_store_visits")
    .select("store_id,store_name,region,channel,city,channel_type")
    .eq("uploader_user_id", params.userId)
    .neq("visit_status", "draft")
    .is("visit_date", null)
    .gte("created_at", params.start)
    .lt("created_at", params.end);

  const legacyUserResult = await params.supabase
    .from("offline_store_visits")
    .select("store_id,store_name,region,channel,city,channel_type")
    .eq("user_id", params.userId)
    .is("uploader_user_id", null)
    .neq("visit_status", "draft")
    .is("visit_date", null)
    .gte("created_at", params.start)
    .lt("created_at", params.end);

  return {
    uploaderResult,
    legacyUserResult,
    rows: [
      ...((uploaderResult.data ?? []) as OfflineStoreVisit[]),
      ...(legacyUserResult.error ? [] : ((legacyUserResult.data ?? []) as OfflineStoreVisit[])),
    ],
  };
}

function photoCount(visit: OfflineStoreVisit, photoCountsByVisitId?: Map<string, number>) {
  const legacyCount = Array.isArray(visit.image_urls) ? visit.image_urls.length : 0;
  const rowCount = photoCountsByVisitId?.get(visit.id) ?? visit.offline_visit_images?.length ?? 0;
  return Math.max(legacyCount, rowCount);
}

function formatVisitRegion(visit: OfflineStoreVisit) {
  const structured = [visit.province, visit.city_name, visit.district].map((value) => value?.trim()).filter(Boolean).join(" / ");
  return visit.region ?? structured ?? visit.city ?? null;
}

function serializeVisit(
  visit: OfflineStoreVisit,
  activeAiJob?: StoreVisitAiJobSummary | null,
  photoCountsByVisitId?: Map<string, number>,
  priceHandling?: VisitPriceHandlingSummary,
) {
  const storeSummary = typeof visit.ai_result?.store_summary === "string" ? visit.ai_result.store_summary : null;
  const keySkuPrices = Array.isArray(visit.ai_result?.price_insights?.key_sku_prices)
    ? visit.ai_result.price_insights.key_sku_prices.map((row) => ({
        brand: row.brand,
        product: row.product,
        price: row.price,
        piece_count: row.piece_count,
        tag: row.tag,
        confidence: row.confidence,
      }))
    : [];
  const aiResult = (storeSummary || keySkuPrices.length > 0)
    ? ({
        store_summary: storeSummary ?? "",
        price_insights: {
          brand_price_range: [],
          key_sku_prices: keySkuPrices,
        },
      } as unknown as StoreVisitAiResult)
    : null;
  return {
    id: visit.id,
    store_name: visit.store_name,
    region: formatVisitRegion(visit),
    channel: visit.channel ?? visit.channel_type ?? null,
    city: formatVisitRegion(visit),
    channel_type: visit.channel_type,
    visit_date: visit.visit_date,
    visit_status: visit.visit_status,
    analysis_status: visit.analysis_status ?? "pending",
    analysis_error: visit.analysis_error ?? null,
    price_handling: priceHandling ?? summarizeVisitPriceHandling({
      analysis_status: visit.analysis_status,
      active_job_status: activeAiJob?.status ?? null,
      candidates: [],
    }),
    ai_result: aiResult,
    image_urls: visit.image_urls ?? [],
    photo_count: photoCount(visit, photoCountsByVisitId),
    created_at: visit.created_at,
    active_ai_job: activeAiJob ?? null,
  };
}

function filterDemoVisits(userId: string) {
  return demoOfflineStoreVisits
    .filter((visit) => visit.user_id === userId || visit.uploader_user_id === userId)
    .filter(isVisibleVisit)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

function dedupeAndSortVisits(rows: OfflineStoreVisit[]) {
  const byId = new Map<string, OfflineStoreVisit>();
  for (const row of rows) {
    if (!byId.has(row.id)) byId.set(row.id, row);
  }
  return [...byId.values()].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

async function loadVisitPageRows(params: {
  supabase: ReturnType<typeof createSupabaseServiceClient>;
  userId: string;
  from: number;
  pageSize: number;
}) {
  const pageFetchLimit = params.from + params.pageSize + 1;
  const fetchTo = pageFetchLimit - 1;
  const uploaderResult = await params.supabase
    .from("offline_store_visits")
    .select(visitListSelect)
    .eq("uploader_user_id", params.userId)
    .neq("visit_status", "draft")
    .order("created_at", { ascending: false })
    .range(0, fetchTo);

  if (uploaderResult.error) return { error: uploaderResult.error, rows: [] as OfflineStoreVisit[] };

  const legacyUserResult = await params.supabase
    .from("offline_store_visits")
    .select(visitListSelect)
    .eq("user_id", params.userId)
    .is("uploader_user_id", null)
    .neq("visit_status", "draft")
    .order("created_at", { ascending: false })
    .range(0, fetchTo);

  const rows = dedupeAndSortVisits([
    ...((uploaderResult.data ?? []) as OfflineStoreVisit[]),
    ...(legacyUserResult.error ? [] : ((legacyUserResult.data ?? []) as OfflineStoreVisit[])),
  ]);

  return { error: null, rows };
}

async function loadPhotoCountsByVisitId(params: {
  supabase: ReturnType<typeof createSupabaseServiceClient>;
  visitIds: string[];
}) {
  if (params.visitIds.length === 0) return new Map<string, number>();
  const { data, error } = await params.supabase
    .from("offline_visit_images")
    .select("visit_id")
    .in("visit_id", params.visitIds);
  if (error) return new Map<string, number>();

  const counts = new Map<string, number>();
  for (const row of data ?? []) {
    const visitId = String((row as { visit_id?: unknown }).visit_id ?? "");
    if (!visitId) continue;
    counts.set(visitId, (counts.get(visitId) ?? 0) + 1);
  }
  return counts;
}

async function loadPriceHandlingCandidatesForVisits(params: {
  supabase: ReturnType<typeof createSupabaseServiceClient>;
  visitIds: string[];
}) {
  if (params.visitIds.length === 0) return new Map<string, AiPriceCandidate[]>();
  const { data, error } = await params.supabase
    .from("ai_price_candidates")
    .select("visit_id,status,review_decision,quality_gate_status,quality_gate_attempt_count,h5_lifecycle_status")
    .in("visit_id", params.visitIds);
  if (error) throw new Error(error.message);

  const byVisitId = new Map<string, AiPriceCandidate[]>();
  for (const row of (data ?? []) as AiPriceCandidate[]) {
    if (!row.visit_id || row.h5_lifecycle_status === "deleted" || row.h5_lifecycle_status === "replaced" || row.h5_lifecycle_status === "reanalyzed") continue;
    const candidates = byVisitId.get(row.visit_id) ?? [];
    candidates.push(row);
    byVisitId.set(row.visit_id, candidates);
  }
  return byVisitId;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("user_id")?.trim() || "";
    const page = readPositiveInt(searchParams.get("page"), 1);
    const pageSize = Math.min(readPositiveInt(searchParams.get("page_size"), defaultPageSize), maxPageSize);
    const from = (page - 1) * pageSize;

    if (!userId) {
      return Response.json({ error: "user_id is required" }, { status: 400 });
    }

    if (!hasSupabaseServiceConfig()) {
      const visits = filterDemoVisits(userId);
      const paged = visits.slice(from, from + pageSize);
      const todayVisitDate = todayVisitDateValue();
      const { start, end } = todayRange();
      const todayRows = visits.filter((visit) => isVisitOnToday(visit, todayVisitDate, start, end));
      return Response.json({
        visits: paged.map((visit) => serializeVisit(visit)),
        pagination: {
          page,
          page_size: pageSize,
          total: visits.length,
          has_next: from + pageSize < visits.length,
        },
        today_count: new Set(todayRows.map(storeDedupKey)).size,
        demo: true,
      });
    }

    const supabase = createSupabaseServiceClient();
    const visitsResult = await loadVisitPageRows({
      supabase,
      userId,
      from,
      pageSize,
    });

    if (visitsResult.error) {
      return Response.json({ error: visitsResult.error.message }, { status: 400 });
    }

    const todayVisitDate = todayVisitDateValue();
    const { start, end } = todayRange();
    const visitDateRowsResult = await loadTodayRowsWithVisitDate({
      supabase,
      userId,
      todayVisitDate,
    });
    const legacyRowsResult = await loadLegacyTodayRowsWithoutVisitDate({
      supabase,
      userId,
      start,
      end,
    });
    const todayRows = [...visitDateRowsResult.rows, ...legacyRowsResult.rows];

    const rows = visitsResult.rows;
    const fetchTo = from + pageSize;
    const hasNext = rows.length > fetchTo;
    const pagedRows = rows.slice(from, from + pageSize);
    const visitIds = pagedRows.map((visit) => visit.id);
    const [activeJobsByVisitId, photoCountsByVisitId, candidatesByVisitId] = await Promise.all([
      loadActiveAiJobsForVisits({
        supabase,
        visitIds,
      }),
      loadPhotoCountsByVisitId({
        supabase,
        visitIds,
      }),
      loadPriceHandlingCandidatesForVisits({
        supabase,
        visitIds,
      }),
    ]);
    const priceHandlingByVisitId = new Map(pagedRows.map((visit) => {
      const activeAiJob = activeJobsByVisitId.get(visit.id) ?? null;
      return [visit.id, summarizeVisitPriceHandling({
        analysis_status: visit.analysis_status,
        active_job_status: activeAiJob?.status ?? null,
        candidates: candidatesByVisitId.get(visit.id) ?? [],
      })] as const;
    }));

    return Response.json({
      visits: pagedRows.map((visit) => serializeVisit(
        visit,
        activeJobsByVisitId.get(visit.id) ?? null,
        photoCountsByVisitId,
        priceHandlingByVisitId.get(visit.id),
      )),
      pagination: {
        page,
        page_size: pageSize,
        total: from + pagedRows.length + (hasNext ? 1 : 0),
        has_next: hasNext,
      },
      today_count: new Set(todayRows.map(storeDedupKey)).size,
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}

import { readFileSync } from "node:fs";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";

function loadEnvFile() {
  const raw = readFileSync(".env.local", "utf8");
  for (const line of raw.split(/\r?\n/)) {
    if (!line || line.trimStart().startsWith("#")) continue;
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match) continue;
    const [, key, value] = match;
    if (!process.env[key]) process.env[key] = value;
  }
}

function parseIdrPrice(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const digits = raw.replace(/[^\d]/g, "");
  if (!digits) return null;
  const parsed = Number(digits);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function normalizeText(value) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function candidateKey({ sourceImageId, sourceRowIndex, matchedEntityType, matchedEntityId, netPrice, product, brand, pieceCount }) {
  if (sourceImageId && netPrice) {
    return [
      "image_entity_price",
      sourceImageId,
      String(sourceRowIndex ?? ""),
      matchedEntityType,
      matchedEntityId ?? "",
      String(netPrice),
    ].join("|");
  }

  return [
    normalizeText(brand),
    normalizeText(product),
    String(netPrice ?? ""),
    String(pieceCount ?? ""),
    "SKU",
  ].join("|");
}

function buildWarnings(row) {
  const warnings = [];
  if (!row.brand) warnings.push({ type: "MISSING_DATA", message: "AI did not extract a brand." });
  if (!row.piece_count) warnings.push({ type: "MISSING_DATA", message: "Missing piece count; per-piece price cannot be calculated." });
  if (typeof row.ai_confidence === "number" && row.ai_confidence < 0.5) {
    warnings.push({ type: "LOW_CONFIDENCE", message: "AI extraction confidence is below 50%." });
  }
  if (row.review_decision === "NEED_REVIEW") {
    warnings.push({ type: "PARSE_RISK", message: "Candidate requires manual review." });
  }
  return warnings;
}

function rowMatchesCandidate(row, candidate, rowIndex) {
  if (candidate.h5_lifecycle_status === "deleted") return false;
  if (candidate.source_row_index === rowIndex) return true;
  const rowSku = normalizeText(row.sku);
  return normalizeText(candidate.raw_product) === rowSku
    && Number(candidate.net_price_idr ?? candidate.parsed_price_idr ?? null) === Number(row.net_price_idr ?? null)
    && Number(candidate.piece_count ?? null) === Number(row.piece_count ?? null);
}

loadEnvFile();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  throw new Error("Missing Supabase environment variables");
}

const supabase = createClient(url, key, { auth: { persistSession: false } });
const visitCode = process.argv[2] || "ST202607030004";

const { data: visit, error: visitError } = await supabase
  .from("offline_store_visits")
  .select("id,visit_code")
  .eq("visit_code", visitCode)
  .maybeSingle();
if (visitError || !visit) throw new Error(visitError?.message ?? `Visit ${visitCode} not found`);

const { data: images, error: imagesError } = await supabase
  .from("offline_visit_images")
  .select("id,deleted_at,replaced_by_image_id,vision_result")
  .eq("visit_id", visit.id);
if (imagesError) throw new Error(imagesError.message);

const { data: existingCandidates, error: candidatesError } = await supabase
  .from("ai_price_candidates")
  .select("*")
  .eq("visit_id", visit.id);
if (candidatesError) throw new Error(candidatesError.message);

const candidateCountBefore = existingCandidates?.length ?? 0;
const rowIndexUpdates = [];
const rowsToInsert = [];
const claimedCandidateIds = new Set();

for (const image of images ?? []) {
  if (image.deleted_at || image.replaced_by_image_id) continue;
  const result = image.vision_result;
  const rows = Array.isArray(result?.rows) ? result.rows : [];
  rows.forEach((row, rowIndex) => {
    const netPrice = Number(row.net_price_idr ?? parseIdrPrice(row.net_price_text) ?? 0);
    if (!Number.isFinite(netPrice) || netPrice <= 0) return;
    const nextCandidateKey = candidateKey({
      sourceImageId: image.id,
      sourceRowIndex: rowIndex,
      matchedEntityType: "unmatched",
      matchedEntityId: null,
      netPrice,
      product: row.sku,
      brand: row.brand ?? "Unknown",
      pieceCount: row.piece_count ?? null,
    });

    const existingExactCandidate = (existingCandidates ?? []).find((candidate) => (
      candidate.source_image_id === image.id
      && candidate.source_row_index === rowIndex
      && candidate.h5_lifecycle_status !== "deleted"
    ));
    if (existingExactCandidate) {
      claimedCandidateIds.add(existingExactCandidate.id);
      return;
    }

    const legacyCandidate = (existingCandidates ?? []).find((candidate) => (
      candidate.source_image_id === image.id
      && candidate.source_row_index == null
      && !claimedCandidateIds.has(candidate.id)
      && rowMatchesCandidate(row, candidate, rowIndex)
    ));
    if (legacyCandidate) {
      claimedCandidateIds.add(legacyCandidate.id);
      const legacyNetPrice = Number(legacyCandidate.net_price_idr ?? legacyCandidate.parsed_price_idr ?? netPrice);
      rowIndexUpdates.push({
        id: legacyCandidate.id,
        source_row_index: rowIndex,
        candidate_key: candidateKey({
          sourceImageId: image.id,
          sourceRowIndex: rowIndex,
          matchedEntityType: legacyCandidate.matched_entity_type ?? "unmatched",
          matchedEntityId: legacyCandidate.matched_entity_id ?? null,
          netPrice: Number.isFinite(legacyNetPrice) && legacyNetPrice > 0 ? legacyNetPrice : netPrice,
          product: legacyCandidate.raw_product ?? row.sku,
          brand: legacyCandidate.raw_brand ?? row.brand ?? "Unknown",
          pieceCount: legacyCandidate.piece_count ?? row.piece_count ?? null,
        }),
      });
      return;
    }

    rowsToInsert.push({
      visit_id: visit.id,
      candidate_key: nextCandidateKey,
      source_image_id: image.id,
      source_row_index: rowIndex,
      raw_brand: row.brand ?? "Unknown",
      raw_product: row.sku,
      raw_price: String(netPrice),
      parsed_price_idr: netPrice,
      ai_list_price_idr: row.list_price_idr ?? netPrice,
      ai_package_price_idr: row.package_price_idr ?? netPrice,
      ai_net_price_idr: row.net_price_idr ?? netPrice,
      list_price_idr: row.list_price_idr ?? netPrice,
      package_price_idr: row.package_price_idr ?? netPrice,
      net_price_idr: row.net_price_idr ?? netPrice,
      raw_piece_count_text: row.piece_count_text ?? null,
      raw_package_price_text: row.package_price_text ?? null,
      raw_net_price_text: row.net_price_text ?? null,
      raw_price_per_piece_text: row.visible_price_per_piece_text ?? null,
      visible_price_per_piece_idr: row.visible_price_per_piece_idr ?? null,
      price_basis: row.price_basis ?? null,
      promo_type: row.promo_type ?? null,
      ai_piece_count: row.piece_count ?? null,
      ai_price_per_piece: row.price_per_piece_idr ?? null,
      ai_promo_type: row.promo_type ?? null,
      piece_count: row.piece_count ?? null,
      price_per_piece: row.price_per_piece_idr ?? null,
      candidate_type: "SKU",
      ai_confidence: row.ai_confidence ?? null,
      legacy_confidence_fallback: row.legacy_confidence_fallback ?? row.ai_confidence === null,
      price_evidence_status: row.price_evidence_status ?? null,
      price_evidence_confidence: row.price_evidence_confidence ?? null,
      price_evidence_detail: row.price_evidence_detail ?? null,
      conflicts: row.conflicts ?? [],
      review_decision: row.review_decision ?? "NEED_REVIEW",
      ai_matched_entity_type: "unmatched",
      ai_matched_entity_id: null,
      ai_matched_label: null,
      matched_entity_type: "unmatched",
      matched_entity_id: null,
      matched_label: null,
      match_score: 0,
      warnings: buildWarnings(row),
      status: "pending",
    });
  });
}

for (const update of rowIndexUpdates) {
  const { error: updateError } = await supabase
    .from("ai_price_candidates")
    .update({
      source_row_index: update.source_row_index,
      candidate_key: update.candidate_key,
    })
    .eq("id", update.id);
  if (updateError) throw new Error(updateError.message);
}

if (rowsToInsert.length > 0) {
  let { error: insertError } = await supabase
    .from("ai_price_candidates")
    .insert(rowsToInsert);

  if (insertError?.message?.includes("source_row_index")) {
    const legacyRows = rowsToInsert.map(({ source_row_index: _sourceRowIndex, ...row }) => {
      void _sourceRowIndex;
      return row;
    });
    const legacyInsert = await supabase.from("ai_price_candidates").insert(legacyRows);
    insertError = legacyInsert.error;
  }

  if (insertError) throw new Error(insertError.message);
}

const { count: candidateCountAfter, error: countError } = await supabase
  .from("ai_price_candidates")
  .select("*", { count: "exact", head: true })
  .eq("visit_id", visit.id);
if (countError) throw new Error(countError.message);

console.log(JSON.stringify({
  visitCode,
  candidateCountBefore,
  updatedCount: rowIndexUpdates.length,
  insertedCount: rowsToInsert.length,
  candidateCountAfter,
  note: "Backfill mirrors generateAiPriceCandidates for H5-visible rows and repairs source_row_index on legacy candidates.",
}, null, 2));

# Store Visit Price Candidate Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every H5-visible store visit price row have a corresponding editable `ai_price_candidates` row, including historical visits affected by upload/analyze timing races.

**Architecture:** Treat `ai_price_candidates` as the business source of truth for H5 price rows, with `offline_visit_images.vision_result.rows` as immutable AI evidence and rebuild input. Add one idempotent sync layer that can rebuild missing candidates from persisted image rows, then call it from detail loading, AI job completion, refresh flows, and a backfill endpoint/script so race conditions cannot leave visible rows without editable candidates.

**Tech Stack:** Next.js 16 route handlers, Supabase service client, TypeScript, Node test runner static tests plus a focused mocked Supabase unit test.

---

## File Map

- Create: `src/lib/store-visit-price-candidate-sync.ts`
  - Owns the invariant: active price-image `vision_result.rows` with valid SKU and price must have active `ai_price_candidates`.
  - Converts persisted image rows to the same source-item shape used by `generateAiPriceCandidates`.
  - Runs idempotently for one visit, optionally scoped to image ids.

- Modify: `src/lib/ai-price-candidates.ts`
  - Export a small reusable source-item type and candidate-generation entrypoint for persisted image rows.
  - Keep existing H5 filtering rules in one place.

- Modify: `src/app/api/store-visit/[id]/route.ts`
  - Run sync before returning visit details so H5 never receives display rows without candidates.

- Modify: `src/lib/store-visit-ai-jobs.ts`
  - Run sync after each job item finishes and after job completion.
  - Add a stable-image guard to watchdog enqueue so it does not freeze `target_image_ids` while uploads are still arriving.

- Modify: `src/app/api/store-visit/[id]/refresh/route.ts`
  - Run sync after refresh/reanalysis succeeds for affected images.

- Create: `src/app/api/internal/store-visit/price-candidates/sync/route.ts`
  - Internal repair endpoint for one visit or a limited batch.

- Create: `scripts/sync-store-visit-price-candidates.mjs`
  - CLI backfill for historical data, using service-role Supabase config.

- Modify: `tests/offline-price-candidates-ui.test.mjs`
  - Add static assertions that the detail API, AI jobs, refresh route, and internal repair endpoint call the sync layer.

- Create: `tests/store-visit-price-candidate-sync.test.mjs`
  - Focused mocked unit test for the sync helper: missing row is inserted, existing row is not duplicated, invalid row is skipped.

- Optional migration if current constraints are insufficient: `supabase/migrations/202607070002_ai_price_candidates_h5_row_identity.sql`
  - Add a partial unique index for active H5 row identity if no equivalent index already exists.

---

## Invariant

For every active image under a store visit:

- `image_type` is `own_shelf` or `competitor_shelf`
- `deleted_at is null`
- `replaced_by_image_id is null`
- `vision_result.schema_version === "store_visit_price_image_v1"`
- `vision_result.rows[index]` has a non-empty `sku`
- `vision_result.rows[index].net_price_idr` parses as a valid candidate price

There must be exactly one active candidate with:

- `visit_id = visit.id`
- `source_image_id = image.id`
- `source_row_index = index`
- `h5_lifecycle_status is null` or not in terminal hidden states

Rows that do not satisfy the H5-visible candidate filter stay as evidence only and do not become editable business rows.

---

### Task 1: Extract Reusable Candidate Source Types And Filters

**Files:**
- Modify: `src/lib/ai-price-candidates.ts`
- Test: `tests/offline-price-candidates-ui.test.mjs`

- [ ] **Step 1: Add static test coverage for exported sync helpers**

Append this test to `tests/offline-price-candidates-ui.test.mjs`:

```js
test("store visit price candidate generation exposes reusable H5 row helpers", () => {
  const aiPriceCandidates = readFileSync("src/lib/ai-price-candidates.ts", "utf8");
  assert.match(aiPriceCandidates, /export type AiPriceCandidateSourceItem/);
  assert.match(aiPriceCandidates, /export function isH5VisiblePriceCandidate/);
  assert.match(aiPriceCandidates, /export function buildAiPriceCandidateRows/);
  assert.match(aiPriceCandidates, /export async function insertAiPriceCandidateRows/);
});
```

- [ ] **Step 2: Run the focused test and confirm it fails**

Run:

```bash
node --test tests/offline-price-candidates-ui.test.mjs
```

Expected: FAIL because the exports do not exist yet.

- [ ] **Step 3: Export the source item type and filter**

In `src/lib/ai-price-candidates.ts`, rename the private `SourceItem` type to this exported type:

```ts
export type AiPriceCandidateSourceItem = {
  brand: string;
  product: string;
  price: string;
  list_price?: string | null;
  package_price?: string | null;
  net_price?: string | null;
  promo_type?: string | null;
  piece_count: number | null;
  raw_piece_count_text?: string | null;
  raw_package_price_text?: string | null;
  raw_net_price_text?: string | null;
  raw_price_per_piece_text?: string | null;
  visible_price_per_piece_idr?: number | null;
  price_basis?: string | null;
  legacy_confidence_fallback?: boolean | null;
  price_evidence_status?: PriceEvidenceStatus | null;
  price_evidence_confidence?: number | null;
  price_evidence_detail?: Record<string, unknown> | null;
  conflicts?: Warning[] | null;
  review_decision?: PriceReviewDecision | null;
  type: "SKU" | "PROMO";
  tag?: string | null;
  confidence: number | null;
  source: "key_sku" | "raw";
  sourceImageId?: string | null;
  sourceImagePath?: string | null;
  sourceRowIndex?: number | null;
};
```

Update references from `SourceItem` to `AiPriceCandidateSourceItem`.

- [ ] **Step 4: Export the H5-visible filter**

Change:

```ts
function isH5VisiblePriceCandidate(item: AiPriceCandidateSourceItem) {
```

to:

```ts
export function isH5VisiblePriceCandidate(item: AiPriceCandidateSourceItem) {
```

- [ ] **Step 5: Split row construction from insertion**

Create two exported helpers inside `src/lib/ai-price-candidates.ts`:

```ts
export async function buildAiPriceCandidateRows(input: {
  visitId: string;
  sourceItems: AiPriceCandidateSourceItem[];
  supabase?: ReturnType<typeof createSupabaseServiceClient>;
}) {
  const supabase = input.supabase ?? createSupabaseServiceClient();
  const scopedItems = input.sourceItems
    .map((item) => ({
      ...item,
      piece_count: normalizePieceCountFromEvidence(item.piece_count, item.raw_piece_count_text, item.product),
    }))
    .filter(isH5VisiblePriceCandidate)
    .filter((item) => item.sourceImageId);

  if (scopedItems.length === 0) return [];

  const [{ data: materials }, { data: products }] = await Promise.all([
    supabase.from("material_master").select("*").limit(5000),
    supabase.from("competitor_products").select("*, brands(id,name)").limit(5000),
  ]);

  return scopedItems.map((item) => buildAiPriceCandidateRow({
    visitId: input.visitId,
    item,
    materials: (materials ?? []) as MaterialMaster[],
    products: (products ?? []) as CompetitorProduct[],
  }));
}

export async function insertAiPriceCandidateRows(input: {
  visitId: string;
  rows: Array<Record<string, unknown> & { candidate_key: string }>;
  affectedImageIds?: string[];
  supabase?: ReturnType<typeof createSupabaseServiceClient>;
}) {
  const supabase = input.supabase ?? createSupabaseServiceClient();
  if (input.rows.length === 0) return [];

  if (input.affectedImageIds && input.affectedImageIds.length > 0) {
    await supabase
      .from("ai_price_candidates")
      .delete()
      .eq("visit_id", input.visitId)
      .in("source_image_id", input.affectedImageIds)
      .neq("status", "approved");
  } else {
    await supabase
      .from("ai_price_candidates")
      .delete()
      .eq("visit_id", input.visitId)
      .neq("status", "approved");
  }

  const { data: activeCandidateRows, error: activeCandidateError } = await supabase
    .from("ai_price_candidates")
    .select("candidate_key")
    .eq("visit_id", input.visitId)
    .in("status", ["pending", "approved"]);
  if (activeCandidateError && !isCandidateKeyColumnError(activeCandidateError)) {
    throw new Error(activeCandidateError.message);
  }

  const existingActiveKeys = new Set((activeCandidateRows ?? [])
    .map((row) => (row as { candidate_key?: string | null }).candidate_key)
    .filter(Boolean) as string[]);
  const seenInsertKeys = new Set<string>();
  const rows = input.rows.filter((row) => {
    if (existingActiveKeys.has(row.candidate_key) || seenInsertKeys.has(row.candidate_key)) return false;
    seenInsertKeys.add(row.candidate_key);
    return true;
  });
  if (rows.length === 0) return [];

  let { data, error } = await supabase
    .from("ai_price_candidates")
    .insert(rows)
    .select(candidateVisitSelect);

  if (isExtendedCandidateColumnError(error)) {
    const legacyRows = rows.map(({ source_row_index: _sourceRowIndex, ...row }) => {
      void _sourceRowIndex;
      return row;
    });
    const legacyInsert = await supabase
      .from("ai_price_candidates")
      .insert(legacyRows)
      .select(candidateVisitSelect);
    data = legacyInsert.data;
    error = legacyInsert.error;
  }

  if (isMissingCandidateTableError(error)) return [];
  if (error) throw new Error(error.message);
  return (data ?? []) as AiPriceCandidate[];
}
```

Then rewrite `generateAiPriceCandidates` to call these helpers while preserving existing behavior:

```ts
export async function generateAiPriceCandidates(input: CandidateInput) {
  if (!hasSupabaseServiceConfig()) return [];
  const supabase = createSupabaseServiceClient();
  const source = input.sourceItems ?? sourceItems(input.aiResult);
  const rows = await buildAiPriceCandidateRows({
    visitId: input.visitId,
    sourceItems: source,
    supabase,
  });
  return insertAiPriceCandidateRows({
    visitId: input.visitId,
    rows,
    affectedImageIds: input.affectedImageIds,
    supabase,
  });
}
```

Add this private helper immediately above `buildAiPriceCandidateRows` by moving the current `candidateRows = scopedItems.map((item) => { ... })` body into it without changing payload field names:

```ts
function buildAiPriceCandidateRow(input: {
  visitId: string;
  item: AiPriceCandidateSourceItem;
  materials: MaterialMaster[];
  products: CompetitorProduct[];
}) {
  const { item } = input;
  const parsedPrice = parseCandidatePrice(item.price);
  const pieceCount = normalizePieceCountFromEvidence(item.piece_count, item.raw_piece_count_text, item.product);
  const visiblePricePerPiece = parseCandidatePrice(item.raw_price_per_piece_text) ?? item.visible_price_per_piece_idr ?? null;
  const reconciledPrices = reconcilePackagePriceMetrics({
    listPriceIdr: parseCandidatePrice(item.list_price) ?? parsedPrice,
    packagePriceIdr: parseCandidatePrice(item.package_price) ?? parsedPrice,
    netPriceIdr: parseCandidatePrice(item.net_price) ?? parsedPrice,
    pieceCount,
    visiblePricePerPieceIdr: visiblePricePerPiece,
    listPriceText: item.list_price,
    packagePriceText: item.package_price,
    netPriceText: item.net_price,
    visiblePricePerPieceText: item.raw_price_per_piece_text,
    pieceCountText: item.raw_piece_count_text,
    skuText: item.product,
  });
  const listPrice = reconciledPrices.listPriceIdr ?? parsedPrice;
  const packagePrice = reconciledPrices.packagePriceIdr ?? parsedPrice;
  const netPrice = reconciledPrices.netPriceIdr ?? parsedPrice;
  const pricePerPiece = reconciledPrices.pricePerPieceIdr;
  const warnings: Warning[] = [];
  if (!item.brand) warnings.push({ type: "MISSING_DATA", message: "AI did not extract a brand." });
  if (!item.product) warnings.push({ type: "MISSING_DATA", message: "AI did not extract a product name." });
  if (!parsedPrice) warnings.push({ type: "MISSING_DATA", message: "AI price could not be parsed into a number." });
  if (!pieceCount) warnings.push({ type: "MISSING_DATA", message: "Missing piece count; per-piece price cannot be calculated." });
  if (item.confidence === null) warnings.push({ type: "PARSE_RISK", message: "Legacy visual association confidence is missing; manual review required." });
  if (item.confidence !== null && item.confidence < 0.5) warnings.push({ type: "LOW_CONFIDENCE", message: "AI extraction confidence is below 50%." });
  if (reconciledPrices.warningMessage) warnings.push({ type: "PARSE_RISK", message: reconciledPrices.warningMessage });

  const isOwnBrandCandidate = isMakukuBrand(item.brand);
  const materialMatch = isOwnBrandCandidate
    ? pickBestMaterial({ brand: item.brand, product: item.product, parsedPrice, pieceCount }, input.materials)
    : null;
  const competitorMatch = !materialMatch && !isOwnBrandCandidate
    ? pickBestCompetitor({ brand: item.brand, product: item.product, pieceCount }, input.products)
    : null;
  const matchScore = materialMatch?.score ?? competitorMatch?.score ?? 0;
  const matchedEntityType = materialMatch ? "material_master" : competitorMatch ? "competitor_product" : "unmatched";
  const matchedEntityId = materialMatch?.item.tenant_sku_code ?? competitorMatch?.item.id ?? null;
  const itemCandidateKey = candidateKey({ item, matchedEntityType, matchedEntityId, netPrice });
  if (matchScore < 0.65) warnings.push({ type: "LOW_CONFIDENCE", message: "No reliable product/master-data match found." });

  return {
    visit_id: input.visitId,
    candidate_key: itemCandidateKey,
    source_image_id: item.sourceImageId ?? null,
    source_image_path: item.sourceImagePath ?? null,
    source_row_index: item.sourceRowIndex ?? null,
    raw_brand: item.brand,
    raw_product: item.product,
    raw_price: item.price,
    ai_matched_entity_type: matchedEntityType,
    ai_matched_entity_id: matchedEntityId,
    ai_matched_label: materialMatch ? materialLabel(materialMatch.item) : competitorMatch ? competitorLabel(competitorMatch.item) : null,
    ai_list_price_idr: listPrice,
    ai_package_price_idr: packagePrice,
    ai_net_price_idr: netPrice,
    ai_piece_count: pieceCount,
    ai_price_per_piece: pricePerPiece,
    ai_promo_type: normalizePromoType(item.promo_type),
    parsed_price_idr: netPrice,
    list_price_idr: listPrice,
    package_price_idr: packagePrice,
    net_price_idr: netPrice,
    raw_piece_count_text: item.raw_piece_count_text ?? null,
    raw_package_price_text: item.raw_package_price_text ?? null,
    raw_net_price_text: item.raw_net_price_text ?? null,
    raw_price_per_piece_text: item.raw_price_per_piece_text ?? null,
    visible_price_per_piece_idr: reconciledPrices.visiblePricePerPieceIdr,
    price_basis: reconciledPrices.priceBasis,
    promo_type: normalizePromoType(item.promo_type),
    piece_count: pieceCount,
    price_per_piece: pricePerPiece,
    candidate_type: item.type,
    ai_confidence: item.confidence,
    legacy_confidence_fallback: item.legacy_confidence_fallback ?? item.confidence === null,
    price_evidence_status: item.price_evidence_status ?? reconciledPrices.priceEvidenceStatus,
    price_evidence_confidence: item.price_evidence_confidence ?? reconciledPrices.priceEvidenceConfidence,
    price_evidence_detail: item.price_evidence_detail ?? reconciledPrices.priceEvidenceDetail,
    conflicts: item.conflicts ?? reconciledPrices.conflicts,
    review_decision: item.review_decision ?? reconciledPrices.reviewDecision,
    matched_entity_type: matchedEntityType,
    matched_entity_id: matchedEntityId,
    matched_label: materialMatch ? materialLabel(materialMatch.item) : competitorMatch ? competitorLabel(competitorMatch.item) : null,
    match_score: matchScore,
    warnings,
    status: "pending",
  };
}
```

- [ ] **Step 6: Run the focused test**

Run:

```bash
node --test tests/offline-price-candidates-ui.test.mjs
```

Expected: PASS.

---

### Task 2: Add Persisted Image Row Sync Helper

**Files:**
- Create: `src/lib/store-visit-price-candidate-sync.ts`
- Create: `tests/store-visit-price-candidate-sync.test.mjs`

- [ ] **Step 1: Write unit tests for sync behavior**

Create `tests/store-visit-price-candidate-sync.test.mjs` with focused source assertions and a mock-contract check:

```js
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const syncPath = "src/lib/store-visit-price-candidate-sync.ts";
const syncFile = existsSync(syncPath) ? readFileSync(syncPath, "utf8") : "";

test("store visit price candidate sync reads persisted price image rows", () => {
  assert.match(syncFile, /export async function syncStoreVisitPriceCandidatesFromImages/);
  assert.match(syncFile, /offline_visit_images/);
  assert.match(syncFile, /vision_result/);
  assert.match(syncFile, /schema_version === "store_visit_price_image_v1"/);
  assert.match(syncFile, /sourceRowIndex: rowIndex/);
});

test("store visit price candidate sync only inserts missing row identities", () => {
  assert.match(syncFile, /source_image_id/);
  assert.match(syncFile, /source_row_index/);
  assert.match(syncFile, /existingRowKeys/);
  assert.match(syncFile, /insertAiPriceCandidateRows/);
});
```

- [ ] **Step 2: Run test and confirm it fails**

Run:

```bash
node --test tests/store-visit-price-candidate-sync.test.mjs
```

Expected: FAIL because the file does not exist.

- [ ] **Step 3: Create the sync helper**

Create `src/lib/store-visit-price-candidate-sync.ts`:

```ts
import {
  buildAiPriceCandidateRows,
  insertAiPriceCandidateRows,
  type AiPriceCandidateSourceItem,
} from "@/lib/ai-price-candidates";
import { createSupabaseServiceClient } from "@/lib/supabase";
import type { StoreVisitPriceImageAnalysis } from "@/lib/types";

type SupabaseServiceClient = ReturnType<typeof createSupabaseServiceClient>;

type PriceImageRow = {
  id: string;
  visit_id: string;
  image_path: string | null;
  image_type: string | null;
  deleted_at?: string | null;
  replaced_by_image_id?: string | null;
  vision_result: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asPriceImageAnalysis(value: unknown): StoreVisitPriceImageAnalysis | null {
  if (!isRecord(value) || value.schema_version !== "store_visit_price_image_v1" || !Array.isArray(value.rows)) {
    return null;
  }
  return value as unknown as StoreVisitPriceImageAnalysis;
}

function sourceItemsFromImage(image: PriceImageRow): AiPriceCandidateSourceItem[] {
  const result = asPriceImageAnalysis(image.vision_result);
  if (!result) return [];

  return result.rows.map((row, rowIndex) => ({
    brand: row.brand ?? "Unknown",
    product: row.sku,
    price: row.net_price_idr ? String(row.net_price_idr) : "",
    list_price: row.list_price_idr ? String(row.list_price_idr) : null,
    package_price: row.package_price_idr ? String(row.package_price_idr) : null,
    net_price: row.net_price_idr ? String(row.net_price_idr) : null,
    promo_type: row.promo_type,
    piece_count: row.piece_count,
    raw_piece_count_text: row.piece_count_text,
    raw_package_price_text: row.package_price_text,
    raw_net_price_text: row.net_price_text,
    raw_price_per_piece_text: row.visible_price_per_piece_text,
    visible_price_per_piece_idr: row.visible_price_per_piece_idr,
    price_basis: row.price_basis,
    legacy_confidence_fallback: row.legacy_confidence_fallback,
    price_evidence_status: row.price_evidence_status,
    price_evidence_confidence: row.price_evidence_confidence,
    price_evidence_detail: row.price_evidence_detail,
    review_decision: row.review_decision,
    conflicts: row.conflicts,
    type: "SKU",
    tag: "HERO",
    confidence: row.ai_confidence ?? null,
    source: "key_sku",
    sourceImageId: image.id,
    sourceImagePath: image.image_path,
    sourceRowIndex: rowIndex,
  }));
}

function rowKey(imageId: string | null | undefined, rowIndex: number | null | undefined) {
  return `${imageId ?? ""}:${rowIndex ?? ""}`;
}

export async function syncStoreVisitPriceCandidatesFromImages(input: {
  visitId: string;
  imageIds?: string[];
  supabase?: SupabaseServiceClient;
}) {
  const supabase = input.supabase ?? createSupabaseServiceClient();
  const imageIdFilter = Array.from(new Set((input.imageIds ?? []).map((value) => value.trim()).filter(Boolean)));

  let imageQuery = supabase
    .from("offline_visit_images")
    .select("id,visit_id,image_path,image_type,deleted_at,replaced_by_image_id,vision_result")
    .eq("visit_id", input.visitId)
    .in("image_type", ["own_shelf", "competitor_shelf"])
    .is("deleted_at", null)
    .is("replaced_by_image_id", null);
  if (imageIdFilter.length > 0) imageQuery = imageQuery.in("id", imageIdFilter);

  const { data: images, error: imageError } = await imageQuery;
  if (imageError) throw new Error(imageError.message);

  const sourceItems = ((images ?? []) as PriceImageRow[]).flatMap(sourceItemsFromImage);
  if (sourceItems.length === 0) {
    return { inserted_count: 0, skipped_existing_count: 0, eligible_row_count: 0 };
  }

  const { data: existingRows, error: existingError } = await supabase
    .from("ai_price_candidates")
    .select("source_image_id,source_row_index,h5_lifecycle_status")
    .eq("visit_id", input.visitId)
    .not("source_image_id", "is", null);
  if (existingError) throw new Error(existingError.message);

  const existingRowKeys = new Set((existingRows ?? [])
    .filter((row) => row.h5_lifecycle_status !== "deleted")
    .map((row) => rowKey(row.source_image_id as string | null, row.source_row_index as number | null)));

  const missingSourceItems = sourceItems.filter((item) => !existingRowKeys.has(rowKey(item.sourceImageId, item.sourceRowIndex)));
  if (missingSourceItems.length === 0) {
    return {
      inserted_count: 0,
      skipped_existing_count: sourceItems.length,
      eligible_row_count: sourceItems.length,
    };
  }

  const rows = await buildAiPriceCandidateRows({
    visitId: input.visitId,
    sourceItems: missingSourceItems,
    supabase,
  });
  const inserted = await insertAiPriceCandidateRows({
    visitId: input.visitId,
    rows,
    affectedImageIds: imageIdFilter.length > 0 ? imageIdFilter : undefined,
    supabase,
  });

  return {
    inserted_count: inserted.length,
    skipped_existing_count: sourceItems.length - missingSourceItems.length,
    eligible_row_count: sourceItems.length,
  };
}
```

- [ ] **Step 4: Run the sync test**

Run:

```bash
node --test tests/store-visit-price-candidate-sync.test.mjs
```

Expected: PASS.

---

### Task 3: Sync Before H5 Detail Returns Data

**Files:**
- Modify: `src/app/api/store-visit/[id]/route.ts`
- Test: `tests/offline-price-candidates-ui.test.mjs`

- [ ] **Step 1: Add static regression test**

Append:

```js
test("mobile store visit detail repairs missing price candidates before returning rows", () => {
  assert.match(storeVisitRoute, /syncStoreVisitPriceCandidatesFromImages/);
  assert.match(storeVisitRoute, /await syncStoreVisitPriceCandidatesFromImages\(\{\s*visitId:/s);
  assert.match(storeVisitRoute, /loadVisitWithFallback/);
});
```

- [ ] **Step 2: Run test and confirm it fails**

Run:

```bash
node --test tests/offline-price-candidates-ui.test.mjs
```

Expected: FAIL because the route does not call the sync helper.

- [ ] **Step 3: Import and call the sync helper**

In `src/app/api/store-visit/[id]/route.ts`, add:

```ts
import { syncStoreVisitPriceCandidatesFromImages } from "@/lib/store-visit-price-candidate-sync";
```

Before returning the signed visit payload, call:

```ts
await syncStoreVisitPriceCandidatesFromImages({
  visitId: signedVisit.id,
  supabase,
});
```

Then reload the visit once after sync so the response includes newly inserted candidates:

```ts
const repairedVisit = syncResult.inserted_count > 0
  ? await loadVisitWithFallback(supabase, signedVisit.id)
  : signedVisit;
```

Use `repairedVisit` for `attachSignedImageUrls` and `attachAiPriceCandidateMatchLabels`.

- [ ] **Step 4: Run focused tests**

Run:

```bash
node --test tests/offline-price-candidates-ui.test.mjs tests/store-visit-price-candidate-sync.test.mjs
```

Expected: PASS.

---

### Task 4: Sync After AI Job Item Success And Job Completion

**Files:**
- Modify: `src/lib/store-visit-ai-jobs.ts`
- Test: `tests/store-visit-auto-analyze.test.mjs`

- [ ] **Step 1: Add static tests**

Append to `tests/store-visit-auto-analyze.test.mjs`:

```js
test("store visit AI jobs reconcile persisted price rows into candidates after item success", () => {
  const storeVisitAiJobs = readFileSync("src/lib/store-visit-ai-jobs.ts", "utf8");
  assert.match(storeVisitAiJobs, /syncStoreVisitPriceCandidatesFromImages/);
  assert.match(storeVisitAiJobs, /imageIds: \[item\.source_image_id\]/);
  assert.match(storeVisitAiJobs, /inserted_count/);
});

test("store visit AI watchdog waits for stable uploads before creating initial jobs", () => {
  const storeVisitAiJobs = readFileSync("src/lib/store-visit-ai-jobs.ts", "utf8");
  assert.match(storeVisitAiJobs, /minimumInitialAnalysisImageAgeMs/);
  assert.match(storeVisitAiJobs, /latestImageCreatedAt/);
});
```

- [ ] **Step 2: Run test and confirm it fails**

Run:

```bash
node --test tests/store-visit-auto-analyze.test.mjs
```

Expected: FAIL because the sync and stability guard do not exist.

- [ ] **Step 3: Import sync helper**

In `src/lib/store-visit-ai-jobs.ts`, add:

```ts
import { syncStoreVisitPriceCandidatesFromImages } from "@/lib/store-visit-price-candidate-sync";
```

- [ ] **Step 4: Reconcile after each successful item**

After `runStoreVisitAnalysis` succeeds for one item, call:

```ts
const syncResult = await syncStoreVisitPriceCandidatesFromImages({
  visitId: job.visit_id,
  imageIds: [item.source_image_id],
  supabase,
});
```

Include this in `resultSummary`:

```ts
synced_candidate_count: syncResult.inserted_count,
eligible_candidate_row_count: syncResult.eligible_row_count,
```

- [ ] **Step 5: Add watchdog stability guard**

Near constants in `src/lib/store-visit-ai-jobs.ts`, add:

```ts
const minimumInitialAnalysisImageAgeMs = 60_000;
```

When loading pending visits in `processPendingStoreVisitAiJobs`, include image `created_at`:

```ts
.select("id,offline_visit_images(id,image_type,deleted_at,replaced_by_image_id,created_at)")
```

Before creating the initial job:

```ts
const latestImageCreatedAt = imageRows
  .map((image) => new Date(image.created_at).getTime())
  .filter((value) => Number.isFinite(value))
  .sort((left, right) => right - left)[0] ?? 0;
if (Date.now() - latestImageCreatedAt < minimumInitialAnalysisImageAgeMs) {
  skippedCount += 1;
  continue;
}
```

Use `imageRows` as the filtered price-image array so the same filtered set is used for age and ids.

- [ ] **Step 6: Run tests**

Run:

```bash
node --test tests/store-visit-auto-analyze.test.mjs tests/store-visit-price-candidate-sync.test.mjs
```

Expected: PASS.

---

### Task 5: Sync Refresh/Reanalysis Flow

**Files:**
- Modify: `src/app/api/store-visit/[id]/refresh/route.ts`
- Test: `tests/offline-price-candidates-ui.test.mjs`

- [ ] **Step 1: Add static test**

Append:

```js
test("store visit refresh reconciles candidates for affected images", () => {
  assert.match(storeVisitRefreshRoute, /syncStoreVisitPriceCandidatesFromImages/);
  assert.match(storeVisitRefreshRoute, /imageIds: refreshImageIds/);
});
```

- [ ] **Step 2: Run test and confirm it fails**

Run:

```bash
node --test tests/offline-price-candidates-ui.test.mjs
```

Expected: FAIL.

- [ ] **Step 3: Import and call sync**

In `src/app/api/store-visit/[id]/refresh/route.ts`, import:

```ts
import { syncStoreVisitPriceCandidatesFromImages } from "@/lib/store-visit-price-candidate-sync";
```

After successful refresh/reanalysis and before returning JSON:

```ts
const syncResult = await syncStoreVisitPriceCandidatesFromImages({
  visitId: id,
  imageIds: refreshImageIds,
  supabase,
});
```

Include in response:

```ts
candidate_sync: syncResult,
```

- [ ] **Step 4: Run focused tests**

Run:

```bash
node --test tests/offline-price-candidates-ui.test.mjs tests/store-visit-auto-analyze.test.mjs
```

Expected: PASS.

---

### Task 6: Add Internal Repair Endpoint And CLI Backfill

**Files:**
- Create: `src/app/api/internal/store-visit/price-candidates/sync/route.ts`
- Create: `scripts/sync-store-visit-price-candidates.mjs`
- Test: `tests/store-visit-auto-analyze.test.mjs`

- [ ] **Step 1: Add static tests**

Append to `tests/store-visit-auto-analyze.test.mjs`:

```js
test("internal store visit candidate sync endpoint and script exist", () => {
  const endpoint = readMaybe("src/app/api/internal/store-visit/price-candidates/sync/route.ts");
  const script = readMaybe("scripts/sync-store-visit-price-candidates.mjs");
  assert.match(endpoint, /syncStoreVisitPriceCandidatesFromImages/);
  assert.match(endpoint, /INTERNAL_JOB_SECRET/);
  assert.match(script, /sync-store-visit-price-candidates/);
  assert.match(script, /visit_code/);
});
```

- [ ] **Step 2: Run test and confirm it fails**

Run:

```bash
node --test tests/store-visit-auto-analyze.test.mjs
```

Expected: FAIL.

- [ ] **Step 3: Create internal endpoint**

Create `src/app/api/internal/store-visit/price-candidates/sync/route.ts`:

```ts
import { syncStoreVisitPriceCandidatesFromImages } from "@/lib/store-visit-price-candidate-sync";
import { createSupabaseServiceClient } from "@/lib/supabase";

function isAuthorized(request: Request) {
  const expected = process.env.INTERNAL_JOB_SECRET;
  if (!expected) return false;
  return request.headers.get("x-internal-job-secret") === expected;
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const visitId = String(body.visit_id ?? "").trim();
  const visitCode = String(body.visit_code ?? "").trim();
  const limit = Math.max(1, Math.min(100, Number(body.limit ?? 25) || 25));
  const supabase = createSupabaseServiceClient();

  let visitIds: string[] = [];
  if (visitId) {
    visitIds = [visitId];
  } else if (visitCode) {
    const { data, error } = await supabase
      .from("offline_store_visits")
      .select("id")
      .eq("visit_code", visitCode)
      .single();
    if (error || !data) return Response.json({ error: error?.message ?? "Visit not found" }, { status: 404 });
    visitIds = [data.id];
  } else {
    const { data, error } = await supabase
      .from("offline_store_visits")
      .select("id")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) return Response.json({ error: error.message }, { status: 400 });
    visitIds = (data ?? []).map((row) => row.id);
  }

  const results = [];
  for (const id of visitIds) {
    const result = await syncStoreVisitPriceCandidatesFromImages({ visitId: id, supabase });
    results.push({ visit_id: id, ...result });
  }

  return Response.json({
    synced_visit_count: results.length,
    inserted_count: results.reduce((sum, item) => sum + item.inserted_count, 0),
    results,
  });
}
```

- [ ] **Step 4: Create CLI script**

Create `scripts/sync-store-visit-price-candidates.mjs`:

```js
#!/usr/bin/env node
const baseUrl = process.env.APP_URL || "http://localhost:3000";
const secret = process.env.INTERNAL_JOB_SECRET;
const visitCode = process.argv.find((arg) => arg.startsWith("--visit-code="))?.split("=")[1];
const visitId = process.argv.find((arg) => arg.startsWith("--visit-id="))?.split("=")[1];
const limit = Number(process.argv.find((arg) => arg.startsWith("--limit="))?.split("=")[1] ?? "25");

if (!secret) {
  console.error("Missing INTERNAL_JOB_SECRET");
  process.exit(1);
}

const response = await fetch(`${baseUrl}/api/internal/store-visit/price-candidates/sync`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-internal-job-secret": secret,
  },
  body: JSON.stringify({
    visit_code: visitCode,
    visit_id: visitId,
    limit,
  }),
});

const payload = await response.json().catch(() => ({}));
console.log(JSON.stringify(payload, null, 2));
if (!response.ok) process.exit(1);
```

- [ ] **Step 5: Run tests**

Run:

```bash
node --test tests/store-visit-auto-analyze.test.mjs
```

Expected: PASS.

---

### Task 7: Optional Active Row Identity Index

**Files:**
- Create only if no equivalent index exists: `supabase/migrations/202607070002_ai_price_candidates_h5_row_identity.sql`
- Test: `tests/offline-price-candidates-ui.test.mjs`

- [ ] **Step 1: Inspect existing migrations**

Run:

```bash
rg -n "source_row_index|ai_price_candidates.*source_image_id|h5_lifecycle_status" supabase/migrations
```

Expected: identify whether an active row identity index already exists.

- [ ] **Step 2: If missing, add migration**

Create:

```sql
create unique index if not exists idx_ai_price_candidates_h5_active_row
  on public.ai_price_candidates(visit_id, source_image_id, source_row_index)
  where source_image_id is not null
    and source_row_index is not null
    and coalesce(h5_lifecycle_status, '') <> 'deleted'
    and status in ('pending', 'approved');
```

- [ ] **Step 3: Add static test if migration is created**

Append:

```js
test("ai price candidates enforce active H5 row identity", () => {
  const migration = readMaybe("supabase/migrations/202607070002_ai_price_candidates_h5_row_identity.sql");
  assert.match(migration, /idx_ai_price_candidates_h5_active_row/);
  assert.match(migration, /visit_id, source_image_id, source_row_index/);
});
```

- [ ] **Step 4: Run tests**

Run:

```bash
node --test tests/offline-price-candidates-ui.test.mjs
```

Expected: PASS.

---

### Task 8: Repair The Known Visit And Verify End To End

**Files:**
- No code changes if previous tasks are complete.
- Runtime verification against Supabase data.

- [ ] **Step 1: Start the app locally**

Run:

```bash
npm run dev
```

Expected: local app starts on `http://localhost:3000` or the next available port.

- [ ] **Step 2: Repair known visit**

Run:

```bash
node scripts/sync-store-visit-price-candidates.mjs --visit-code=ST202607070035
```

Expected JSON includes:

```json
{
  "synced_visit_count": 1,
  "inserted_count": 4
}
```

If `inserted_count` is `0`, query `ai_price_candidates` for `source_image_id = d9921b85-d64a-4250-882e-6453268f8024`; the four rows should already exist.

- [ ] **Step 3: Confirm database state**

Run:

```bash
node -e "const fs=require('fs');const{createClient}=require('@supabase/supabase-js');const env=Object.fromEntries(fs.readFileSync('.env.local','utf8').split(/\\r?\\n/).filter(Boolean).filter(l=>!l.startsWith('#')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i),l.slice(i+1)];}));const supabase=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY);(async()=>{const {data}=await supabase.from('ai_price_candidates').select('id,source_image_id,source_row_index,raw_product,net_price_idr,piece_count,status').eq('visit_id','5ac06e81-4b97-4c81-a563-e266ba507357').eq('source_image_id','d9921b85-d64a-4250-882e-6453268f8024').order('source_row_index');console.log(JSON.stringify(data,null,2));})();"
```

Expected: 4 rows with `source_row_index` `0,1,2,3`.

- [ ] **Step 4: Verify H5 behavior**

Open the visit detail page and confirm `Photo5 / ID: 268F8024` rows have active `Edit` controls. Each edit sheet should open with the row price, pieces, and unmatched state available for correction.

- [ ] **Step 5: Run final focused verification**

Run:

```bash
node --test tests/offline-price-candidates-ui.test.mjs tests/store-visit-auto-analyze.test.mjs tests/store-visit-price-candidate-sync.test.mjs
npx eslint src/lib/ai-price-candidates.ts src/lib/store-visit-price-candidate-sync.ts src/lib/store-visit-ai-jobs.ts src/app/api/store-visit/[id]/route.ts src/app/api/store-visit/[id]/refresh/route.ts src/app/api/internal/store-visit/price-candidates/sync/route.ts
```

Expected: all tests pass and ESLint reports no errors.

---

## Self-Review

- Spec coverage: The plan fixes the product-visible issue, the data invariant, historical repair, future race prevention, H5 detail consistency, AI job consistency, refresh consistency, and verification for `ST202607070035 / 268F8024`.
- Placeholder scan: The plan avoids deferred work. The only conditional task is the migration, with an explicit command and exact SQL if needed.
- Type consistency: The sync helper uses `AiPriceCandidateSourceItem`, `buildAiPriceCandidateRows`, and `insertAiPriceCandidateRows` consistently after Task 1 exports them.

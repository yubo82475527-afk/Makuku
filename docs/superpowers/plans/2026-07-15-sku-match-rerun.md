# SKU Match Replacement And Manual Rerun Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task with verification checkpoints.

**Goal:** Replace the active competitor catalog, introduce a maintainable deterministic matcher, and let managers rerun matching for a date range or one Visit from Store Visit Monitor without calling image AI.

**Architecture:** Separate the stable matching engine from the versioned business rule set. Candidate creation and manual reruns share one application service and one compiled master-data context; future alias or filter changes stay in the versioned rule module while the Visit lifecycle stays unchanged. Keep rerun execution synchronous through one admin endpoint and reuse the existing asynchronous quality-gate runner, avoiding a new task/status subsystem.

**Mapping boundary:** H5 matching identifies the actual own or competitor product. Competitor benchmarking uses only `competitor_series_mappings` (`competitor brand + series -> Makuku series`). The SKU-level `sku_matches` path is removed from application code and UI so the system has one benchmark-mapping authority.

**Tech Stack:** Next.js App Router, TypeScript, Supabase/Postgres, existing H5 candidate/snapshot lifecycle, Node built-in test runner.

---

### Task 1: Add failing tests and the test command

**Files:**
- Modify: `package.json`
- Create: `tests/product-match-engine.test.ts`
- Create: `tests/product-match-rules-v2.test.ts`
- Create: `tests/competitor-product-excel-import.test.ts`
- Create: `tests/store-visit-matching-rerun.test.ts`

- [ ] Add `"test": "node --experimental-strip-types --test tests/**/*.test.ts"` without changing existing scripts.
- [ ] Test the stable engine with an injected rule set: exact code, full signature, unique signature, duplicate candidate, inactive candidate, and unmatched results.
- [ ] Test only v2 rule details in the v2 rule test: `DRYCARE/DRY CARE/DRY-CARE`, `MEDIUM/M`, `LARGE/L`, `3XL/XXXL`, `MamyPoko/MAMY POKO`, `Swety/SWEETY`, and `CELANA/PANTS`.
- [ ] Test the workbook parser with integer total piece counts, invalid non-integers, and blank required fields. Do not test or implement package-expression arithmetic.
- [ ] Test rerun selection and lifecycle: inclusive date range, one Visit ID/code, mixed-selector rejection, old candidate/snapshot invalidation, new candidate insertion, and no image-AI call.
- [ ] Run `npm test` and verify the tests fail because the new interfaces do not exist yet.

### Task 2: Build a stable engine with versioned rules

**Files:**
- Create: `src/lib/product-match-engine.ts`
- Create: `src/lib/product-match-rules-v2.ts`
- Modify: `src/lib/ai-price-candidates.ts`
- Test: `tests/product-match-engine.test.ts`
- Test: `tests/product-match-rules-v2.test.ts`

- [ ] In `product-match-engine.ts`, define the stable interfaces: evidence input, master product reference, normalized signature, compiled index, rule-set contract, match result, and the four match methods.
- [ ] Keep the pipeline fixed in the engine: normalize evidence through the injected rule set, select own/competitor pool, generate core signature, indexed hard filter, require exactly one valid candidate, and return method/evidence.
- [ ] Build `byCode`, `byBrand`, `byCoreSignature`, `seriesOwners`, and `invalidProductIds` once per compiled master context. The engine must not import Supabase or H5 modules.
- [ ] In `product-match-rules-v2.ts`, keep only changeable business rules: alias maps, series/brand resolution, signature extraction, conflict checks, optional-field compatibility, and `RULE_VERSION = "sku-match-v2"`.
- [ ] Make v2 read all available Vision evidence (`brand`, `product_family_text`, `section_title`, `sku`, `row_anchor`, integer `piece_count`) without changing image parsing.
- [ ] In `ai-price-candidates.ts`, replace score ranking with the engine. Add `loadProductMatchContext()` and allow `buildAiPriceCandidateRows()` to receive a preloaded context; the normal H5 path loads once per Visit and a range rerun passes one context across all Visits.
- [ ] Keep `match_score` only as compatibility output (`1` bound, `0` unmatched); matching decisions use `ai_match_method` and evidence.
- [ ] Run the two matcher test files and verify GREEN.

### Task 3: Persist explicit match metadata and update review/display consumers

**Files:**
- Create: `supabase/migrations/202607150001_sku_match_v2_metadata.sql`
- Modify: `src/lib/types.ts`
- Modify: `src/lib/ai-price-review.ts`
- Modify: `src/app/api/store-visit/[id]/route.ts`
- Modify: `src/components/store-visit-detail-h5.tsx`
- Modify: `src/components/ai-price-candidates-workbench.tsx`

- [ ] Add `ai_match_rule_version text`, `ai_match_method text`, and compact `ai_match_evidence jsonb` columns to `ai_price_candidates`, plus a method check constraint. Do not add a speculative reporting index.
- [ ] Persist only the normalized signature, evidence sources, candidate counts, chosen ID, and unmatched reason; do not store full master rows or image content.
- [ ] Extend candidate TypeScript types and all explicit candidate select strings with the new fields.
- [ ] Change application auto-review eligibility from a displayed numeric threshold to allowed methods: `EXACT_CODE`, `FULL_SIGNATURE`, and `UNIQUE_SIGNATURE`. Keep compatibility score `1/0` so existing database finalization checks continue to work.
- [ ] Replace “商品命中度 99%” in the review workbench with method labels. In H5 detail, show the new matched SKU and concise method label for v2 rows; legacy rows retain the legacy fallback display.
- [ ] Run matcher/review tests, lint the touched files, and verify no legacy candidate query breaks.

### Task 4: Replace competitor master data atomically

**Files:**
- Modify: `src/lib/competitor-product-excel-import.ts`
- Modify: `src/app/api/competitor-products/import/route.ts`
- Create: `supabase/migrations/202607150002_replace_competitor_master.sql`
- Test: `tests/competitor-product-excel-import.test.ts`

- [ ] Accept the current one-sheet fields and require `piece_count` to be a positive integer total.
- [ ] Preview and validate the full workbook before any write. Verify 327 rows, 21 brands, no blank required fields, and no own-brand rows.
- [ ] Add one small transactional RPC that receives already-validated rows and resolved brand IDs, disables current active competitor products, and bulk-inserts the new active rows. A failed insert must roll back the disable operation.
- [ ] Reuse the existing competitor-code trigger and unique index. Add only an active-master lookup index if query plans require it.
- [ ] Do not delete competitor products or historical price facts.
- [ ] Run the parser tests and a read-only preview against `C:/Users/29014/Desktop/LIST SKU.xlsx` before invoking the replacement RPC.

### Task 5: Remove the SKU-level competitor-to-own mapping path

**Files:**
- Modify: `src/lib/types.ts`
- Modify: `src/lib/data.ts`
- Modify: `src/lib/price-snapshot-business.ts`
- Modify: `src/lib/ai-price-review.ts`
- Modify: `src/lib/competitor-series-mapping.ts`
- Modify: `src/app/api/price-snapshots/route.ts`
- Modify: `src/app/api/price-snapshots/export/route.ts`
- Modify: `src/app/api/offline-visit-images/[id]/confirm/route.ts`
- Modify: `src/app/api/offline-uploads/[id]/confirm/route.ts`
- Modify: `src/app/api/competitor-products/import/route.ts`
- Modify: `src/app/api/competitor-products/export/route.ts`
- Modify: `src/app/api/competitors/route.ts`
- Delete: `src/app/api/sku-matches/route.ts`
- Modify: `src/app/[locale]/competitor-mappings/page.tsx`
- Modify: `src/components/competitor-products-table.tsx`
- Modify: `src/components/competitor-product-import-workbench.tsx`
- Delete if confirmed unused: `src/components/competitor-mapping-table.tsx`
- Delete if confirmed unused: `src/components/competitor-mappings-table.tsx`
- Test: `tests/competitor-series-mapping.test.ts`

- [ ] Rename the existing page title from “Auto SKU Mapping” to “Competitor Series Mapping” so the UI describes its real grain.
- [ ] Remove SKU-level mapping forms, status columns, target-material import/export fields, `/api/sku-matches`, and automatic `sku_matches` writes from competitor APIs.
- [ ] Remove all `sku_matches(...)` joins and TypeScript fallbacks from H5, review, price snapshot, export, dashboard, and competitor-master reads.
- [ ] Make `competitor_series_mappings` the only competitor-to-Makuku benchmark authority. Reuse `findMatchingMaterialForSeries` when a downstream calculation needs a concrete Makuku material; do not reintroduce a persisted per-product relation.
- [ ] Tighten `findMatchingMaterialForSeries` tests for normalized series, size, and shape. Piece count may rank candidates only after series/size/shape compatibility because price comparisons are per piece.
- [ ] Keep the physical `sku_matches` table during this release but leave it unread and unwritten. After the code release is deployed and read-only checks show zero consumers, drop it in a separate forward migration; do not combine a destructive table drop with the compatibility removal release.
- [ ] Verify competitor series rules, default benchmark selection, price comparison, and exports work without a SKU-level fallback.

### Task 6: Implement one match-only rerun service and endpoint

**Files:**
- Create: `src/lib/store-visit-matching-rerun.ts`
- Create: `src/app/api/store-visit-monitor/rerun-matching/route.ts`
- Modify: `src/lib/store-visit-price-candidate-sync.ts`
- Modify: `src/lib/ai-price-candidates.ts`
- Test: `tests/store-visit-matching-rerun.test.ts`

- [ ] Accept exactly one selector: `visit_id`, `visit_code`, or inclusive `date_from + date_to`; reject mixed selectors, missing dates, reversed ranges, and empty selections.
- [ ] Keep `store-visit-matching-rerun.ts` as stable orchestration over an injected gateway (select Visits, load Vision rows, replace lifecycle state, refresh Visit, trigger review). Put Supabase/auth/HTTP composition in the route so the process can be tested without database or AI mocks leaking into rule tests.
- [ ] Load one compiled product-match context for the whole request, then reuse it for every selected Visit.
- [ ] For each Visit, read active price images and stored `vision_result`; reuse the existing source-row adapter and never call `runStoreVisitAnalysis` or any image model.
- [ ] Reuse `invalidateStoreVisitImagePriceImpact` so old snapshots are deleted and current candidates become `rejected + reanalyzed`; then insert new v2 candidates using only active candidates for duplicate suppression.
- [ ] Refresh existing Visit state and trigger the existing quality-gate/auto-review runner once after all selected Visits are rebuilt. Return selected/processed/skipped/failed Visit counts, method counts, snapshot replacement counts, and per-Visit errors.
- [ ] Protect the endpoint with `requireAdminSession`. Do not add a status endpoint, in-memory job registry, new job table, or mobile route.
- [ ] Run rerun tests and verify GREEN.

### Task 7: Add minimal controls to Store Visit Monitor

**Files:**
- Modify: `src/app/[locale]/store-visit-monitor/page.tsx`
- Modify: `src/components/store-visit-monitor-client.tsx`
- Create: `src/components/store-visit-matching-rerun-dialog.tsx`

- [ ] Pass `canRerunMatching = isAllowedAdminRole(session?.role)` from the existing server page.
- [ ] Add one toolbar button beside Export. It opens a shared dialog with current filter dates prefilled and a clear note that image AI will not run.
- [ ] Add one row action beside Open details. It opens the same dialog in single-Visit mode.
- [ ] Keep dialog state to `idle`, `submitting`, `succeeded`, and `failed`; prevent duplicate submits and show the final response counts/errors. Do not implement polling or fake progress.
- [ ] After success, reload monitor data. The existing details link shows new candidates immediately and later reflects pending/approved snapshot results from the existing review pipeline.
- [ ] Hide controls from non-manager/admin users and disable them for demo data. Do not add a new page or a mobile H5 control.

### Task 8: Verify behavior and performance

- [ ] Run `npm test` and verify zero failures.
- [ ] Run `npm run lint` and `npm run build` with zero errors.
- [ ] Benchmark one compiled context with 220 material rows, 327 competitor rows, and 100 source SKUs; verify no database or AI call occurs inside the candidate loop.
- [ ] Run read-only data checks after import: 327 active new products, 21 brands, zero own brands, unique competitor codes, old products disabled, no application query/write to `sku_matches`, and all benchmark resolution sourced from active series mappings.
- [ ] From Store Visit Monitor, rerun one Visit and one date range. Verify old candidates are `reanalyzed`, selected snapshots are replaced, new pending/approved candidates appear, H5 detail shows the new SKU/method, and no image AI request is issued.

---

## Acceptance Criteria

- Rule-only changes can be made in `product-match-rules-v2.ts` and its tests without editing Visit rerun, candidate lifecycle, API, or UI code.
- The stable engine uses indexed lookup and explicit methods; ambiguous, conflicting, or inactive products stay unmatched.
- The new workbook atomically becomes the active competitor catalog; old products are disabled, not deleted.
- Competitor-to-Makuku benchmarking has one authority: `competitor_series_mappings`. SKU-level mapping UI, API, import/export fields, and runtime fallbacks are removed.
- Manual rerun supports a date range and one Visit from Store Visit Monitor, replaces candidates/snapshots, and does not call image AI.
- No new page, mobile H5 action, task table, status endpoint, or package-expression model is introduced.
- Tests, lint, build, and focused performance verification pass with fresh output.

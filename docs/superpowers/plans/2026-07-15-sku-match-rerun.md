# SKU Match Replacement And Manual Rerun Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task with verification checkpoints.

**Goal:** Replace the current competitor master with the 327-row competitor workbook, use deterministic signature matching for future H5 results, and expose an admin-only manual rerun action inside Store Visit Monitor for a date range or one Visit.

**Architecture:** Keep existing competitor UUIDs and price facts intact by disabling old competitor products instead of deleting them. Import the new catalog as active products, rebuild their SKU mappings, and make the candidate builder use one indexed master snapshot with explicit match methods. Add a match-only rerun service that consumes stored Vision `vision_result`, archives current Visit candidates and price snapshots through the existing H5 lifecycle, then runs the same candidate, quality-gate, and snapshot pipeline without calling image AI. The existing Store Visit Monitor page gets a compact rerun toolbar and per-row action; no mobile H5 page or new standalone page is added.

**Tech Stack:** Next.js App Router, TypeScript, Supabase/Postgres migrations and RPCs, existing `ai_price_candidates`/`price_snapshots` lifecycle, Node built-in test runner with TypeScript strip-types, existing UI primitives.

---

### Task 1: Establish the failing tests and test command

**Files:**
- Modify: `package.json`
- Create: `tests/sku-matcher-v2.test.ts`
- Create: `tests/competitor-product-excel-import.test.ts`
- Create: `tests/store-visit-matching-rerun.test.ts`

- [ ] **Step 1: Add the Node test command**

Add `"test": "node --experimental-strip-types --test tests/**/*.test.ts"` to `package.json` without changing existing scripts.

- [ ] **Step 2: Write the matcher tests first**

Cover these exact behaviors: `DRYCARE`, `DRY CARE`, and `DRY-CARE` resolve to one series; `MEDIUM` and `LARGE` normalize to `M` and `L`; Pants never matches Tape; a duplicate candidate remains `UNMATCHED`; an inactive product is excluded; and a unique exact signature returns `FULL_SIGNATURE` or `UNIQUE_SIGNATURE` with no probability score semantics.

- [ ] **Step 3: Write the workbook parser tests first**

Use an in-memory XLSX workbook with one sheet and assert that an integer `piece_count` is accepted as the total piece count, while non-integer values and blank required fields are rejected. The importer does not calculate or persist package expressions.

- [ ] **Step 4: Write rerun service tests first**

Use a small injected fake Supabase gateway and assert that a single Visit rerun loads stored Vision rows, archives existing candidates/snapshots, inserts new candidates, and never invokes an image-AI function; also assert date-range selection is inclusive and a Visit/code selector cannot be combined with a date selector.

- [ ] **Step 5: Run the tests and verify RED**

Run `npm test` from the worktree. Expected result: the new tests fail because the v2 matcher, parser fields, and rerun service are not implemented yet.

### Task 2: Add the new candidate match metadata and active-product constraints

**Files:**
- Create: `supabase/migrations/202607150001_sku_match_v2_metadata.sql`
- Modify: `src/lib/types.ts`
- Test: `tests/sku-matcher-v2.test.ts`

- [ ] **Step 1: Add the migration**

Add nullable columns to `ai_price_candidates`: `ai_match_rule_version text`, `ai_match_method text`, and `ai_match_evidence jsonb not null default '{}'::jsonb`. Add a check allowing `EXACT_CODE`, `FULL_SIGNATURE`, `UNIQUE_SIGNATURE`, and `UNMATCHED`. Add an index on `(ai_match_rule_version, ai_match_method)`.

Do not change `sku_matches.match_score`; it remains a competitor-master mapping compatibility field. Do not delete or alter `price_snapshots` rows in this migration.

- [ ] **Step 2: Extend TypeScript types**

Add the three candidate metadata fields and a `AiProductMatchMethod` union to the existing candidate types. Keep `match_score` for compatibility but document in the type that v2 uses methods/evidence for display and decisions.

- [ ] **Step 3: Run the matcher tests**

Run `node --experimental-strip-types --test tests/sku-matcher-v2.test.ts`; keep the tests RED until Task 3 supplies the matcher.

### Task 3: Implement the pure v2 signature matcher and indexed master snapshot

**Files:**
- Create: `src/lib/sku-matcher-v2.ts`
- Modify: `src/lib/ai-price-candidates.ts`
- Test: `tests/sku-matcher-v2.test.ts`

- [ ] **Step 1: Define the pure interfaces**

Export `SkuSignature`, `MasterMatchIndex`, `MatchMethod`, `MatchEvidence`, `buildMasterMatchIndex`, and `matchProduct`. The master index must expose `byCode`, `byBrand`, `byCoreSignature`, `seriesOwners`, and `invalidProductIds` as described in the approved design.

- [ ] **Step 2: Implement normalization**

Create token and compact keys; map controlled series aliases (`drycare`, `procare`, `comfortfit`, `skinhealth`, `slimcare`, `mediumflow`, `heavyflow`), brand aliases (`MamyPoko`, `Swety`), size aliases (`MEDIUM`, `LARGE`, `3XL`, `NB S`), and shape aliases (`CELANA`, `PANTS`). Use the provided integer total piece count directly and preserve raw text evidence only for explainability.

- [ ] **Step 3: Implement hard filtering**

Require brand ownership, series, size, total piece count, shape when both sides specify it, and package/version fields when both sides specify them. Resolve `DRYCARE` as series evidence only when the normalized series owner is unique and the product pool does not conflict. Never use edit distance, arbitrary substring matching, highest version, or first-row fallback.

- [ ] **Step 4: Implement explicit binding methods**

Return `EXACT_CODE` for an exact competitor code, `FULL_SIGNATURE` for all signature fields, `UNIQUE_SIGNATURE` for one non-conflicting candidate, and `UNMATCHED` otherwise. Return candidate counts and rejection reasons in `MatchEvidence`; numeric `match_score` is `1` only for a bound candidate and `0` for unmatched as a compatibility value.

- [ ] **Step 5: Replace the old per-candidate ranking path**

In `buildAiPriceCandidateRows`, load `material_master` and active competitor products once, build the index once, normalize each source row once, and call `matchProduct`. Remove the old score threshold/ordered ranking as the binding decision. Populate the new metadata fields and keep existing price parsing behavior.

- [ ] **Step 6: Run the matcher tests and verify GREEN**

Run `node --experimental-strip-types --test tests/sku-matcher-v2.test.ts`. Expected result: all normalization, hard-filter, duplicate, inactive, and method tests pass.

### Task 4: Make the competitor workbook replacement safe and complete

**Files:**
- Modify: `src/lib/competitor-product-excel-import.ts`
- Modify: `src/app/api/competitor-products/import/route.ts`
- Create: `supabase/migrations/202607150002_competitor_master_replace.sql`
- Test: `tests/competitor-product-excel-import.test.ts`

- [ ] **Step 1: Parse the new workbook shape**

Accept the single `sku` sheet fields (`no`, `brand`, `product_series`, `product_name`, `package_type`, `size`, `piece_count`). Treat `piece_count` as the already-prepared positive integer total; reject non-integer or non-positive values without doing additional arithmetic.

- [ ] **Step 2: Add replacement import intent**

Support an explicit `replace_competitor_master=true` import flag. Before inserting the validated rows, update all current competitor products with `status = 'disabled'`; do not delete products or price facts. If validation has any row errors, do not disable anything and return the preview errors.

- [ ] **Step 3: Import all 327 rows as active**

Generate stable competitor codes through the existing trigger, write `piece_count`, normalized series/name fields, and `status = 'active'`. Reject rows whose brand is marked `is_own_brand=true`. Do not create target SKU mappings from the workbook because this source is competitor-only.

- [ ] **Step 4: Clear old competitor SKU mappings only after validation**

Delete `sku_matches` for disabled competitor products, then allow the new master to receive new mappings. This does not cascade into `price_snapshots`; never delete competitor products from this flow.

- [ ] **Step 5: Add database constraints/indexes**

Do not add a package-expression column or migration. Keep the existing unique partial index on `competitor_sku_code`, add the active-product index used by the matcher, and preserve the `status in ('active','disabled')` constraint and code trigger.

- [ ] **Step 6: Run parser tests and a read-only workbook preview**

Run `node --experimental-strip-types --test tests/competitor-product-excel-import.test.ts`, then preview `C:/Users/29014/Desktop/LIST SKU.xlsx` through the import parser and verify 327 valid rows, 21 brands, integer total piece counts, and zero own-brand rows before any database import.

### Task 5: Implement match-only rerun service and backend endpoints

**Files:**
- Create: `src/lib/store-visit-matching-rerun.ts`
- Create: `src/app/api/internal/store-visit-matching/rerun/route.ts`
- Create: `src/app/api/internal/store-visit-matching/status/route.ts`
- Modify: `src/lib/ai-price-candidates.ts`
- Modify: `src/lib/store-visit-price-candidate-sync.ts`
- Test: `tests/store-visit-matching-rerun.test.ts`

- [ ] **Step 1: Define the rerun request and result contracts**

Accept exactly one target: `visit_id`, `visit_code`, or inclusive `date_from` + `date_to`. Return selected Visit count, processed/skipped/failed counts, candidate counts, method counts, snapshot replacement counts, and per-Visit errors.

- [ ] **Step 2: Select the Visit set**

Resolve one Visit by ID/code or select `offline_store_visits.visit_date >= date_from` and `<= date_to`. Reject missing dates, reversed ranges, mixed selectors, and empty selections with clear 400 responses.

- [ ] **Step 3: Rebuild each Visit from stored Vision evidence**

Load active price images and their `vision_result`; convert rows through the existing source-item adapter; skip images without a valid stored price-analysis schema and report them. Never call `runStoreVisitAnalysis` or any image model.

- [ ] **Step 4: Replace current Visit output**

Call existing image price-impact invalidation for selected images so old snapshots are removed and active candidates become `status='rejected'`, `h5_lifecycle_status='reanalyzed'`. Insert new candidate rows with v2 metadata, using active candidates only for duplicate suppression.

- [ ] **Step 5: Re-run the existing review/snapshot lifecycle**

Trigger the existing price-quality gate/auto-approval runner after new candidates are inserted. New approved candidates create new snapshots; pending candidates remain visible in the review queue. Refresh stored Visit state and revalidate the existing Visit detail paths.

- [ ] **Step 6: Add backend authorization and status**

Require `requireAdminSession` for the browser API and accept the existing internal job secret for controlled automation. The status endpoint returns the latest request result from the in-process job record or a structured completed response; no mobile route is added.

- [ ] **Step 7: Run rerun service tests and verify GREEN**

Run `node --experimental-strip-types --test tests/store-visit-matching-rerun.test.ts`; verify no AI function is called, old rows are archived, new rows are inserted, and selectors/counts behave as specified.

### Task 6: Add the rerun controls inside Store Visit Monitor

**Files:**
- Modify: `src/app/[locale]/store-visit-monitor/page.tsx`
- Modify: `src/components/store-visit-monitor-client.tsx`
- Create: `src/components/store-visit-matching-rerun-dialog.tsx`

- [ ] **Step 1: Pass the manager/admin capability to the existing monitor client**

Read the current app session in the existing monitor page and pass `canRerunMatching = isAllowedAdminRole(session?.role)`; do not add a new page or expose controls in mobile H5.

- [ ] **Step 2: Add the range rerun toolbar**

Place a `Rerun matching` icon+text button beside the existing monitor export action. Open a compact dialog with date-from/date-to fields prefilled from the current monitor filter range, a clear confirmation that image AI will not be called, and a disabled submit button until the range is valid.

- [ ] **Step 3: Add the per-Visit row action**

Add a `Rerun matching` action beside `Open details` in each Visit row. It opens the same dialog in single-Visit mode, displays the Visit code/date, and prevents duplicate submission while running.

- [ ] **Step 4: Show execution states and refresh**

Show queued/running/completed/failed states, processed counts, new match method counts, skipped image reasons, and failed Visit messages in the dialog. On completion, refresh the monitor data and keep the existing details link so the newly generated matched SKU, review state, and snapshot are visible there.

- [ ] **Step 5: Handle unauthorized and demo states**

Hide controls for non-manager/admin users and disable them in demo mode. Surface backend validation/auth errors without navigating away from the monitor.

### Task 7: Verify integration, performance, and migration safety

**Files:**
- Modify: `docs/architecture/price-intelligence-v1.md` (only the current implementation section, if needed)
- Modify: `docs/superpowers/plans/2026-07-15-sku-match-rerun.md` (check off completed steps)

- [ ] **Step 1: Run the complete test suite**

Run `npm test` and verify zero failures.

- [ ] **Step 2: Run lint and build**

Run `npm run lint` and `npm run build`; fix all TypeScript, route, and client/server boundary errors before claiming completion.

- [ ] **Step 3: Run the focused matcher performance check**

Run a Node benchmark with 220 material rows, 327 active competitor rows, and 100 source SKUs; record index build and matching timings, confirming the matcher performs no database or AI calls inside the candidate loop.

- [ ] **Step 4: Verify migration/import invariants**

Run read-only SQL checks after migration/import: old products are `disabled`, exactly 327 new rows are `active`, own-brand rows are absent, competitor codes are unique, old snapshots still exist until a selected Visit is explicitly rerun, and old candidate rows are marked `reanalyzed` only for rerun targets.

- [ ] **Step 5: Verify the monitor interaction**

Use the running app with an admin session to exercise date-range and single-Visit dialogs, validation errors, repeated-click prevention, completion refresh, and the H5 detail’s updated match method/SKU. Confirm no new page or mobile control was added.

---

## Acceptance Criteria

- The new workbook imports as 327 active competitor products, with 21 brands, no own-brand rows, and integer `piece_count` values imported directly as total pieces.
- All old competitor products are disabled, not deleted; old `sku_matches` are cleared only for disabled products; unrelated price facts remain intact.
- New matching uses only explicit hard-rule methods and active master data; `DRYCARE`, `Medium`, and `Large` cases normalize correctly; ambiguous or conflicting products remain unmatched.
- Manual rerun supports an inclusive date range and one Visit ID/code from Store Visit Monitor, without calling image parsing AI.
- A rerun archives old candidates, replaces snapshots through the existing lifecycle, creates new pending/approved results, and updates the Visit detail H5 matched SKU display.
- The feature is available only in Store Visit Monitor for manager/admin users; no new page or mobile H5 control exists.
- `npm test`, `npm run lint`, and `npm run build` pass with fresh output.

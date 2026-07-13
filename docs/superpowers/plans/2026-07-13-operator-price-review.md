# Operator Price Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the existing technical photo-price workbench with a minimal operator anomaly queue whose manual confirmation, correction, or rejection atomically finalizes the candidate and creates the correctly SKU-owned Price Snapshot.

**Architecture:** Add a server-only operator review domain module that owns queue eligibility, plain-language reason mapping, minimal view models, exact source-image signing, and review-token derivation. Add dedicated list/detail APIs and client components, while extending the existing database approval/rejection RPCs so manual corrections and optional SKU correction are committed with the Price Snapshot in one locked transaction; automatic and bulk approval rules remain unchanged.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Supabase/PostgreSQL RPCs and RLS, Tailwind CSS, Node.js built-in test runner, ESLint.

---

## File map

- Create `src/lib/operator-price-review.ts`: operator queue eligibility, localized reason mapping, minimal list/detail view models, exact evidence resolution, pagination, and review-token helpers.
- Create `src/app/api/operator-price-reviews/route.ts`: authenticated paginated pending/processed list endpoint.
- Create `src/app/api/operator-price-reviews/[id]/route.ts`: authenticated detail endpoint and confirm/correct/reject mutation endpoint.
- Create `src/components/operator-price-review-workbench.tsx`: two-state operator list, responsive rows, pagination, and drawer orchestration.
- Create `src/components/operator-price-review-drawer.tsx`: minimal evidence drawer, price correction form, lazy SKU search, and final actions.
- Modify `src/lib/ai-price-review.ts`: accept opaque review token and optional final SKU ownership for manual review, while preserving automatic/bulk behavior.
- Modify `src/lib/types.ts`: add operator review view-model and mutation types.
- Modify `src/app/[locale]/offline-price-candidates/page.tsx`: load the operator queue and render the new workbench at the existing URL.
- Modify `src/components/app-shell.tsx`: rename the menu label to the operator-facing review name.
- Create `supabase/migrations/202607130002_operator_price_review_phase2.sql`: replace approval/rejection RPCs with review-token fencing and atomic manual correction/SKU correction.
- Create `tests/operator-price-review.test.mjs`: static architecture/contract tests for queue scope, minimal payload, source-image boundary, RPC transaction rules, and UI simplification.
- Modify `tests/offline-price-candidates-ui.test.mjs`: retire assertions that require the old technical workbench on the operator route.

### Task 1: Lock the operator domain contract with failing tests

**Files:**
- Create: `tests/operator-price-review.test.mjs`
- Modify: `tests/offline-price-candidates-ui.test.mjs`

- [ ] **Step 1: Write the failing operator-domain tests**

Create a Node test that reads the intended files and asserts these concrete contracts:

```js
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const read = (path) => existsSync(path) ? readFileSync(path, "utf8") : "";
const domain = read("src/lib/operator-price-review.ts");
const listRoute = read("src/app/api/operator-price-reviews/route.ts");
const detailRoute = read("src/app/api/operator-price-reviews/[id]/route.ts");
const page = read("src/app/[locale]/offline-price-candidates/page.tsx");
const workbench = read("src/components/operator-price-review-workbench.tsx");
const drawer = read("src/components/operator-price-review-drawer.tsx");
const migration = read("supabase/migrations/202607130002_operator_price_review_phase2.sql");

test("operator queue includes only terminal human-review candidates", () => {
  assert.match(domain, /REVIEW_REQUIRED/);
  assert.match(domain, /INSUFFICIENT_BENCHMARK/);
  assert.match(domain, /quality_gate_attempt_count[^\n]*>=?[^\n]*3|MAX_QUALITY_GATE_ATTEMPTS/);
  assert.doesNotMatch(domain, /quality_gate_status[^\n]*eq[^\n]*PROCESSING/);
  assert.match(domain, /review_method[^\n]*auto_rule|auto_rule/);
});

test("operator reason mapping is server-owned and hides technical metrics", () => {
  assert.match(domain, /buildOperatorReason/);
  assert.match(domain, /SKU_MATCH_UNCERTAIN/);
  assert.match(domain, /AMOUNT_SCALE_SUSPECTED/);
  assert.match(domain, /PRICE_DEVIATION_CRITICAL/);
  assert.match(domain, /PRICE_DEVIATION_HIGH/);
  assert.doesNotMatch(workbench, /benchmark_sample_count|benchmark_store_count|ai_confidence|match_score|raw JSON/i);
  assert.doesNotMatch(drawer, /benchmark_sample_count|benchmark_store_count|ai_confidence|match_score|quality_gate_version/i);
});

test("operator detail loads only the exact candidate source image", () => {
  assert.match(domain, /source_image_id/);
  assert.match(domain, /offline_visit_images/);
  assert.match(domain, /createSignedUrl/);
  assert.doesNotMatch(domain, /offline_visit_images\(\*\)/);
  assert.match(drawer, /原始证据不可用|Source evidence unavailable/);
});

test("manual review mutations are token fenced and atomic", () => {
  assert.match(migration, /p_review_token text/i);
  assert.match(migration, /for update of candidate/i);
  assert.match(migration, /approval_input_fingerprint is distinct from p_review_token/i);
  assert.match(migration, /p_review_method = 'manual'/i);
  assert.match(migration, /insert into public\.price_snapshots/i);
  assert.match(migration, /matched_entity_type = p_matched_entity_type/i);
  assert.match(detailRoute, /review_token/);
});

test("the existing route renders the operator workbench", () => {
  assert.match(page, /OperatorPriceReviewWorkbench/);
  assert.doesNotMatch(page, /AiPriceCandidatesWorkbench/);
  assert.match(workbench, /待处理|Pending/);
  assert.match(workbench, /已处理|Processed/);
  assert.doesNotMatch(workbench, /bulk|批量批准/i);
});

test("drawer exposes only the final operator actions and Visit link", () => {
  assert.match(drawer, /确认价格正确|Confirm price/);
  assert.match(drawer, /修正后通过|Correct and approve/);
  assert.match(drawer, /判定为错误|Mark as incorrect/);
  assert.match(drawer, /查看完整 Visit 详情|View full Visit details/);
  assert.match(drawer, /requires_product_correction/);
});

test("operator APIs require an admin session", () => {
  assert.match(listRoute, /requireAdminSession/);
  assert.match(detailRoute, /requireAdminSession/);
});
```

- [ ] **Step 2: Run the new test and verify RED**

Run: `node --test tests/operator-price-review.test.mjs`

Expected: FAIL because the operator domain, routes, components, and Phase 2 migration do not exist.

- [ ] **Step 3: Update legacy UI tests to describe the replacement boundary**

In `tests/offline-price-candidates-ui.test.mjs`, remove assertions that require `AiPriceCandidatesWorkbench`, bulk controls, technical columns, export, or four technical status tabs at `offline-price-candidates`. Keep all store-visit ingestion, H5 row identity, candidate write protection, and Price Snapshot ownership tests. Add assertions that the old workbench file still exists for one rollback cycle but is not imported by the route page.

- [ ] **Step 4: Run the focused tests and confirm only missing Phase 2 behavior fails**

Run: `node --test tests/operator-price-review.test.mjs tests/offline-price-candidates-ui.test.mjs`

Expected: operator review tests FAIL for missing implementation; retained legacy ingestion and write-boundary tests PASS.

- [ ] **Step 5: Commit the test contract**

```bash
git add tests/operator-price-review.test.mjs tests/offline-price-candidates-ui.test.mjs
git commit -m "test: define operator price review contract"
```

### Task 2: Implement operator queue eligibility, reason mapping, and exact evidence view models

**Files:**
- Create: `src/lib/operator-price-review.ts`
- Modify: `src/lib/types.ts`
- Test: `tests/operator-price-review.test.mjs`

- [ ] **Step 1: Add failing tests for exact reason priority and public fields**

Extend `tests/operator-price-review.test.mjs` with source assertions that require a fixed priority array and explicit list/detail keys:

```js
test("reason priority puts ownership and evidence before historical deviation", () => {
  assert.match(domain, /SKU_MATCH_UNCERTAIN[\s\S]*EVIDENCE_REVIEW_REQUIRED[\s\S]*AMOUNT_SCALE_SUSPECTED[\s\S]*PRICE_DEVIATION_CRITICAL[\s\S]*PRICE_DEVIATION_HIGH/);
});

test("operator view models expose a small explicit contract", () => {
  assert.match(domain, /OperatorPriceReviewListItem/);
  assert.match(domain, /OperatorPriceReviewDetail/);
  assert.match(domain, /operator_reason/);
  assert.match(domain, /review_token/);
  assert.match(domain, /visit_detail_href/);
  assert.doesNotMatch(domain, /\.\.\.candidate/);
});
```

- [ ] **Step 2: Run and verify RED**

Run: `node --test tests/operator-price-review.test.mjs`

Expected: FAIL because the fixed priority and explicit operator types are absent.

- [ ] **Step 3: Define operator types**

Add to `src/lib/types.ts`:

```ts
export type OperatorPriceReviewState = "pending" | "processed";
export type OperatorPriceReviewDecision = "confirmed" | "corrected" | "rejected";

export type OperatorPriceReviewListItem = {
  id: string;
  state: OperatorPriceReviewState;
  source_thumbnail_url: string | null;
  source_image_available: boolean;
  product_name: string;
  sku_label: string | null;
  ai_package_price: number | null;
  ai_piece_count: number | null;
  ai_price_per_piece: number | null;
  operator_reason: string;
  requires_product_correction: boolean;
  processed_decision: OperatorPriceReviewDecision | null;
  processed_at: string | null;
};

export type OperatorPriceReviewDetail = OperatorPriceReviewListItem & {
  source_image_id: string | null;
  source_image_url: string | null;
  evidence_product_text: string;
  evidence_package_price: number | null;
  evidence_piece_count: number | null;
  evidence_price_per_piece: number | null;
  historical_common_price_per_piece: number | null;
  current_match_type: AiPriceCandidateMatchType;
  current_match_id: string | null;
  current_match_label: string | null;
  review_token: string;
  visit_detail_href: string;
};
```

- [ ] **Step 4: Implement the server-only domain module**

In `src/lib/operator-price-review.ts`:

- Use `import "server-only"`.
- Define `MAX_QUALITY_GATE_ATTEMPTS = 3`.
- Query only active SKU candidates (`candidate_type = SKU`, `h5_lifecycle_status is null`, not deleted/replaced).
- Pending eligibility is exactly `REVIEW_REQUIRED`, `INSUFFICIENT_BENCHMARK`, or `FAILED` with attempts at least 3.
- Processed eligibility is `status in (approved,rejected)`, `review_method in (manual,bulk_manual)`, and excludes `auto_rule`.
- Format one localized reason using the fixed priority from the design. Historical reasons use rounded deviation and benchmark values, e.g. `这款商品过去通常约 Rp 2,140/片，本次识别为 Rp 2,865/片，高出约 34%。`.
- `requires_product_correction` is true when match type is `unmatched`, match id is empty, reason includes `SKU_MATCH_UNCERTAIN`, or match score is below the fixed manual-certainty threshold.
- Derive `processed_decision` as `rejected` for rejected rows, `corrected` when final price/pieces/SKU differ from immutable `ai_*` ownership/value fields, otherwise `confirmed`.
- Resolve the exact image by `source_image_id`; only fall back to `source_image_path` after verifying its row belongs to `candidate.visit_id`. Sign `thumbnail_path ?? image_path` for list and `image_path` for detail from `offline-visit-images`. Missing rows or signing failures return `null` and `source_image_available = false`.
- Map rows field-by-field; do not spread database rows into API models.
- Return `{ data, total, page, perPage, error, isDemo }` consistently with existing page loaders.

- [ ] **Step 5: Run and verify GREEN**

Run: `node --test tests/operator-price-review.test.mjs`

Expected: reason, view-model, queue-scope, and evidence-boundary tests PASS; route/component/migration tests remain RED.

- [ ] **Step 6: Run type and lint checks for the new domain**

Run: `npx eslint src/lib/operator-price-review.ts src/lib/types.ts`

Expected: PASS with no warnings.

- [ ] **Step 7: Commit the operator domain**

```bash
git add src/lib/operator-price-review.ts src/lib/types.ts tests/operator-price-review.test.mjs
git commit -m "feat: add operator price review view models"
```

### Task 3: Extend approval and rejection into token-fenced atomic manual review

**Files:**
- Create: `supabase/migrations/202607130002_operator_price_review_phase2.sql`
- Modify: `src/lib/ai-price-review.ts`
- Test: `tests/operator-price-review.test.mjs`
- Test: `tests/price-quality-gate.test.mjs`

- [ ] **Step 1: Add failing database-boundary tests**

Add assertions requiring:

```js
test("manual approval permits final values while automated approval remains strict", () => {
  assert.match(migration, /if p_review_method in \('auto_rule', 'bulk_manual'\)[\s\S]*p_price_idr is distinct from v_net_price/i);
  assert.match(migration, /if p_review_method = 'manual'[\s\S]*v_net_price := p_price_idr/i);
  assert.match(migration, /v_piece_count := p_piece_count/i);
  assert.match(migration, /v_price_per_piece := round\(v_net_price \/ v_piece_count/i);
});

test("manual SKU correction validates one legal owner", () => {
  assert.match(migration, /p_matched_entity_type text/i);
  assert.match(migration, /material_master/i);
  assert.match(migration, /competitor_products/i);
  assert.match(migration, /Please match a product before approving/i);
  assert.match(migration, /price_snapshots_single_product_owner_check|p_competitor_product_id.*p_sku_master_id/s);
});

test("rejection is protected by the same review token", () => {
  assert.match(migration, /reject_ai_price_candidate_with_quality_gate\([\s\S]*p_review_token text/i);
  assert.match(migration, /approval_input_fingerprint is distinct from p_review_token/i);
});
```

- [ ] **Step 2: Run and verify RED**

Run: `node --test tests/operator-price-review.test.mjs tests/price-quality-gate.test.mjs`

Expected: new Phase 2 RPC assertions FAIL; Phase 1 gate invariants PASS.

- [ ] **Step 3: Implement the Phase 2 migration**

Create `supabase/migrations/202607130002_operator_price_review_phase2.sql` that:

- Drops the old function signatures only after creating replacement signatures.
- Adds `p_review_token text` and `p_matched_entity_type text` to approval; adds `p_review_token text` to rejection.
- Locks the candidate with `FOR UPDATE` before checking state.
- Requires `status = pending`, a non-empty token, and `approval_input_fingerprint = p_review_token` for every manual mutation.
- Requires manual gate status to be `REVIEW_REQUIRED`, `INSUFFICIENT_BENCHMARK`, or exhausted `FAILED`; continues to require `PASSED` plus current quality fingerprint for `auto_rule` and `bulk_manual`.
- For `auto_rule` and `bulk_manual`, preserves strict equality between submitted price/pieces/promo/SKU and current candidate values.
- For `manual`, accepts submitted positive package price and integer piece count as final values and computes `round(price / pieces, 4)` inside PostgreSQL.
- For `manual`, validates `material_master` by `tenant_sku_code`, resolves/creates the linked `sku_master` through the same bridge semantics used by `ensureSkuMasterFromMaterial`, or validates `competitor_product` by UUID in `competitor_products`.
- Rejects `unmatched`, empty ownership, both owners, or neither owner.
- Updates only mutable final candidate fields (`parsed_price_idr`, `list_price_idr`, `package_price_idr`, `net_price_idr`, `piece_count`, `price_per_piece`, reviewed fields, matched fields); immutable `ai_*` fields remain untouched.
- Creates/reuses one `offline_ai_confirmed` Price Snapshot with the selected Makuku or competitor owner, source Visit/image, final package price, and final per-piece price.
- Marks the candidate approved and writes reviewer, method, timestamp, and snapshot id in the same transaction.
- Reject RPC validates the token, marks the candidate rejected, and writes audit fields in the same locked transaction.
- Revokes both old and new function signatures from public/anon/authenticated and grants only the new signatures to `service_role`.

- [ ] **Step 4: Update the TypeScript review service**

Change `approveAiPriceCandidate` input to include:

```ts
reviewToken?: string | null;
matchedEntityType?: AiPriceCandidateMatchType | null;
matchedEntityId?: string | null;
matchedLabel?: string | null;
```

For manual review, use `reviewToken` and submitted final values; resolve the requested final owner without first updating `ai_price_candidates`. For automatic/bulk review, retain candidate fingerprint and current ownership behavior. Pass all final values to the replacement RPC. Change `rejectAiPriceCandidate` to require and pass `reviewToken` for manual rejection.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run: `node --test tests/operator-price-review.test.mjs tests/price-quality-gate.test.mjs tests/ai-price-candidate-bulk-review.test.mjs tests/competitor-review-ingestion.test.mjs`

Expected: all focused tests PASS; auto/bulk callers still use the passed-gate path.

- [ ] **Step 6: Run lint**

Run: `npx eslint src/lib/ai-price-review.ts`

Expected: PASS with no warnings.

- [ ] **Step 7: Commit the atomic review boundary**

```bash
git add supabase/migrations/202607130002_operator_price_review_phase2.sql src/lib/ai-price-review.ts tests/operator-price-review.test.mjs
git commit -m "feat: add atomic operator price decisions"
```

### Task 4: Add authenticated minimal list/detail/mutation APIs

**Files:**
- Create: `src/app/api/operator-price-reviews/route.ts`
- Create: `src/app/api/operator-price-reviews/[id]/route.ts`
- Test: `tests/operator-price-review.test.mjs`

- [ ] **Step 1: Add failing API contract tests**

Require the list route to accept only `state`, `page`, `per_page`, `date_from`, `date_to`, and `visit_code`, and the detail route to expose only GET/PATCH with `confirm`, `correct`, and `reject` actions. Require 409 mapping for stale/processed conflicts and 400 for invalid amounts, pieces, or SKU owner.

- [ ] **Step 2: Run and verify RED**

Run: `node --test tests/operator-price-review.test.mjs`

Expected: FAIL because the API routes do not exist.

- [ ] **Step 3: Implement the list route**

`GET /api/operator-price-reviews` must:

- Call `requireAdminSession`.
- Normalize state to `pending` or `processed`.
- Clamp page to at least 1 and per-page to 10-100.
- Call `getOperatorPriceReviewsPage`.
- Return only `{ items, total, page, per_page }` or `{ error }`.

- [ ] **Step 4: Implement the detail and mutation route**

`GET /api/operator-price-reviews/[id]?locale=zh` loads `getOperatorPriceReviewDetail`; return 404 if the candidate is outside the operator queue.

`PATCH` must:

- Call `requireAdminSession` and use the authenticated session display name as reviewer; ignore a client-supplied reviewer.
- Validate `review_token` for all actions.
- `confirm`: submit evidence values and optional locally selected SKU to `approveAiPriceCandidate`.
- `correct`: require positive finite `package_price`, positive integer `piece_count`, and optional final SKU; call `approveAiPriceCandidate` once.
- `reject`: call `rejectAiPriceCandidate` with fixed audit reason `operator_marked_incorrect` and the token.
- Convert stale token, already processed, and ownership-lost database messages to HTTP 409.
- Convert input and missing-SKU messages to HTTP 400.
- Revalidate the review route, prices route, Visit detail route, competitors route, and competitor-products route after success.
- Return `{ candidate_id, snapshot_id, decision }` for approvals and `{ candidate_id, decision: "rejected" }` for rejection; do not return database rows.

- [ ] **Step 5: Run and verify GREEN**

Run: `node --test tests/operator-price-review.test.mjs tests/pc-auth-protection.test.mjs`

Expected: PASS.

- [ ] **Step 6: Run lint**

Run: `npx eslint src/app/api/operator-price-reviews/route.ts 'src/app/api/operator-price-reviews/[id]/route.ts'`

Expected: PASS with no warnings.

- [ ] **Step 7: Commit the operator APIs**

```bash
git add src/app/api/operator-price-reviews tests/operator-price-review.test.mjs
git commit -m "feat: add operator price review APIs"
```

### Task 5: Build the minimal operator list and drawer

**Files:**
- Create: `src/components/operator-price-review-workbench.tsx`
- Create: `src/components/operator-price-review-drawer.tsx`
- Test: `tests/operator-price-review.test.mjs`

- [ ] **Step 1: Add failing UI behavior assertions**

Require source thumbnail/product/AI price/reason/action in each row; two tabs only; drawer lazy GET; correction inputs hidden until action; per-piece preview; product selector fetches `/api/store-visit/match-options` only when correction is opened; buttons disabled while submitting; Visit link always rendered; no technical labels or bulk controls.

- [ ] **Step 2: Run and verify RED**

Run: `node --test tests/operator-price-review.test.mjs`

Expected: FAIL because the components do not exist.

- [ ] **Step 3: Implement the workbench**

Create a client component that:

- Receives initial paginated list data and current filters from the server page.
- Renders exactly `待处理 / Pending` and `已处理 / Processed` tabs.
- Uses table rows on desktop and compact cards on narrow screens.
- Shows exact thumbnail or a neutral `无来源图片 / No source image` placeholder, product/SKU, formatted package price, the single operator reason, and `查看并处理 / View and handle`.
- Opens the drawer with candidate id and fetches detail lazily.
- Removes a successfully processed pending row and refreshes counts with `router.refresh()`.
- Preserves date, visit-code, state, page, and per-page parameters in tab/pagination links.

- [ ] **Step 4: Implement the drawer**

Create a client component that:

- Uses a fixed right drawer on desktop and full-height bottom sheet on narrow screens.
- Renders in strict order: conclusion, reason, exact image/unavailable state, evidence summary, actions, Visit link.
- Defaults to three action buttons only.
- Expands package-price and piece-count inputs only after `修正后通过`.
- Calculates `Math.round(packagePrice / pieceCount * 100) / 100` for preview, while the server/database remains authoritative.
- Shows `修正商品` only when `requires_product_correction` is true; fetches `/api/store-visit/match-options` only after opening that section and stores the selection locally until final submission.
- Blocks confirm/correct if the current owner is unmatched.
- Sends the detail `review_token` with every PATCH.
- On 409, shows `这条价格已发生变化，请刷新后重新确认。`; on other errors, preserves inputs and shows the returned message.
- Always renders `visit_detail_href` as `查看完整 Visit 详情 →`.

- [ ] **Step 5: Run and verify GREEN**

Run: `node --test tests/operator-price-review.test.mjs`

Expected: PASS.

- [ ] **Step 6: Run component lint**

Run: `npx eslint src/components/operator-price-review-workbench.tsx src/components/operator-price-review-drawer.tsx`

Expected: PASS with no warnings.

- [ ] **Step 7: Commit the operator UI**

```bash
git add src/components/operator-price-review-workbench.tsx src/components/operator-price-review-drawer.tsx tests/operator-price-review.test.mjs
git commit -m "feat: build minimal operator price review UI"
```

### Task 6: Replace the existing route and finish regression verification

**Files:**
- Modify: `src/app/[locale]/offline-price-candidates/page.tsx`
- Modify: `src/components/app-shell.tsx`
- Modify: `tests/offline-price-candidates-ui.test.mjs`
- Test: `tests/operator-price-review.test.mjs`

- [ ] **Step 1: Add failing route replacement assertions**

Require the page to call `getOperatorPriceReviewsPage`, render `OperatorPriceReviewWorkbench`, retain date/visit-code filters, omit export/image-id/technical rule loading, and use the menu/page label `价格异常审核 / Price Anomaly Review`.

- [ ] **Step 2: Run and verify RED**

Run: `node --test tests/operator-price-review.test.mjs tests/offline-price-candidates-ui.test.mjs`

Expected: FAIL because the page still imports the technical workbench.

- [ ] **Step 3: Replace the route page**

Update the page to:

- Parse only state, dates, visit code, page, and per-page.
- Load `getOperatorPriceReviewsPage` directly on the server.
- Keep the existing `PageShellState`, `DataNotice`, compact date range, and batch code filters.
- Render `OperatorPriceReviewWorkbench` inside one Card.
- Remove export, image-id filtering, technical status parsing, `getAiPriceReviewRule`, and `AiPriceCandidatesWorkbench` imports.

Rename the menu entry in `src/components/app-shell.tsx` to `价格异常审核 / Price Anomaly Review` without changing its URL.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `node --test tests/operator-price-review.test.mjs tests/offline-price-candidates-ui.test.mjs tests/price-quality-gate.test.mjs tests/ai-price-candidate-bulk-review.test.mjs tests/competitor-review-ingestion.test.mjs tests/price-snapshot-sku-link.test.mjs tests/pc-auth-protection.test.mjs`

Expected: all focused tests PASS.

- [ ] **Step 5: Run full lint and production build**

Run: `npm run lint`

Expected: PASS with no errors or warnings.

Run: `npm run build`

Expected: Next.js production build PASS, including TypeScript validation.

- [ ] **Step 6: Run the full Node test suite and classify unrelated baseline failures**

Run: `node --test tests/*.test.mjs`

Expected: all Phase 1/Phase 2, ingestion, authorization, and snapshot ownership tests PASS. If the known `market-benchmark-boundary.test.mjs` dashboard-refactor baseline remains, record it separately and confirm no new failures.

- [ ] **Step 7: Commit the route replacement**

```bash
git add src/app/[locale]/offline-price-candidates/page.tsx src/components/app-shell.tsx tests/offline-price-candidates-ui.test.mjs tests/operator-price-review.test.mjs
git commit -m "feat: replace photo review with operator anomaly queue"
```

- [ ] **Step 8: Request independent review and address findings with TDD**

Use `superpowers:requesting-code-review` against the branch diff from `b9919ab` to `HEAD`. For every valid finding, add a failing regression test, verify RED, implement the smallest fix, verify GREEN, and commit the fix separately.

- [ ] **Step 9: Perform final verification before completion**

Use `superpowers:verification-before-completion`, rerun the focused suite, full lint, production build, and full Node suite, and report exact pass/fail counts. Do not apply the migration to any shared database without an explicit target and deployment authorization.

# Price And Evidence Reasons Implementation Plan

> **For agentic workers:** Execute inline with a red-green-refactor cycle. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record price-deviation findings even when the same candidate also has evidence or product-association uncertainty, then show both in the operator review list and drawer with the stored benchmark value and signed deviation percentage.

**Architecture:** The quality gate remains the single source of stored reason codes and benchmark facts. It evaluates evidence, association, and historical plausibility independently before determining its conservative final status. A server-side view-model builder maps stored facts to bilingual operator reason groups; React only renders those groups and never recomputes deviation.

**Tech Stack:** Next.js App Router, TypeScript, Supabase/PostgreSQL migrations, Node `node:test`, ESLint.

---

### Task 1: Lock the independent-reason rule with regression tests

**Files:**
- Modify: `tests/price-quality-gate.test.mjs`
- Modify: `tests/operator-price-review.test.mjs`

- [ ] Add a quality-gate test for a READY benchmark where evidence requires review and the price is 34% above baseline; assert both `EVIDENCE_REVIEW_REQUIRED` and `PRICE_DEVIATION_HIGH`, stored `34` deviation, and `REVIEW_REQUIRED`.
- [ ] Add a view-model test asserting a candidate with a critical price deviation and evidence issue yields an ordered `PRICE` group and a `CONFIRMATION` group; assert the price group includes baseline, AI per-piece price, and signed deviation.
- [ ] Run the two named tests and confirm they fail because the current gate returns before calculating historical price plausibility and the view model has no grouped reasons.

### Task 2: Evaluate all three quality dimensions before final status

**Files:**
- Modify: `src/lib/price-quality-gate.ts`

- [ ] Collect evidence and association reason codes without returning.
- [ ] When a benchmark is READY and a positive per-piece price is present, calculate scale, 30%, 50%, and promotion reasons regardless of prior evidence or association findings.
- [ ] Return `REVIEW_REQUIRED` whenever any reason exists; preserve cold-start pass behavior only when no evidence, association, or promotion reason exists.
- [ ] Run the named quality-gate test and confirm it passes.

### Task 3: Deliver a minimal, grouped operator view model

**Files:**
- Modify: `src/lib/types.ts`
- Modify: `src/lib/operator-price-review.ts`
- Modify: `src/components/operator-price-review-workbench.tsx`
- Modify: `src/components/operator-price-review-drawer.tsx`

- [ ] Add the `OperatorPriceReviewReasonGroup` contract and expose groups on list and detail models, while retaining `operator_reason` as a derived compatibility string.
- [ ] Map price reason codes to an ordered `PRICE` group using persisted gate values only; format baseline, AI per-piece value, and signed rounded deviation in Chinese and English.
- [ ] Map all evidence and association findings to a separate `CONFIRMATION` group; keep reason-code names, sample counts, confidence and JSON hidden.
- [ ] Render a compact price-first summary in the list and complete groups in the drawer. If no price reason exists, show only confirmation reasons.
- [ ] Run the named operator-review test and confirm it passes.

### Task 4: Re-evaluate eligible mature historical candidates

**Files:**
- Create: `supabase/migrations/202607140005_requeue_ready_price_quality_reason_codes.sql`
- Modify: `tests/price-quality-gate.test.mjs`

- [ ] Create an explicit service-only RPC that resets only active pending SKU candidates with a READY benchmark, no snapshot, and a prior terminal review result; clear stale gate output and preserve source evidence and review audit history.
- [ ] Do not call the RPC automatically in the migration. The existing bounded worker will evaluate rows after an operator/admin invokes it.
- [ ] Add migration contract tests and run them.

### Task 5: Verify

**Files:**
- Test: `tests/price-quality-gate.test.mjs`
- Test: `tests/operator-price-review.test.mjs`

- [ ] Run both focused suites, `npm run lint`, and `npx tsc --noEmit`.
- [ ] Inspect the final diff to verify no frontend deviation calculation, no real-time benchmark aggregation, and no changes to Price Snapshot approval semantics.

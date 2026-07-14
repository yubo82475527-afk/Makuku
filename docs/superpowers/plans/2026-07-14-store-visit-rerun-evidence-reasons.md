# Visit Rerun Evidence Reasons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Visit reanalysis process every requested image and keep operator reasons and matched-product labels semantically accurate.

**Architecture:** Restrict persisted-image reconciliation to initial analysis jobs, leaving reanalysis jobs on the existing forced-analysis path. Keep reason ownership in the server View Model and separate product-label display from the correction-required flag.

**Tech Stack:** Next.js, TypeScript, Supabase, Node test runner.

---

### Task 1: Reanalysis reconciliation boundary

**Files:**
- Modify: `tests/store-visit-auto-analyze.test.mjs`
- Modify: `src/lib/store-visit-ai-jobs.ts`

- [ ] **Step 1: Write the failing test**

Add assertions that `reconcileStoreVisitAiJobFromImages` returns without reconciling when `job.job_type` is `single_image_reanalysis` or `full_visit_reanalysis`, while retaining reconciliation for `initial_analysis`.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
node --test --test-name-pattern="reanalysis jobs never reconcile from pre-existing image status" tests/store-visit-auto-analyze.test.mjs
```

Expected: FAIL because the job-type guard does not exist.

- [ ] **Step 3: Implement the minimal boundary**

At the start of `reconcileStoreVisitAiJobFromImages`, return the existing job and items unless `input.job.job_type === "initial_analysis"`.

- [ ] **Step 4: Run focused and full store-visit tests**

```powershell
node --test tests/store-visit-auto-analyze.test.mjs
```

Expected: PASS.

### Task 2: Precise operator reason fallback

**Files:**
- Modify: `tests/operator-price-review.test.mjs`
- Modify: `src/lib/operator-price-review.ts`

- [ ] **Step 1: Write failing reason-priority tests**

Assert that the historical message is gated by explicit `LEGACY_EVIDENCE_UNAVAILABLE` or complete absence of evidence, and that evidence-bearing `EVIDENCE_REVIEW_REQUIRED` candidates use a current-evidence fallback.

- [ ] **Step 2: Run the focused test and verify RED**

```powershell
node --test --test-name-pattern="operator reason reserves legacy evidence copy" tests/operator-price-review.test.mjs
```

Expected: FAIL because the current fallback maps all review-required evidence to the historical message.

- [ ] **Step 3: Implement server-owned fallback**

Keep explicit reason-code mappings unchanged. Add a `hasCurrentEvidence` check from `price_evidence_detail` and `price_evidence_status`; show historical copy only when evidence is absent, otherwise show a neutral current-evidence review explanation.

- [ ] **Step 4: Run operator review tests**

```powershell
node --test tests/operator-price-review.test.mjs
```

Expected: PASS.

### Task 3: Matched product display

**Files:**
- Modify: `tests/operator-price-review.test.mjs`
- Modify: `src/components/operator-price-review-workbench.tsx`

- [ ] **Step 1: Write a failing display-priority test**

Assert that `productAssociationLabel` returns `item.sku_label` before considering `item.requires_product_correction`.

- [ ] **Step 2: Run the focused test and verify RED**

```powershell
node --test --test-name-pattern="operator list keeps matched SKU label" tests/operator-price-review.test.mjs
```

Expected: FAIL because correction state currently replaces the label.

- [ ] **Step 3: Implement label-first display**

Return `item.sku_label` when present; otherwise return the existing correction or unconfirmed fallback copy.

- [ ] **Step 4: Run related tests and build**

```powershell
node --test tests/store-visit-auto-analyze.test.mjs tests/operator-price-review.test.mjs tests/price-evidence-reason.test.mjs tests/price-quality-gate.test.mjs
npx eslint src/lib/store-visit-ai-jobs.ts src/lib/operator-price-review.ts src/components/operator-price-review-workbench.tsx tests/store-visit-auto-analyze.test.mjs tests/operator-price-review.test.mjs
npm run build
git diff --check
```

Expected: all focused tests, lint, build, and diff check pass.

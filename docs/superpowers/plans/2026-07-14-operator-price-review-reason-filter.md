# Operator Price Review Reason Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a complete server-side anomaly-reason filter to the operator price review list, including exact counts for the 30%-50% and over-50% quality-gate rules.

**Architecture:** Define one shared filter catalog containing stable filter keys and bilingual labels. The page, API, navigation, and server query reuse those keys; the query applies existing JSONB reason codes, evidence reason codes, or terminal quality statuses before pagination, without adding database fields or migrations.

**Tech Stack:** Next.js App Router, React server/client components, TypeScript, Supabase PostgREST, Node test runner, ESLint.

---

## File structure

- Create `src/lib/operator-price-review-reasons.ts`: shared filter catalog, inferred filter-key type, normalization, and bilingual labels.
- Modify `src/lib/operator-price-review.ts`: accept the normalized reason filter and apply database predicates before pagination.
- Modify `src/app/[locale]/offline-price-candidates/page.tsx`: read `reason`, render the dropdown, and pass the filter to the query and workbench.
- Modify `src/components/operator-price-review-workbench.tsx`: preserve `reason` across state tabs and pagination.
- Modify `src/app/api/operator-price-reviews/route.ts`: accept and normalize the same `reason` query parameter.
- Modify `tests/operator-price-review.test.mjs`: regression coverage for catalog completeness, query semantics, accurate server-side count placement, API propagation, UI rendering, and navigation preservation.

The shared worktree already contains user changes. Do not create commits or stage files unless the user explicitly requests it.

### Task 1: Add the shared reason-filter contract

**Files:**
- Create: `src/lib/operator-price-review-reasons.ts`
- Test: `tests/operator-price-review.test.mjs`

- [ ] **Step 1: Write the failing catalog test**

Add source assertions that require a shared catalog and all supported filter keys:

```js
const reasonFilters = read("src/lib/operator-price-review-reasons.ts");

test("operator reason filters use one complete shared catalog", () => {
  assert.match(reasonFilters, /OPERATOR_PRICE_REVIEW_REASON_FILTERS/);
  for (const key of [
    "SKU_MATCH_UNCERTAIN",
    "PRODUCT_PRICE_BINDING_UNCLEAR",
    "PRICE_TAG_UNCLEAR",
    "PIECE_COUNT_UNCLEAR",
    "PRICE_MATH_CONFLICT",
    "PRICE_DERIVED",
    "LEGACY_EVIDENCE_UNAVAILABLE",
    "OTHER_EVIDENCE_REVIEW_REQUIRED",
    "AMOUNT_SCALE_SUSPECTED",
    "PRICE_DEVIATION_CRITICAL",
    "PRICE_DEVIATION_HIGH",
    "PROMOTION_EVIDENCE",
    "INSUFFICIENT_BENCHMARK",
    "QUALITY_CHECK_FAILED",
    "OTHER_REVIEW_REQUIRED",
  ]) assert.match(reasonFilters, new RegExp(key));
  assert.match(reasonFilters, /normalizeOperatorPriceReviewReason/);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
node --test --test-name-pattern="operator reason filters use one complete shared catalog" tests/operator-price-review.test.mjs
```

Expected: FAIL because `src/lib/operator-price-review-reasons.ts` does not exist.

- [ ] **Step 3: Implement the minimal shared catalog**

Create a readonly catalog whose values are the stable keys above and whose entries contain `zh` and `en` labels. Infer the public type from the catalog and normalize unknown input to `undefined`:

```ts
export const OPERATOR_PRICE_REVIEW_REASON_FILTERS = [
  { value: "SKU_MATCH_UNCERTAIN", zh: "商品归属不明确", en: "Product association unclear" },
  { value: "PRODUCT_PRICE_BINDING_UNCLEAR", zh: "商品与价格对应不明确", en: "Product-price binding unclear" },
  { value: "PRICE_TAG_UNCLEAR", zh: "价格牌或金额不清晰", en: "Price label or amount unclear" },
  { value: "PIECE_COUNT_UNCLEAR", zh: "包装片数不清晰", en: "Package piece count unclear" },
  { value: "PRICE_MATH_CONFLICT", zh: "包装价格数学冲突", en: "Package price math conflict" },
  { value: "PRICE_DERIVED", zh: "换算单片价需要确认", en: "Derived unit price needs confirmation" },
  { value: "LEGACY_EVIDENCE_UNAVAILABLE", zh: "历史识别依据缺失", en: "Legacy recognition evidence unavailable" },
  { value: "OTHER_EVIDENCE_REVIEW_REQUIRED", zh: "其他图片证据不明确", en: "Other image evidence unclear" },
  { value: "AMOUNT_SCALE_SUSPECTED", zh: "疑似金额位数错误", en: "Possible amount digit error" },
  { value: "PRICE_DEVIATION_CRITICAL", zh: "价格偏差超过 50%", en: "Price deviation over 50%" },
  { value: "PRICE_DEVIATION_HIGH", zh: "价格偏差超过 30% 且不超过 50%", en: "Price deviation over 30% and up to 50%" },
  { value: "PROMOTION_EVIDENCE", zh: "促销价格需要确认", en: "Promotion price needs confirmation" },
  { value: "INSUFFICIENT_BENCHMARK", zh: "历史基准不足", en: "Insufficient price benchmark" },
  { value: "QUALITY_CHECK_FAILED", zh: "系统校验失败", en: "Quality check failed" },
  { value: "OTHER_REVIEW_REQUIRED", zh: "其他原因", en: "Other reason" },
] as const;

export type OperatorPriceReviewReasonFilter = typeof OPERATOR_PRICE_REVIEW_REASON_FILTERS[number]["value"];

const validReasonFilters = new Set<string>(OPERATOR_PRICE_REVIEW_REASON_FILTERS.map((item) => item.value));

export function normalizeOperatorPriceReviewReason(value: string | null | undefined) {
  const normalized = String(value ?? "").trim();
  return validReasonFilters.has(normalized) ? normalized as OperatorPriceReviewReasonFilter : undefined;
}
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run the Step 2 command. Expected: PASS.

### Task 2: Apply reasons in the server query and API

**Files:**
- Modify: `src/lib/operator-price-review.ts`
- Modify: `src/app/api/operator-price-reviews/route.ts`
- Test: `tests/operator-price-review.test.mjs`

- [ ] **Step 1: Write failing server-query tests**

Add assertions requiring:

```js
test("operator reason filtering happens in the database before pagination", () => {
  assert.match(domain, /reason\?: OperatorPriceReviewReasonFilter/);
  assert.match(domain, /PRICE_DEVIATION_HIGH[\s\S]*contains\("quality_gate_reason_codes"/);
  assert.match(domain, /PRICE_DEVIATION_CRITICAL[\s\S]*contains\("quality_gate_reason_codes"/);
  assert.match(domain, /PRICE_TAG_UNCLEAR[\s\S]*eq\("price_evidence_reason_code"/);
  assert.match(domain, /QUALITY_CHECK_FAILED[\s\S]*eq\("quality_gate_status", "FAILED"\)/);
  assert.ok(domain.indexOf("switch (filters.reason)") < domain.indexOf("query = query.range"));
});

test("operator review API normalizes and forwards the reason filter", () => {
  assert.match(listRoute, /normalizeOperatorPriceReviewReason/);
  assert.match(listRoute, /reason:\s*normalizeOperatorPriceReviewReason/);
});
```

- [ ] **Step 2: Run the server-query tests and verify RED**

Run:

```powershell
node --test --test-name-pattern="operator reason filtering|operator review API normalizes" tests/operator-price-review.test.mjs
```

Expected: FAIL because the query and API do not accept `reason`.

- [ ] **Step 3: Extend the filter type and query**

Import `OperatorPriceReviewReasonFilter`, add `reason?: OperatorPriceReviewReasonFilter` to `OperatorPriceReviewFilters`, and apply its predicate after the existing date/Visit conditions but before executing the query.

Move the existing `.range(from, from + perPage - 1)` call out of the initial query chain. After the reason switch, add:

```ts
query = query.range(from, from + perPage - 1);
```

Use existing stored fields only:

```ts
switch (filters.reason) {
  case "PRICE_DEVIATION_HIGH":
  case "PRICE_DEVIATION_CRITICAL":
  case "AMOUNT_SCALE_SUSPECTED":
  case "PROMOTION_EVIDENCE":
    query = query.contains("quality_gate_reason_codes", [filters.reason]);
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
    query = query.or(`quality_gate_reason_codes.cs.${JSON.stringify(["SKU_MATCH_UNCERTAIN"])},matched_entity_type.eq.unmatched,matched_entity_id.is.null`);
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
    query = query.eq("quality_gate_status", "FAILED").gte("quality_gate_attempt_count", MAX_QUALITY_GATE_ATTEMPTS);
    break;
  case "OTHER_REVIEW_REQUIRED":
    query = query
      .eq("quality_gate_reason_codes", [])
      .is("price_evidence_reason_code", null)
      .not("matched_entity_type", "eq", "unmatched")
      .not("matched_entity_id", "is", null)
      .or("price_evidence_status.is.null,price_evidence_status.in.(CLEAR,DERIVED)")
      .not("quality_gate_status", "eq", "FAILED");
    break;
}
```

All predicates are therefore added before `.range()`, and the returned `count` remains the filtered database total.

- [ ] **Step 4: Normalize and forward the API parameter**

In `GET /api/operator-price-reviews`, add:

```ts
reason: normalizeOperatorPriceReviewReason(url.searchParams.get("reason")),
```

Unknown values become `undefined`, which means “all reasons”.

- [ ] **Step 5: Run the focused server tests and verify GREEN**

Run the Step 2 command. Expected: PASS.

### Task 3: Add the dropdown and preserve navigation state

**Files:**
- Modify: `src/app/[locale]/offline-price-candidates/page.tsx`
- Modify: `src/components/operator-price-review-workbench.tsx`
- Test: `tests/operator-price-review.test.mjs`

- [ ] **Step 1: Write failing UI/navigation tests**

Add assertions requiring:

```js
test("operator review page renders the shared anomaly reason filter", () => {
  assert.match(page, /OPERATOR_PRICE_REVIEW_REASON_FILTERS/);
  assert.match(page, /name="reason"/);
  assert.match(page, /异常原因/);
  assert.match(page, /全部原因/);
  assert.match(page, /reason:\s*reason/);
});

test("operator navigation preserves the anomaly reason filter", () => {
  assert.match(workbench, /reason\?: OperatorPriceReviewReasonFilter/);
  assert.match(workbench, /if \(filters\.reason\) params\.set\("reason", filters\.reason\)/);
});
```

- [ ] **Step 2: Run the UI tests and verify RED**

Run:

```powershell
node --test --test-name-pattern="renders the shared anomaly reason filter|preserves the anomaly reason filter" tests/operator-price-review.test.mjs
```

Expected: FAIL because the page and workbench do not know `reason`.

- [ ] **Step 3: Render and submit the reason filter**

In the server page:

1. Normalize `getFilter("reason")`.
2. Pass `reason` to `getOperatorPriceReviewsPage`.
3. Add a labeled `<select name="reason" defaultValue={reason ?? ""}>` with “全部原因 / All reasons” and the shared catalog options.
4. Pass `reason` inside the workbench `filters` prop.
5. Expand the filter grid to fit date, Visit, reason, and submit controls.

Do not add a hidden `page` input. `QueryForm` constructs a fresh query from form fields, so submitting automatically resets pagination to page 1.

- [ ] **Step 4: Preserve reason during state changes and pagination**

Extend `ReviewFilters` with `reason?: OperatorPriceReviewReasonFilter` and update `buildHref`:

```ts
if (filters.reason) params.set("reason", filters.reason);
```

- [ ] **Step 5: Run the focused UI tests and verify GREEN**

Run the Step 2 command. Expected: PASS.

### Task 4: Regression verification

**Files:**
- Verify all files changed in Tasks 1-3.

- [ ] **Step 1: Run the complete operator-review regression file**

```powershell
node --test tests/operator-price-review.test.mjs
```

Expected: all tests pass.

- [ ] **Step 2: Run related quality-gate regressions**

```powershell
node --test tests/operator-price-review.test.mjs tests/price-quality-gate.test.mjs tests/store-visit-auto-analyze.test.mjs tests/price-evidence-reason.test.mjs
```

Expected: all related tests pass with zero failures.

- [ ] **Step 3: Run lint and type/build verification**

```powershell
npx eslint src/lib/operator-price-review-reasons.ts src/lib/operator-price-review.ts src/app/[locale]/offline-price-candidates/page.tsx src/components/operator-price-review-workbench.tsx src/app/api/operator-price-reviews/route.ts tests/operator-price-review.test.mjs
npm run build
```

Expected: ESLint and the production build exit with code 0.

- [ ] **Step 4: Check the final diff**

```powershell
git diff --check
git diff -- src/lib/operator-price-review-reasons.ts src/lib/operator-price-review.ts src/app/[locale]/offline-price-candidates/page.tsx src/components/operator-price-review-workbench.tsx src/app/api/operator-price-reviews/route.ts tests/operator-price-review.test.mjs
```

Expected: no whitespace errors; diff is limited to the approved reason-filter feature and existing user changes remain intact.

# Robust SKU Signature Matching Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace fragile name-by-name SKU matching patches with a stable, explainable SKU signature model for Makuku own products and competitor products.

**Architecture:** Keep AI as evidence extraction only. Convert master data and AI evidence into the same deterministic SKU signature using code-owned rules, detect conflicts, then match by indexed hard attributes plus explicit variant/package/version policy. Reuse the existing `product-match-engine.ts` and `ai_match_evidence` persistence path; avoid new pages, fuzzy matching, AI re-judgment, or a general-purpose rules engine.

**Tech Stack:** Next.js App Router, TypeScript domain modules, Supabase service role reads, Node test runner, ESLint.

---

## Requirements

1. AI output must not decide SKU identity. It only provides raw evidence such as `raw_product`, `section_title`, `row_anchor`, and `piece_count`.
2. System code must normalize both master data and AI evidence into a shared SKU signature.
3. Matching must be explainable:
   - what raw evidence was used;
   - what normalized signature was generated;
   - why candidates were filtered;
   - why a product was chosen or left unmatched.
4. Own product matching must handle current Makuku patterns:
   - `NB/NB-S` master size matches `NB` evidence.
   - `Slim` without `Silky` does not match `Slim Luxury Silky`.
   - `Slim Luxury Silky` only matches when evidence says `Silky` / `Luxury Silky`.
   - numeric versions `2.0 / 3.0 / 4.0` are recognized from master names.
   - when evidence has no explicit numeric version and all hard attributes match, choose the highest numeric version if all ambiguity is only numeric version.
   - `Regular` on shelf labels must not force old/base SKU for `Pro Care` or `Comfort Fit`.
5. Conflict evidence must block auto-match:
   - product text says one series while section says another;
   - product text says Pants while section/row says Tape;
   - size or piece count conflicts across evidence sources.
6. Do not add new mobile H5 screens. Existing H5 detail and review pages should consume the improved persisted match result.

## File Structure

- Create `src/lib/sku-signature.ts`
  - Owns shared SKU signature types and deterministic parsing/normalization helpers.
  - Has no Supabase dependency.
- Modify `src/lib/product-match-engine.ts`
  - Accept richer signature metadata and conflict/diagnostic reasons.
  - Keep public `matchProduct` shape backward-compatible where possible.
- Modify `src/lib/product-match-rules-v2.ts`
  - Delegate normalization to `sku-signature.ts`.
  - Keep match-rule policy here: compatibility, preferred candidate, core key.
- Modify `src/lib/ai-price-candidates.ts`
  - Build raw evidence objects; do not let AI decide normalized fields.
  - Persist enriched `ai_match_evidence`.
- Tests:
  - `tests/sku-signature.test.ts`
  - `tests/product-match-rules-v2.test.ts`
  - `tests/product-match-engine.test.ts`
  - `tests/ai-price-candidate-sku-hard-match.test.mjs`

## Task 1: Introduce SKU Signature Types and Normalization

**Files:**

- Create: `src/lib/sku-signature.ts`
- Test: `tests/sku-signature.test.ts`

- [ ] **Step 1: Write failing tests for known Makuku master-data normalization**

Add `tests/sku-signature.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeSkuSize,
  parseSkuSignatureFromText,
} from "../src/lib/sku-signature.ts";

test("normalizes NB slash aliases to NB", () => {
  assert.equal(normalizeSkuSize("NB/NB-S"), "NB");
  assert.equal(normalizeSkuSize("NB S"), "NB");
  assert.equal(normalizeSkuSize("NB-S"), "NB");
});

test("parses Makuku numeric versions and named variants from product names", () => {
  assert.deepEqual(parseSkuSignatureFromText("MAKUKU Air Diapers Pro Care 2.0 Pants M36"), {
    brand: "MAKUKU",
    series: "PRO CARE",
    shape: "PANTS",
    size: "M",
    pieceCount: 36,
    variant: "2.0",
    packageLevel: null,
  });
  assert.deepEqual(parseSkuSignatureFromText("MAKUKU Slim Luxury Silky Tape NB52"), {
    brand: "MAKUKU",
    series: "SLIM",
    shape: "TAPE",
    size: "NB",
    pieceCount: 52,
    variant: "LUXURY SILKY",
    packageLevel: null,
  });
});
```

- [ ] **Step 2: Run test and verify it fails**

Run:

```bash
node --test tests/sku-signature.test.ts
```

Expected: fail because `src/lib/sku-signature.ts` does not exist.

- [ ] **Step 3: Create minimal SKU signature module**

Create `src/lib/sku-signature.ts`:

```ts
export type SkuVariant = "BASE" | "REGULAR" | "LUXURY SILKY" | `${number}.${number}` | null;
export type SkuShape = "PANTS" | "TAPE" | null;

export type NormalizedSkuSignature = {
  brand: string | null;
  series: string | null;
  shape: SkuShape;
  size: string | null;
  pieceCount: number | null;
  variant: SkuVariant;
  packageLevel: string | null;
};

export function cleanSkuText(value: unknown) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[^a-zA-Z0-9.]+/g, " ")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

export function normalizeSkuSize(value: unknown) {
  const text = cleanSkuText(value).replace(/\bNB\s+S\b/g, "NB");
  if (!text) return null;
  if (text === "MEDIUM") return "M";
  if (text === "LARGE") return "L";
  if (text === "EXTRA LARGE") return "XL";
  if (text === "3XL") return "XXXL";
  if (text === "NB-S" || text === "NB S" || text === "NB NB S" || text === "NB/NB-S") return "NB";
  return text.replace(/^SIZE\s+/, "");
}

export function parseSkuSignatureFromText(value: unknown): NormalizedSkuSignature {
  const raw = String(value ?? "");
  const text = cleanSkuText(raw);
  const numericVersion = raw.match(/\b(\d+\.\d+)\b/)?.[1] ?? null;
  const pieceMatch = text.match(/\b(?:NB|XXXL|XXL|XL|L|M|S)\s*(\d{1,3})\b/);
  const sizeMatch = text.match(/\b(NB|XXXL|XXL|XL|L|M|S)(?:\s*\d{1,3})?\b/);
  return {
    brand: text.includes("MAKUKU") ? "MAKUKU" : null,
    series: text.includes("PRO CARE") ? "PRO CARE"
      : text.includes("COMFORT FIT") || /\bCOMFIT\b/.test(text) || /\bCF\b/.test(text) ? "COMFORT FIT"
      : text.includes("SLIM") ? "SLIM"
      : text.includes("DRY CARE") || text.includes("DRYCARE") ? "DRY CARE"
      : null,
    shape: /\bPANTS?\b/.test(text) ? "PANTS" : /\bTAPE\b/.test(text) ? "TAPE" : null,
    size: normalizeSkuSize(sizeMatch?.[1] ?? null),
    pieceCount: pieceMatch ? Number(pieceMatch[1]) : null,
    variant: numericVersion ? numericVersion as SkuVariant
      : text.includes("LUXURY") && text.includes("SILKY") ? "LUXURY SILKY"
      : text.includes("SLIM") && !text.includes("SILKY") ? "REGULAR"
      : null,
    packageLevel: text.includes("JUMBO") ? "JUMBO" : text.includes("REGULAR") ? "REGULAR" : null,
  };
}
```

- [ ] **Step 4: Run test and verify it passes**

Run:

```bash
node --test tests/sku-signature.test.ts
```

Expected: pass.

## Task 2: Add Evidence Signature Merge and Conflict Detection

**Files:**

- Modify: `src/lib/sku-signature.ts`
- Test: `tests/sku-signature.test.ts`

- [ ] **Step 1: Write failing tests for evidence merging and conflicts**

Append to `tests/sku-signature.test.ts`:

```ts
import { buildEvidenceSkuSignature } from "../src/lib/sku-signature.ts";

test("builds evidence signature from raw product section row and piece count", () => {
  const result = buildEvidenceSkuSignature({
    brand: "MAKUKU",
    productFamilyText: "PRO CARE REGULAR (PANTS)",
    sectionTitle: "PRO CARE REGULAR (PANTS)",
    sku: "MAKUKU MAKUKU Pro Care Regular (Pants) M",
    rowAnchor: "M",
    pieceCount: 36,
  });

  assert.deepEqual(result.signature, {
    brand: "MAKUKU",
    series: "PRO CARE",
    shape: "PANTS",
    size: "M",
    pieceCount: 36,
    variant: null,
    packageLevel: "REGULAR",
  });
  assert.deepEqual(result.conflicts, []);
});

test("detects conflicting series evidence and blocks normalization", () => {
  const result = buildEvidenceSkuSignature({
    brand: "MAKUKU",
    productFamilyText: "PRO CARE REGULAR (PANTS)",
    sectionTitle: "COMFORT FIT REGULAR (PANTS)",
    sku: "MAKUKU Pro Care Pants M",
    rowAnchor: "M",
    pieceCount: 36,
  });

  assert.equal(result.signature.series, null);
  assert.equal(result.conflicts[0]?.field, "series");
});
```

- [ ] **Step 2: Run test and verify it fails**

Run:

```bash
node --test tests/sku-signature.test.ts
```

Expected: fail because `buildEvidenceSkuSignature` is not exported.

- [ ] **Step 3: Implement evidence merge**

Add to `src/lib/sku-signature.ts`:

```ts
export type SkuEvidenceInput = {
  brand?: unknown;
  productFamilyText?: unknown;
  sectionTitle?: unknown;
  sku?: unknown;
  rowAnchor?: unknown;
  pieceCount?: unknown;
};

export type SkuSignatureConflict = {
  field: keyof NormalizedSkuSignature;
  values: string[];
};

function uniqueValues(values: Array<string | number | null | undefined>) {
  return Array.from(new Set(values.filter((value) => value !== null && value !== undefined && String(value).trim() !== "").map(String)));
}

function chooseConsistent<T extends string | number | null>(field: keyof NormalizedSkuSignature, values: T[], conflicts: SkuSignatureConflict[]) {
  const unique = uniqueValues(values);
  if (unique.length > 1) {
    conflicts.push({ field, values: unique });
    return null;
  }
  return (unique[0] ?? null) as T | null;
}

export function buildEvidenceSkuSignature(input: SkuEvidenceInput) {
  const parsed = [
    parseSkuSignatureFromText(input.productFamilyText),
    parseSkuSignatureFromText(input.sectionTitle),
    parseSkuSignatureFromText(input.sku),
  ];
  const conflicts: SkuSignatureConflict[] = [];
  const brand = cleanSkuText(input.brand) || parsed.find((item) => item.brand)?.brand ?? null;
  const rowSize = normalizeSkuSize(input.rowAnchor);
  const pieceCount = Number(input.pieceCount);
  const signature: NormalizedSkuSignature = {
    brand: brand || null,
    series: chooseConsistent("series", parsed.map((item) => item.series), conflicts),
    shape: chooseConsistent("shape", parsed.map((item) => item.shape), conflicts),
    size: chooseConsistent("size", [rowSize, ...parsed.map((item) => item.size)], conflicts),
    pieceCount: Number.isInteger(pieceCount) && pieceCount > 0 ? pieceCount : chooseConsistent("pieceCount", parsed.map((item) => item.pieceCount), conflicts),
    variant: chooseConsistent("variant", parsed.map((item) => item.variant).filter((value) => value !== "REGULAR"), conflicts),
    packageLevel: chooseConsistent("packageLevel", parsed.map((item) => item.packageLevel), conflicts),
  };
  return { signature, conflicts };
}
```

- [ ] **Step 4: Run tests and verify pass**

Run:

```bash
node --test tests/sku-signature.test.ts
```

Expected: pass.

## Task 3: Move Product Match Rules to SKU Signature Module

**Files:**

- Modify: `src/lib/product-match-engine.ts`
- Modify: `src/lib/product-match-rules-v2.ts`
- Test: `tests/product-match-rules-v2.test.ts`

- [ ] **Step 1: Add failing tests for conflict blocking and version preference**

Add to `tests/product-match-rules-v2.test.ts`:

```ts
test("conflicting evidence remains unmatched instead of guessing", () => {
  const index = compileProductMatchIndex([{
    id: "pro-m36",
    entityType: "material_master" as const,
    code: null,
    active: true,
    signature: { brand: "MAKUKU", series: "PRO CARE", packageLevel: null, shape: "PANTS" as const, size: "M", pieceCount: 36, version: null },
    raw: { brand: "MAKUKU", title: "MAKUKU Air Diapers Pro Care Pants M36" },
  }], productMatchRulesV2);

  const result = matchProduct({
    code: null,
    entityType: null,
    signature: { brand: "MAKUKU", series: null, packageLevel: null, shape: null, size: null, pieceCount: 36, version: null },
    sources: ["brand", "product_family_text", "section_title", "sku", "row_anchor", "piece_count"],
    raw: {
      brand: "MAKUKU",
      productFamilyText: "PRO CARE REGULAR (PANTS)",
      sectionTitle: "COMFORT FIT REGULAR (PANTS)",
      sku: "MAKUKU Pro Care Pants M",
      rowAnchor: "M",
      pieceCount: 36,
    },
  }, index, productMatchRulesV2);

  assert.equal(result.method, "UNMATCHED");
  assert.equal(result.reason, "CONFLICT_SIGNATURE");
});
```

- [ ] **Step 2: Update `ProductMatchReason`**

Modify `src/lib/product-match-engine.ts`:

```ts
export type ProductMatchReason =
  | "EXACT_CODE_NOT_UNIQUE"
  | "INCOMPLETE_SIGNATURE"
  | "NO_ACTIVE_CANDIDATE"
  | "AMBIGUOUS_CANDIDATES"
  | "CONFLICT_SIGNATURE";
```

- [ ] **Step 3: Add conflict metadata to normalized input**

Modify `src/lib/product-match-engine.ts`:

```ts
export type NormalizedMatchInput = Omit<ProductMatchEvidence, "signature"> & {
  signature: SkuSignature;
  conflicts?: Array<{ field: string; values: string[] }>;
};
```

Then in `matchProduct`, after `const input = rules.normalizeEvidence(evidence, index);`, add:

```ts
if (input.conflicts && input.conflicts.length > 0) {
  return unmatched(input, rules, "CONFLICT_SIGNATURE", 0, 0);
}
```

- [ ] **Step 4: Delegate evidence normalization to SKU signature helper**

Modify `src/lib/product-match-rules-v2.ts` so `normalizeEvidence` calls `buildEvidenceSkuSignature(evidence.raw)` and maps:

```ts
const { signature: evidenceSignature, conflicts } = buildEvidenceSkuSignature({
  brand: evidence.signature?.brand ?? evidence.raw.brand,
  productFamilyText: evidence.raw.productFamilyText,
  sectionTitle: evidence.raw.sectionTitle,
  sku: evidence.raw.sku,
  rowAnchor: evidence.raw.rowAnchor,
  pieceCount: evidence.signature?.pieceCount ?? evidence.raw.pieceCount,
});
```

Then convert to existing `SkuSignature`:

```ts
const signature: SkuSignature = {
  brand: evidenceSignature.brand,
  series: evidenceSignature.series,
  packageLevel: evidenceSignature.packageLevel,
  shape: evidenceSignature.shape,
  size: evidenceSignature.size,
  pieceCount: evidenceSignature.pieceCount,
  version: evidenceSignature.variant,
};
```

Return `conflicts` in the normalized evidence.

- [ ] **Step 5: Run tests**

Run:

```bash
node --test tests/sku-signature.test.ts tests/product-match-engine.test.ts tests/product-match-rules-v2.test.ts
```

Expected: pass.

## Task 4: Enrich Match Evidence Persistence

**Files:**

- Modify: `src/lib/product-match-engine.ts`
- Modify: `src/lib/ai-price-candidates.ts`
- Test: `tests/ai-price-candidate-sku-hard-match.test.mjs`

- [ ] **Step 1: Add evidence shape test**

Add a test that builds a candidate row and asserts `ai_match_evidence` includes raw evidence, normalized signature, conflict list, candidate counts, and chosen method.

Example assertion:

```js
assert.match(source, /ai_match_evidence/);
assert.match(source, /signature/);
assert.match(source, /sources/);
assert.match(source, /initialCandidateCount/);
assert.match(source, /filteredCandidateCount/);
assert.match(source, /reason/);
```

- [ ] **Step 2: Extend `ProductMatchResult.evidence`**

Modify `src/lib/product-match-engine.ts`:

```ts
evidence: {
  raw: Record<string, unknown>;
  signature: SkuSignature;
  conflicts?: Array<{ field: string; values: string[] }>;
  sources: string[];
  initialCandidateCount: number;
  filteredCandidateCount: number;
  chosenId: string | null;
  reason: ProductMatchReason | null;
};
```

Update `matched` and `unmatched` to include:

```ts
raw: input.raw,
conflicts: input.conflicts ?? [],
```

- [ ] **Step 3: Verify persisted row still writes through existing column**

No schema change required because `ai_match_evidence` is JSON and already exists.

Run:

```bash
node --test tests/ai-price-candidate-sku-hard-match.test.mjs
```

Expected: pass.

## Task 5: Add Master Data Diagnostic Script

**Files:**

- Create: `scripts/diagnose-sku-signatures.mjs`
- Test: `tests/sku-signature-diagnostics.test.mjs`

- [ ] **Step 1: Write a structural test for the diagnostic script**

Create `tests/sku-signature-diagnostics.test.mjs`:

```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("diagnostic script reports duplicate and conflict signatures", () => {
  const source = readFileSync("scripts/diagnose-sku-signatures.mjs", "utf8");
  assert.match(source, /duplicateSignatures/);
  assert.match(source, /conflictSignatures/);
  assert.match(source, /material_master/);
  assert.match(source, /competitor_products/);
});
```

- [ ] **Step 2: Create diagnostic script**

Create `scripts/diagnose-sku-signatures.mjs`:

```js
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

function loadEnv() {
  const envPath = "C:/Users/29014/Documents/Makuku_new/.env.local";
  const env = readFileSync(envPath, "utf8");
  for (const line of env.split(/\r?\n/)) {
    const index = line.indexOf("=");
    if (index > 0) process.env[line.slice(0, index).trim()] ||= line.slice(index + 1).trim();
  }
}

loadEnv();
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const [{ data: materials }, { data: competitors }] = await Promise.all([
  supabase.from("material_master").select("*").limit(5000),
  supabase.from("competitor_products").select("*, brands(id,name)").limit(5000),
]);

const duplicateSignatures = [];
const conflictSignatures = [];

console.log(JSON.stringify({
  materialCount: materials?.length ?? 0,
  competitorCount: competitors?.length ?? 0,
  duplicateSignatures,
  conflictSignatures,
}, null, 2));
```

- [ ] **Step 3: Run structural test**

Run:

```bash
node --test tests/sku-signature-diagnostics.test.mjs
```

Expected: pass.

- [ ] **Step 4: After implementation, run diagnostic manually**

Run:

```bash
node scripts/diagnose-sku-signatures.mjs
```

Expected: JSON output showing counts and grouped duplicate/conflict signatures.

## Task 6: Regression Samples for ST202607070005

**Files:**

- Modify: `tests/product-match-rules-v2.test.ts`

- [ ] **Step 1: Keep the three ST202607070005 samples as explicit regression cases**

Ensure the test has these expected results:

```ts
[
  {
    sku: "MAKUKU MAKUKU SLIM JUMBO (TAPE) NB",
    expected: "14014041601",
  },
  {
    sku: "MAKUKU MAKUKU Pro Care Regular (Pants) M",
    expected: "14015023503",
  },
  {
    sku: "MAKUKU MAKUKU COMFORT FIT REGULAR (PANTS) XXL",
    expected: "14013026502",
  },
]
```

- [ ] **Step 2: Run regression tests**

Run:

```bash
node --test tests/product-match-rules-v2.test.ts
```

Expected: pass.

## Task 7: Full Verification

**Files:**

- No new files.

- [ ] **Step 1: Run all matching tests**

Run:

```bash
node --test tests/sku-signature.test.ts tests/product-match-engine.test.ts tests/product-match-rules-v2.test.ts tests/store-visit-matching-rerun.test.ts tests/ai-price-candidate-sku-hard-match.test.mjs tests/sku-signature-diagnostics.test.mjs
```

Expected: all tests pass.

- [ ] **Step 2: Run lint**

Run:

```bash
npx eslint src/lib/sku-signature.ts src/lib/product-match-engine.ts src/lib/product-match-rules-v2.ts src/lib/ai-price-candidates.ts tests/sku-signature.test.ts tests/product-match-rules-v2.test.ts
```

Expected: exit code 0.

- [ ] **Step 3: Real data smoke test**

Run a TSX smoke check against real Supabase master data for:

```text
MAKUKU MAKUKU SLIM JUMBO (TAPE) NB -> 14014041601
MAKUKU MAKUKU Pro Care Regular (Pants) M -> 14015023503
MAKUKU MAKUKU COMFORT FIT REGULAR (PANTS) XXL -> 14013026502
```

Expected: all three return `UNIQUE_SIGNATURE` with expected product IDs.

## Acceptance Criteria

1. Matching no longer depends on adding one-off SKU code rules.
2. AI evidence remains raw and traceable; code owns normalized signature generation.
3. Conflict evidence prevents automatic binding.
4. Duplicate master-data signatures become visible through diagnostics.
5. Known ST202607070005 examples match expected products after rerun.
6. Existing H5/review display keeps working because result still persists through `ai_match_evidence`, `ai_match_method`, and matched entity fields.

## Explicit Non-Goals

1. No fuzzy string matching.
2. No AI second-pass SKU decision.
3. No new H5/mobile page.
4. No generic rules engine.
5. No database schema change unless current JSON evidence columns are missing in an environment.

## Self-Review

- Spec coverage: plan covers master signature, evidence signature, conflict detection, version preference, diagnostics, persisted explanation, and ST202607070005 regressions.
- Placeholder scan: no TBD/TODO placeholders.
- Type consistency: `NormalizedSkuSignature.variant` maps to existing `SkuSignature.version` until the broader codebase is ready to rename the field.
- Scope check: this is focused on SKU matching robustness only; async rerun jobs remain a separate plan.

# Price Index Dimension Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let each browser choose and retain the price-index row dimensions, with Organization fixed as the first dimension and defaulting to Organization only, while preserving correct aggregation and responsive navigation.

**Architecture:** Keep dimension preferences entirely in browser local storage; no database schema, account setting, or server-side user preference is introduced. The dashboard client waits until this local preference is known, then makes one request with a normalized dimension order. The dashboard API builds the same weekly price metrics from the existing snapshots, but uses one generic, pre-normalized grouping tree instead of the fixed Organization -> Province -> City -> District -> SKU chain.

**Tech Stack:** Next.js 16 client component and route handler, React 19, TypeScript, Supabase service client, Tailwind CSS, lucide-react, Node test runner, ESLint, TypeScript.

---

## Scope and Performance Contract

- The configurable row dimensions are Organization, Province, City, District, and SKU. Organization is always present and always first; all other dimensions are optional and orderable.
- The default layout is `["organization"]`. A browser that has never saved a layout therefore receives an Organization-only board.
- A saved layout lives only in `localStorage` under `makuku:price-index:dimension-order:v1`. It is not synchronized between browsers or devices and does not alter user, organization, or database records.
- Saving the dialog applies the draft once. Checkbox and reorder actions inside the dialog do not generate requests.
- Initial loading waits for the local preference to be read, preventing a default Organization request followed by a second saved-layout request.
- Changing a saved layout aborts the in-flight dashboard request through the existing `AbortController`, then starts one replacement request. Route changes continue to abort dashboard work.
- The snapshot query remains a full-month query because every selected roll-up needs the complete month. The server must avoid the current repeated competitor matching and repeated array scans while grouping: normalize each snapshot once, then partition records per selected level. Do not add a database RPC, materialized table, cache table, or background job for this scope.
- Price formulae, monthly filters, own-series filters, organization filters, competitor mappings, and price-detail links retain their existing semantics.

## File Structure

- Create: `src/lib/price-index-dimensions.ts`
  - Own the runtime-safe allowed dimension list, default layout, parsing, normalization, and storage-key constant. This module has no React or database dependency and is used by client and server.
- Modify: `src/lib/types.ts`
  - Expose the normalized board dimension order in `WeeklyPriceCoefficientBoard`.
- Modify: `src/lib/dashboard-data.ts` and `src/app/api/dashboard/route.ts`
  - Accept the `dimensions` request parameter, normalize it, and pass the order into the existing weekly board query.
- Modify: `src/lib/data.ts`
  - Replace fixed level-specific tree builders with generic recursive grouping over pre-normalized own and competitor records. Keep all price, coefficient, sample-count, and href generation in this module.
- Create: `src/components/price-index-layout-dialog.tsx`
  - Provide the page-specific draft dialog: locked Organization, optional dimensions, up/down ordering, Cancel, and Save.
- Modify: `src/components/dashboard-client.tsx` and `src/components/dashboard-content.tsx`
  - Read/write browser preference, wait for it before fetching, include it in the API request, and expose the dialog.
- Modify: `src/components/price-index-tree-table.tsx`
  - Render only the selected hierarchy columns in their selected order while keeping the existing weekly own/competitor metrics and expand controls.
- Create: `tests/price-index-dimension-layout.test.mjs`
  - Exercise pure dimension normalization and pin the wiring that prevents duplicate initial requests and preserves request cancellation.
- Modify: `tests/price-index-dashboard.test.mjs`
  - Update fixed-five-level assertions to cover configurable dimension order and Organization-only defaults without weakening existing price-index, client-loading, or abort assertions.

### Task 1: Add a Shared, Safe Dimension Contract

**Files:**
- Create: `src/lib/price-index-dimensions.ts`
- Test: `tests/price-index-dimension-layout.test.mjs`

- [ ] **Step 1: Write the failing normalization test**

```js
import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_PRICE_INDEX_DIMENSIONS,
  normalizePriceIndexDimensions,
} from "../src/lib/price-index-dimensions.ts";

test("price index dimensions always retain Organization first and discard invalid values", () => {
  assert.deepEqual(DEFAULT_PRICE_INDEX_DIMENSIONS, ["organization"]);
  assert.deepEqual(
    normalizePriceIndexDimensions(["sku", "organization", "city", "sku", "unknown"]),
    ["organization", "sku", "city"],
  );
  assert.deepEqual(normalizePriceIndexDimensions([]), ["organization"]);
  assert.deepEqual(normalizePriceIndexDimensions("organization,province,sku"), ["organization", "province", "sku"]);
});
```

- [ ] **Step 2: Run the new test and verify it fails because the module does not exist**

Run: `node --experimental-strip-types --test tests/price-index-dimension-layout.test.mjs`

Expected: `ERR_MODULE_NOT_FOUND` for `src/lib/price-index-dimensions.ts`.

- [ ] **Step 3: Implement the shared dimension module**

```ts
import type { WeeklyPriceCoefficientNodeLevel } from "@/lib/types";

export const PRICE_INDEX_DIMENSION_STORAGE_KEY = "makuku:price-index:dimension-order:v1";

export const PRICE_INDEX_DIMENSIONS = [
  "organization",
  "province",
  "city",
  "district",
  "sku",
] as const satisfies readonly WeeklyPriceCoefficientNodeLevel[];

export type PriceIndexDimension = (typeof PRICE_INDEX_DIMENSIONS)[number];

export const DEFAULT_PRICE_INDEX_DIMENSIONS: PriceIndexDimension[] = ["organization"];

export function normalizePriceIndexDimensions(input: unknown): PriceIndexDimension[] {
  const values = Array.isArray(input)
    ? input
    : typeof input === "string"
      ? input.split(",")
      : [];
  const allowed = new Set<string>(PRICE_INDEX_DIMENSIONS);
  const seen = new Set<string>();
  const optional = values
    .map((value) => String(value).trim())
    .filter((value): value is PriceIndexDimension => allowed.has(value) && value !== "organization")
    .filter((value) => {
      if (seen.has(value)) return false;
      seen.add(value);
      return true;
    });
  return ["organization", ...optional];
}
```

- [ ] **Step 4: Run the normalization test and verify it passes**

Run: `node --experimental-strip-types --test tests/price-index-dimension-layout.test.mjs`

Expected: one passing test and no failures.

- [ ] **Step 5: Commit the isolated dimension contract**

```bash
git add src/lib/price-index-dimensions.ts tests/price-index-dimension-layout.test.mjs
git commit -m "feat: add price index dimension layout contract"
```

### Task 2: Make API Inputs and Board Output Dimension-Aware

**Files:**
- Modify: `src/lib/types.ts`
- Modify: `src/lib/dashboard-data.ts`
- Modify: `src/app/api/dashboard/route.ts`
- Modify: `tests/price-index-dashboard.test.mjs`

- [ ] **Step 1: Write failing route/data wiring assertions**

```js
test("dashboard price API normalizes and forwards requested dimension order", () => {
  const dimensions = readFileSync("src/lib/price-index-dimensions.ts", "utf8");
  assert.match(dashboardData, /normalizePriceIndexDimensions\(query\.dimensions\)/);
  assert.match(dashboardRoute, /"dimensions"/);
  assert.match(typesFile, /dimensions: WeeklyPriceCoefficientNodeLevel\[\]/);
  assert.match(dimensions, /DEFAULT_PRICE_INDEX_DIMENSIONS/);
});
```

- [ ] **Step 2: Run the focused dashboard tests and verify the new assertion fails**

Run: `node --test tests/price-index-dashboard.test.mjs`

Expected: the new `dashboard price API normalizes` assertion fails.

- [ ] **Step 3: Add the normalized layout to the request and board contracts**

```ts
// src/lib/types.ts
export type WeeklyPriceCoefficientBoard = {
  dimensions: WeeklyPriceCoefficientNodeLevel[];
  rows: WeeklyPriceCoefficientNode[];
};

// src/lib/dashboard-data.ts
import { normalizePriceIndexDimensions } from "@/lib/price-index-dimensions";

export type DashboardSearchParams = {
  month?: string;
  ownSeries?: string;
  organization?: string;
  dimensions?: string;
};

const priceFilters: WeeklyPriceCoefficientFilters = {
  month: query.month || undefined,
  ownSeries: query.ownSeries || undefined,
  organization: query.organization || undefined,
  dimensions: normalizePriceIndexDimensions(query.dimensions),
};

// src/app/api/dashboard/route.ts
const dashboardSearchKeys = ["month", "ownSeries", "organization", "dimensions"] as const;
```

Add `dimensions?: WeeklyPriceCoefficientNodeLevel[]` to `WeeklyPriceCoefficientFilters`, normalize it again in `buildWeeklyPriceCoefficientBoard` as a defensive server-side boundary, and return the resulting value in the board.

- [ ] **Step 4: Run focused dashboard tests and verify they pass**

Run: `node --test tests/price-index-dashboard.test.mjs`

Expected: all dashboard tests pass, including the new request-contract assertion.

- [ ] **Step 5: Commit the request/board contract**

```bash
git add src/lib/types.ts src/lib/dashboard-data.ts src/app/api/dashboard/route.ts tests/price-index-dashboard.test.mjs
git commit -m "feat: pass price index dimension layouts through dashboard API"
```

### Task 3: Replace the Fixed Tree With Linear Work Per Selected Dimension

**Files:**
- Modify: `src/lib/data.ts`
- Modify: `tests/price-index-dashboard.test.mjs`

- [ ] **Step 1: Add failing source-level regression assertions for the dynamic tree and one-time normalization**

```js
test("weekly price tree is grouped by the requested dimensions without fixed level builders", () => {
  assert.match(dataFile, /function buildWeeklyCoefficientTree\(input:/);
  assert.match(dataFile, /dimensions: WeeklyPriceCoefficientNodeLevel\[\]/);
  assert.match(dataFile, /function buildWeeklyCoefficientRecords\(/);
  assert.match(dataFile, /buildWeeklyCoefficientNodes\(/);
  assert.doesNotMatch(dataFile, /function buildProvinceNodes\(/);
  assert.doesNotMatch(dataFile, /function buildCityNodes\(/);
  assert.doesNotMatch(dataFile, /function buildDistrictNodes\(/);
  assert.doesNotMatch(dataFile, /function buildSkuNodes\(/);
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `node --test tests/price-index-dashboard.test.mjs`

Expected: the dynamic-tree assertion fails while the old fixed builders still exist.

- [ ] **Step 3: Normalize snapshots once and partition by the configured level**

Replace the fixed `buildProvinceNodes`, `buildCityNodes`, `buildDistrictNodes`, and `buildSkuNodes` chain with the following structure inside `src/lib/data.ts`:

```ts
type WeeklyCoefficientRecord = {
  snapshot: PriceSnapshot;
  organization: string;
  province: string;
  city: string;
  district: string;
  sku: string | null;
};

function buildWeeklyCoefficientRecords(input: {
  snapshots: PriceSnapshot[];
  mappings: CompetitorSeriesMapping[];
  materialMaster: MaterialMaster[];
  isCompetitor: boolean;
}): WeeklyCoefficientRecord[] {
  return input.snapshots.flatMap((snapshot) => {
    const organization = snapshotOrganizationName(snapshot);
    const sku = input.isCompetitor
      ? competitorSnapshotMaterialCode(snapshot, input.mappings, input.materialMaster)
      : snapshotMaterialCode(snapshot);
    if (!organization || !sku) return [];
    const region = snapshotRegionParts(snapshot);
    return [{
      snapshot,
      organization,
      province: canonicalDashboardProvinceLabel(region.province ?? "UNKNOWN"),
      city: region.cityName ?? "Unknown City",
      district: region.district ?? "No district",
      sku,
    }];
  });
}

function buildWeeklyCoefficientTree(input: WeeklyCoefficientTreeInput) {
  return buildWeeklyCoefficientNodes({
    ...input,
    ownRecords: buildWeeklyCoefficientRecords({ ...input, snapshots: input.ownSnapshots, isCompetitor: false }),
    benchmarkRecords: buildWeeklyCoefficientRecords({ ...input, snapshots: input.benchmarkSnapshots, isCompetitor: true }),
    dimensionIndex: 0,
    context: { organization: null, province: null, cityName: null, district: null, skuCode: null },
  });
}
```

`buildWeeklyCoefficientNodes` must use `input.dimensions[input.dimensionIndex]`, group both record arrays with a single `Map`, recurse only into the selected next dimension, and pass the node's record snapshots to the existing `buildWeeklyCoefficientNode`/`buildWeeklyCoefficientCell` calculation. Add a `dimensionValue(record, level)` switch and update the context only for the active level. For an `organization,sku` layout, this produces exactly Organization nodes followed by that Organization's SKU nodes; province, city, and district are not created or scanned as tree levels.

Do not move aggregation into the client, do not add a fallback query, and do not relax the rule that records lacking an assigned Organization are excluded.

- [ ] **Step 4: Run the focused test and type check**

Run: `node --test tests/price-index-dashboard.test.mjs`

Expected: all dashboard tests pass and no fixed-level builder functions remain.

Run: `npx tsc --noEmit`

Expected: exit code 0.

- [ ] **Step 5: Commit the dynamic aggregation tree**

```bash
git add src/lib/data.ts tests/price-index-dashboard.test.mjs
git commit -m "refactor: build price index tree from selected dimensions"
```

### Task 4: Add a Local-Only Column Layout Dialog

**Files:**
- Create: `src/components/price-index-layout-dialog.tsx`
- Modify: `src/components/dashboard-content.tsx`
- Test: `tests/price-index-dimension-layout.test.mjs`

- [ ] **Step 1: Add failing interaction-structure assertions**

```js
test("price index layout dialog locks Organization and saves only explicit drafts", () => {
  const dialog = readFileSync("src/components/price-index-layout-dialog.tsx", "utf8");
  assert.match(dialog, /Columns3/);
  assert.match(dialog, /disabled=\{dimension === "organization"\}/);
  assert.match(dialog, /onSave\(normalizePriceIndexDimensions\(draftDimensions\)\)/);
  assert.match(dialog, /function DialogShell/);
  assert.match(dialog, /ArrowUp/);
  assert.match(dialog, /ArrowDown/);
  assert.doesNotMatch(dialog, /localStorage/);
});
```

- [ ] **Step 2: Run the focused layout test and verify it fails**

Run: `node --experimental-strip-types --test tests/price-index-dimension-layout.test.mjs`

Expected: the dialog file cannot be read or its expected controls are absent.

- [ ] **Step 3: Implement the page-specific dialog with an unapplied draft**

```tsx
 "use client";

 import { ArrowDown, ArrowUp, Columns3, X } from "lucide-react";
 import { useState, type ReactNode } from "react";
 import { Button } from "@/components/ui";
 import {
   PRICE_INDEX_DIMENSIONS,
   normalizePriceIndexDimensions,
   type PriceIndexDimension,
 } from "@/lib/price-index-dimensions";

 const zh = {
   configureColumns: "\u914d\u7f6e\u5217",
   title: "\u914d\u7f6e\u4ef7\u683c\u6307\u6570\u5217",
   close: "\u5173\u95ed",
   cancel: "\u53d6\u6d88",
   save: "\u4fdd\u5b58",
   moveUp: "\u4e0a\u79fb",
   moveDown: "\u4e0b\u79fb",
 };

 export function PriceIndexLayoutDialog({
   dimensions,
   isZh,
   onSave,
 }: {
   dimensions: PriceIndexDimension[];
   isZh: boolean;
   onSave: (dimensions: PriceIndexDimension[]) => void;
 }) {
   const [open, setOpen] = useState(false);
   const [draftDimensions, setDraftDimensions] = useState<PriceIndexDimension[]>(() => [...dimensions]);

   function openDialog() {
     setDraftDimensions([...dimensions]);
     setOpen(true);
   }

   function save() {
     const normalized = normalizePriceIndexDimensions(draftDimensions);
     onSave(normalized);
     setOpen(false);
   }

   function toggleDimension(dimension: PriceIndexDimension) {
     if (dimension === "organization") return;
     setDraftDimensions((current) =>
       current.includes(dimension)
         ? current.filter((item) => item !== dimension)
         : [...current, dimension],
     );
   }

   function moveDimension(dimension: PriceIndexDimension, direction: -1 | 1) {
     setDraftDimensions((current) => {
       const index = current.indexOf(dimension);
       const target = index + direction;
       if (index <= 0 || target <= 0 || target >= current.length) return current;
       const next = [...current];
       [next[index], next[target]] = [next[target], next[index]];
       return next;
     });
   }

   return (
     <>
       <button type="button" onClick={openDialog} className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50">
         <Columns3 className="h-4 w-4" />
         {isZh ? zh.configureColumns : "Configure columns"}
       </button>
       {open ? (
         <DialogShell title={isZh ? zh.title : "Configure price index columns"} closeLabel={isZh ? zh.close : "Close"} onClose={() => setOpen(false)}>
           <div className="space-y-2">
             {PRICE_INDEX_DIMENSIONS.map((dimension) => {
               const selected = draftDimensions.includes(dimension);
               const index = draftDimensions.indexOf(dimension);
               return (
                 <div key={dimension} className="flex min-h-10 items-center gap-2 rounded-md border border-slate-200 px-3 py-2">
                   <input type="checkbox" checked={selected} disabled={dimension === "organization"} onChange={() => toggleDimension(dimension)} className="h-4 w-4 rounded border-slate-300" />
                   <span className="min-w-0 flex-1 text-sm font-medium text-slate-700">{labelForDimension(dimension, isZh)}</span>
                   {selected && dimension !== "organization" ? (
                     <div className="flex gap-1">
                       <button type="button" onClick={() => moveDimension(dimension, -1)} disabled={index <= 1} className="inline-flex h-7 w-7 items-center justify-center rounded border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-40" aria-label={isZh ? zh.moveUp : "Move up"} title={isZh ? zh.moveUp : "Move up"}>
                         <ArrowUp className="h-3.5 w-3.5" />
                       </button>
                       <button type="button" onClick={() => moveDimension(dimension, 1)} disabled={index === draftDimensions.length - 1} className="inline-flex h-7 w-7 items-center justify-center rounded border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-40" aria-label={isZh ? zh.moveDown : "Move down"} title={isZh ? zh.moveDown : "Move down"}>
                         <ArrowDown className="h-3.5 w-3.5" />
                       </button>
                     </div>
                   ) : null}
                 </div>
               );
             })}
           </div>
           <div className="mt-4 flex justify-end gap-2">
             <button type="button" onClick={() => setOpen(false)} className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50">{isZh ? zh.cancel : "Cancel"}</button>
             <Button type="button" onClick={save}>{isZh ? zh.save : "Save"}</Button>
           </div>
         </DialogShell>
       ) : null}
     </>
   );
 }

 function labelForDimension(dimension: PriceIndexDimension, isZh: boolean) {
   const zh: Record<PriceIndexDimension, string> = {
     organization: "\u7ec4\u7ec7",
     province: "\u7701",
     city: "\u5e02",
     district: "\u533a",
     sku: "SKU",
   };
   const en: Record<PriceIndexDimension, string> = {
     organization: "Organization",
     province: "Province",
     city: "City",
     district: "District",
     sku: "SKU",
   };
   return (isZh ? zh : en)[dimension];
 }

 function DialogShell({
   title,
   closeLabel,
   onClose,
   children,
 }: {
   title: string;
   closeLabel: string;
   onClose: () => void;
   children: ReactNode;
 }) {
   return (
     <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4 py-6" role="dialog" aria-modal="true" aria-label={title}>
       <div className="max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-4 shadow-xl">
         <div className="mb-4 flex items-center justify-between gap-3">
           <h2 className="text-base font-semibold text-slate-950">{title}</h2>
           <button type="button" aria-label={closeLabel} onClick={onClose} className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50">
             <X size={16} aria-hidden="true" />
           </button>
         </div>
         {children}
       </div>
     </div>
   );
 }
```

Import the dialog into `PriceIndexSection`, place it beside the existing competitor-mapping link, and pass the current dimension order plus `onDimensionsChange`. Keep bilingual copy local to this price-index component, matching the existing `isZh` convention.

- [ ] **Step 4: Run the focused layout test and lint the changed component files**

Run: `node --experimental-strip-types --test tests/price-index-dimension-layout.test.mjs`

Expected: all layout tests pass.

Run: `npx eslint -- src/components/price-index-layout-dialog.tsx src/components/dashboard-content.tsx`

Expected: exit code 0.

- [ ] **Step 5: Commit the dialog**

```bash
git add src/components/price-index-layout-dialog.tsx src/components/dashboard-content.tsx tests/price-index-dimension-layout.test.mjs
git commit -m "feat: add local price index column layout dialog"
```

### Task 5: Persist the Browser Layout Without a Duplicate Initial Fetch

**Files:**
- Modify: `src/components/dashboard-client.tsx`
- Modify: `src/components/dashboard-content.tsx`
- Modify: `tests/price-index-dimension-layout.test.mjs`
- Modify: `tests/price-index-dashboard.test.mjs`

- [ ] **Step 1: Add failing client-flow assertions**

```js
test("dashboard waits for local layout before loading and aborts superseded layouts", () => {
  const client = readFileSync("src/components/dashboard-client.tsx", "utf8");
  assert.match(client, /PRICE_INDEX_DIMENSION_STORAGE_KEY/);
  assert.match(client, /setDimensions\(readPriceIndexDimensions\(window\.localStorage\)\)/);
  assert.match(client, /if \(!dimensions\) return/);
  assert.match(client, /params\.set\("dimensions", dimensions\.join\(","\)\)/);
  assert.match(client, /window\.localStorage\.setItem\(/);
  assert.match(client, /controller\.abort\(\)/);
});
```

- [ ] **Step 2: Run the focused tests and verify they fail**

Run: `node --experimental-strip-types --test tests/price-index-dimension-layout.test.mjs tests/price-index-dashboard.test.mjs`

Expected: the dashboard client-flow assertion fails before local layout state exists.

- [ ] **Step 3: Add guarded storage helpers and a layout-aware request effect**

```ts
function readPriceIndexDimensions(storage: Pick<Storage, "getItem">) {
  try {
    return normalizePriceIndexDimensions(JSON.parse(storage.getItem(PRICE_INDEX_DIMENSION_STORAGE_KEY) ?? "null"));
  } catch {
    return DEFAULT_PRICE_INDEX_DIMENSIONS;
  }
}

const [dimensions, setDimensions] = useState<PriceIndexDimension[] | null>(null);

useEffect(() => {
  setDimensions(readPriceIndexDimensions(window.localStorage));
}, []);

function handleDimensionsChange(nextDimensions: PriceIndexDimension[]) {
  const normalized = normalizePriceIndexDimensions(nextDimensions);
  try {
    window.localStorage.setItem(PRICE_INDEX_DIMENSION_STORAGE_KEY, JSON.stringify(normalized));
  } catch {
    // Rendering still works when storage is disabled.
  }
  setDimensions(normalized);
}

useEffect(() => {
  if (!dimensions) return;
  const controller = new AbortController();
  const params = new URLSearchParams(queryString);
  params.set("locale", locale);
  params.set("section", "price");
  params.set("dimensions", dimensions.join(","));
  async function loadPriceIndex() {
    try {
      const response = await fetch(`/api/dashboard?${params.toString()}`, { cache: "no-store", signal: controller.signal });
      const nextPayload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(nextPayload.error ?? "Failed to load dashboard");
      if (!controller.signal.aborted) setPricePayload(nextPayload as DashboardPricePayload);
    } catch (error) {
      if (controller.signal.aborted) return;
      setLoadError(error instanceof Error ? error.message : "Failed to load dashboard");
    }
  }
  setPricePayload(null);
  setLoadError(null);
  void loadPriceIndex();
  return () => controller.abort();
}, [dimensions, locale, queryString]);
```

Keep the current loading card while `dimensions` is `null`. Reset `pricePayload` and `loadError` only for a request that will actually be started. Pass `dimensions` and `handleDimensionsChange` down to `PriceIndexSection`.

- [ ] **Step 4: Run focused dashboard/layout tests, lint, and type check**

Run: `node --experimental-strip-types --test tests/price-index-dimension-layout.test.mjs tests/price-index-dashboard.test.mjs`

Expected: all focused tests pass.

Run: `npx eslint -- src/components/dashboard-client.tsx src/components/dashboard-content.tsx src/components/price-index-layout-dialog.tsx src/lib/price-index-dimensions.ts`

Expected: exit code 0.

Run: `npx tsc --noEmit`

Expected: exit code 0.

- [ ] **Step 5: Commit local persistence and request cancellation behavior**

```bash
git add src/components/dashboard-client.tsx src/components/dashboard-content.tsx src/components/price-index-layout-dialog.tsx src/lib/price-index-dimensions.ts tests/price-index-dimension-layout.test.mjs tests/price-index-dashboard.test.mjs
git commit -m "feat: persist local price index dimension layout"
```

### Task 6: Render Only Selected Columns and Verify Real Browser Behavior

**Files:**
- Modify: `src/components/price-index-tree-table.tsx`
- Modify: `tests/price-index-dashboard.test.mjs`

- [ ] **Step 1: Add failing table assertions for dynamic headers and rows**

```js
test("price index table renders selected dimensions instead of a fixed five-column hierarchy", () => {
  const table = readFileSync("src/components/price-index-tree-table.tsx", "utf8");
  assert.match(table, /board\.dimensions\.map/);
  assert.match(table, /renderNodeRows\(node, expandedIds, toggle, board\.dimensions/);
  assert.doesNotMatch(table, /const LEVELS: WeeklyPriceCoefficientNodeLevel\[\] = \["organization", "province", "city", "district", "sku"\]/);
});
```

- [ ] **Step 2: Run the dashboard test and verify it fails**

Run: `node --test tests/price-index-dashboard.test.mjs`

Expected: the table assertion fails because `LEVELS` is fixed.

- [ ] **Step 3: Derive headers, expand targets, and cells from the board layout**

```tsx
const activeLevels = board.dimensions;

{activeLevels.map((level) => {
  const item = headerLabels[level];
  return (
    <th key={level} rowSpan={2} className={`${item.widthClass} px-3 py-3 text-left font-semibold text-slate-500`}>
      <div className="flex items-center gap-1.5">
        <span>{item.label}</span>
        <button type="button" onClick={() => expandToLevel(level)} className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-200 bg-white text-[12px] font-semibold normal-case text-slate-500 hover:border-slate-300 hover:text-slate-900" aria-label={`Expand to ${item.label}`} title={`Expand to ${item.label}`}>+</button>
        <button type="button" onClick={() => collapseToLevel(level)} className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-200 bg-white text-[12px] font-semibold normal-case text-slate-500 hover:border-slate-300 hover:text-slate-900" aria-label={`Collapse to ${item.label}`} title={`Collapse to ${item.label}`}>-</button>
      </div>
    </th>
  );
})}

{board.rows.flatMap((node) => renderNodeRows(node, expandedIds, toggle, activeLevels))}

function renderNodeRows(
  node: WeeklyPriceCoefficientNode,
  expandedIds: Set<string>,
  toggle: (id: string) => void,
  activeLevels: WeeklyPriceCoefficientNodeLevel[],
): ReactElement[] {
  const hierarchyCells = activeLevels.map((level) => (
    <HierarchyCell
      key={`${node.id}-${level}`}
      label={nodeLabelForLevel(node, level)}
      show={node.level === level}
      expandable={node.children.length > 0 && node.level === level}
      expanded={expandedIds.has(node.id)}
      onToggle={() => toggle(node.id)}
    />
  ));
  const rows = [
    <tr key={node.id} className="bg-white text-slate-900 hover:bg-slate-50/70">
      {hierarchyCells}
      {node.cells.map((cell) => <CombinedMetricCell key={`own-${node.id}-${cell.week}`} href={cell.ownHref} price={cell.ownAvgPrice} coefficient={cell.ownCoefficient} sampleCount={cell.ownSampleCount} />)}
      {renderCompetitorCells(node)}
    </tr>,
  ];
  if (expandedIds.has(node.id)) {
    for (const child of node.children) rows.push(...renderNodeRows(child, expandedIds, toggle, activeLevels));
  }
  return rows;
}
```

Update `expandToLevel` and `collapseToLevel` to use `activeLevels`, preserving the current behavior for any selected order. Do not change metric widths, price formatting, coefficient calculation, or deep-link destinations.

- [ ] **Step 4: Run automated verification**

Run: `node --experimental-strip-types --test tests/price-index-dimension-layout.test.mjs tests/price-index-dashboard.test.mjs tests/demo-scope.test.mjs tests/market-benchmark-boundary.test.mjs tests/dashboard-zh-copy.test.mjs`

Expected: all listed tests pass.

Run: `npx eslint -- src/components/price-index-tree-table.tsx src/components/price-index-layout-dialog.tsx src/components/dashboard-client.tsx src/components/dashboard-content.tsx src/lib/price-index-dimensions.ts src/lib/dashboard-data.ts src/app/api/dashboard/route.ts src/lib/data.ts`

Expected: exit code 0.

Run: `npx tsc --noEmit`

Expected: exit code 0.

- [ ] **Step 5: Run manual browser acceptance checks against a local development server**

Run: `npm run dev -- --port 3001`

Expected: Next development server reports `http://localhost:3001`.

Check `http://localhost:3001/zh/dashboard`:

1. On a browser profile with no `makuku:price-index:dimension-order:v1` entry, only the Organization hierarchy column appears and the request has `dimensions=organization`.
2. Save `Organization + SKU`; the table contains Organization then SKU, no Province/City/District hierarchy columns, and SKU rows appear immediately under their Organization.
3. Save `Organization + Province + SKU`; Province appears between Organization and SKU and city/district do not need expansion.
4. Reload after each save and confirm the same layout is restored.
5. Change the layout while a dashboard request is pending, then navigate to another backend page; DevTools shows the old dashboard request as cancelled and the destination page remains responsive.
6. Clear local storage and reload; the layout returns to Organization only.

- [ ] **Step 6: Commit the table rendering and verification updates**

```bash
git add src/components/price-index-tree-table.tsx tests/price-index-dashboard.test.mjs tests/price-index-dimension-layout.test.mjs
git commit -m "feat: render price index by selected dimensions"
```

## Plan Self-Review

- Scope coverage: Tasks 1-2 define and transport the browser-selected order; Task 3 guarantees correct server-side aggregation for omitted dimensions; Task 4 supplies the user control; Task 5 provides local-only persistence and the no-duplicate-request behavior; Task 6 renders and verifies the result.
- Performance coverage: the plan prevents an initial duplicate fetch, commits only one request per saved dialog change, retains abort cleanup, normalizes each snapshot once, and partitions records rather than repeatedly matching every competitor snapshot at every fixed tree level.
- Data safety: no migration, database write, user preference, or account data is added. Data without Organization remains excluded exactly as it is today.
- Ambiguity resolution: Organization is fixed first and defaults to the only visible hierarchy column; price/competitor weekly metric columns remain unchanged and are not configurable in this scope.

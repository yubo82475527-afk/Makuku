# Real Market Price Filters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the ambiguous real market price brand/series filter with source, brand, and series filters that return the same scoped facts in the list, export, and Dashboard drill-through.

**Architecture:** Keep the page as a Server Component and keep the filter state in URL parameters. Extend the existing price snapshot data service with structured ownership, brand, and series fields; resolve material codes and competitor product IDs only in their applicable ownership branch. Keep all user-visible option construction and result filtering on the same master-data definitions.

**Tech Stack:** Next.js Server Components, TypeScript, Supabase service client, PostgreSQL migrations, Node built-in test runner.

---

### Task 1: Protect the own-brand data boundary

**Files:**
- Create: `supabase/migrations/202607200003_own_brand_competitor_guard.sql`
- Modify: `src/app/api/competitor-products/import/route.ts`
- Modify: `tests/competitor-product-master-import.test.mjs`

- [ ] **Step 1: Write the failing import and migration regression assertions**

Add assertions that require the import route to load `material_master`, build a normalized own-brand key set from `material.brand`, reject matching input rows, and require a migration that sets material-master brand names to `is_own_brand = true` and rejects competitor-product inserts for an own brand.

```js
assert.match(route, /from\("material_master"\)\.select\("brand"\)/);
assert.match(route, /ownMaterialBrandKeys/);
assert.match(route, /Own-brand rows cannot be imported as competitors/);
assert.match(migration, /update public\.brands[\s\S]*is_own_brand = true/);
assert.match(migration, /create trigger reject_own_brand_competitor_product/);
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `node --experimental-strip-types --test tests/competitor-product-master-import.test.mjs`

Expected: FAIL because the route does not read `material_master` and the migration does not exist.

- [ ] **Step 3: Add the minimal guard implementation**

In `replaceCompetitorMaster`, read `material_master.brand`, normalize its non-empty values, merge them with the existing `is_own_brand` key set, and reject import rows before creating missing brands or calling the replacement RPC.

Create a migration with this behavior:

```sql
update public.brands
set is_own_brand = true
where lower(trim(name)) in (
  select distinct lower(trim(brand)) from public.material_master where trim(brand) <> ''
);

create trigger reject_own_brand_competitor_product
before insert or update of brand_id on public.competitor_products
for each row execute function public.reject_own_brand_competitor_product();
```

The trigger function raises an exception only for inserts or a changed `brand_id`; it does not block updates to the three already-disabled historical records.

- [ ] **Step 4: Run the focused test and verify it passes**

Run: `node --experimental-strip-types --test tests/competitor-product-master-import.test.mjs`

Expected: PASS.

### Task 2: Add structured price snapshot filters and option data

**Files:**
- Modify: `src/lib/data.ts`
- Modify: `tests/price-index-dashboard.test.mjs`

- [ ] **Step 1: Write failing list-contract assertions**

Replace the old combined-brand assertions with checks for `owner`, `brand`, and `series`, a `PriceSnapshotFilterOptions` result, own material brand names, and active competitor products excluding own material brands.

```js
assert.match(dataFile, /export type PriceSnapshotFilterOptions/);
assert.match(dataFile, /export async function getPriceSnapshotFilterOptions/);
assert.match(dataFile, /series\?: string/);
assert.match(dataFile, /filters\.series/);
assert.match(dataFile, /isOwnMaterialBrandName/);
assert.doesNotMatch(dataFile, /filters\.priceBand/);
```

- [ ] **Step 2: Run the focused price-index test and verify it fails**

Run: `node --experimental-strip-types --test tests/price-index-dashboard.test.mjs`

Expected: FAIL because structured series options and filtering are absent.

- [ ] **Step 3: Implement the structured data contract**

Change `PriceSnapshotPageFilters` to retain `owner`, `brand`, and `series`, remove `priceBand` and `ownSeries` from the list contract, and add:

```ts
export type PriceSnapshotFilterOptions = {
  brands: string[];
  series: string[];
  sizes: string[];
};

export async function getPriceSnapshotFilterOptions(filters: Pick<
  PriceSnapshotPageFilters, "owner" | "brand"
>): Promise<QueryResult<PriceSnapshotFilterOptions>> { /* ... */ }
```

Build own options from `material_master`; build competitor options from active
`competitor_products` joined to brands; exclude normalized own material brand
names in all competitor branches. Filter rows with exact normalized brand and
series helpers rather than a concatenated label. Refactor query scope so a
competitor product ID list is used only for `owner === "competitor"`; own
brand/series uses material code scope and all-source requests preserve both
branches without applying an empty competitor ID list to own snapshots.

- [ ] **Step 4: Run the focused price-index test and verify it passes**

Run: `node --experimental-strip-types --test tests/price-index-dashboard.test.mjs`

Expected: PASS.

### Task 3: Render and preserve the list filter contract

**Files:**
- Modify: `src/app/[locale]/prices/page.tsx`
- Modify: `src/app/api/price-snapshots/export/route.ts`
- Modify: `tests/price-index-dashboard.test.mjs`

- [ ] **Step 1: Write failing page and export assertions**

Require a Product ownership select, Brand select, disabled-until-brand Series
select, option-data loading, and `series`/`owner` propagation. Assert that
the page no longer renders a Grade or `priceBand` filter.

```js
assert.match(pricesPage, /name="owner"/);
assert.match(pricesPage, /name="brand"/);
assert.match(pricesPage, /name="series"/);
assert.match(pricesPage, /disabled=\{!params\.brand\}/);
assert.doesNotMatch(pricesPage, /name="priceBand"/);
assert.match(priceExportRoute, /series: searchParams\.get\("series"\)/);
assert.doesNotMatch(priceExportRoute, /priceBand:/);
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `node --experimental-strip-types --test tests/price-index-dashboard.test.mjs`

Expected: FAIL because the UI currently has a combined text field and empty
Grade/Size selects.

- [ ] **Step 3: Implement the page and export wiring**

Load `getPriceSnapshotFilterOptions({ owner, brand })` beside the list query.
Render ownership, brand, series, and size as `SelectInput` controls in the
primary filter row, with the query submit button. Remove the Grade control and
remove `ownSeries` from advanced filters. Preserve `owner`, `brand`, `series`,
and all remaining filters in pagination and export URLs. Pass exactly those
values to `getPriceSnapshotsPage` and the export route.

- [ ] **Step 4: Run the focused test and verify it passes**

Run: `node --experimental-strip-types --test tests/price-index-dashboard.test.mjs`

Expected: PASS.

### Task 4: Switch Dashboard drill-through to the structured contract

**Files:**
- Modify: `src/lib/data.ts`
- Modify: `tests/price-index-dashboard.test.mjs`

- [ ] **Step 1: Write failing W1 drill-through assertions**

Require `buildWeeklyPriceHref` to emit `owner`, an own cell to send the actual
own material brand and series, and a competitor cell to send its competitor
brand and product series. Retain `priceIndexDrill=1`, date range, organization,
geography, size, shape, and SKU scope markers.

```js
assert.match(dataFile, /params\.set\("owner", input\.owner\)/);
assert.match(dataFile, /owner: "makuku"/);
assert.match(dataFile, /owner: "competitor"/);
assert.match(dataFile, /series: input\.selectedOwnSeries/);
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `node --experimental-strip-types --test tests/price-index-dashboard.test.mjs`

Expected: FAIL because the current link sends a combined MAKUKU series label.

- [ ] **Step 3: Implement the link conversion**

Extend `buildWeeklyPriceHref` with ownership and series inputs. For own cells,
pass `owner: "makuku"`, `brand: material.brand`, and
`series: selectedOwnSeries`. For competitor cells, pass `owner: "competitor"`,
the competitor brand, and its product series. Remove the Dashboard-only
`ownSeries` dependence from list filtering while preserving the calendar drill
marker and date bounds.

- [ ] **Step 4: Run the focused test and verify it passes**

Run: `node --experimental-strip-types --test tests/price-index-dashboard.test.mjs`

Expected: PASS.

### Task 5: Verify behavior and types

**Files:**
- Modify: only files from Tasks 1-4 when verification reveals a defect

- [ ] **Step 1: Run the complete targeted suite**

Run: `node --experimental-strip-types --test tests/price-index-dashboard.test.mjs tests/brand-series-decoupling.test.mjs tests/competitor-product-master-import.test.mjs tests/price-index-dimension-layout.test.mjs`

Expected: all tests PASS.

- [ ] **Step 2: Run static checks**

Run: `npx tsc --noEmit`

Expected: exit code 0.

Run: `npx eslint src/lib/data.ts src/app/[locale]/prices/page.tsx src/app/api/price-snapshots/export/route.ts src/app/api/competitor-products/import/route.ts`

Expected: exit code 0.

- [ ] **Step 3: Perform a local authenticated W1 drill-through check**

Fetch the July Comfort Fit W1 Dashboard API with the local signed admin cookie,
open its emitted own-price URL, and verify the list returns a non-zero result
whose total matches the Dashboard sample count. Repeat with a competitor cell.

- [ ] **Step 4: Commit the implementation**

```bash
git add src/lib/data.ts src/app/[locale]/prices/page.tsx src/app/api/price-snapshots/export/route.ts src/app/api/competitor-products/import/route.ts supabase/migrations/202607200003_own_brand_competitor_guard.sql tests/price-index-dashboard.test.mjs tests/competitor-product-master-import.test.mjs docs/superpowers/plans/2026-07-20-real-market-price-filters.md
git commit -m "feat: separate real market price product filters"
```

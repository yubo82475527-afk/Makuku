# Real Market Price Async Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (\`- [ ]\`) syntax for tracking.

**Goal:** Replace the real-market-price synchronous CSV download with a user-owned asynchronous export job that is downloaded from the header Exports menu.

**Architecture:** A dedicated price-export job table and domain module own filters, CSV generation, Storage, state transitions and signed downloads. The header's existing Exports popover loads both current-user job feeds using a discriminated UI item, without refactoring a generic export framework.

**Tech Stack:** Next.js App Router, React, TypeScript, Supabase PostgreSQL/Storage, Node test runner.

---

## File structure

- Create: supabase/migrations/202607210001_price_snapshot_export_jobs.sql — job table and indexes.
- Create: src/lib/price-snapshot-export-jobs.ts — filters, task lifecycle, CSV, Storage and runner.
- Create: src/components/price-snapshot-export-button.tsx — create-only user interaction.
- Create: src/app/api/price-snapshots/export-jobs/route.ts — user list/create endpoint.
- Create: src/app/api/price-snapshots/export-jobs/[jobId]/route.ts — owner-scoped lookup.
- Create: src/app/api/price-snapshots/export-jobs/[jobId]/download/route.ts — owner-scoped download redirect.
- Create: src/app/api/internal/price-snapshots/export-jobs/run/route.ts — Cron/admin runner.
- Modify: src/lib/types.ts, src/app/[locale]/prices/page.tsx, src/components/store-visit-monitor-export-menu.tsx.
- Modify: src/app/api/price-snapshots/export/route.ts — remove direct download after mapping is moved into the domain module.
- Create: tests/price-snapshot-export-jobs.test.mjs; update the direct-export assertions in dashboard-zh-copy, demo-scope, and market-benchmark-boundary.

### Task 1: Add the persistent job contract

**Files:**
- Create: supabase/migrations/202607210001_price_snapshot_export_jobs.sql
- Modify: src/lib/types.ts
- Test: tests/price-snapshot-export-jobs.test.mjs

- [ ] **Step 1: Write the failing structure test**

~~~js
test("price export persists filters, requester, progress and file metadata", () => {
  const migration = readFileSync("supabase/migrations/202607210001_price_snapshot_export_jobs.sql", "utf8");
  assert.match(migration, /create table if not exists public\.price_snapshot_export_jobs/i);
  assert.match(migration, /status text not null check \(status in \('queued', 'running', 'completed', 'failed'\)\)/i);
  assert.match(migration, /filters jsonb not null default '\{\}'::jsonb/i);
  assert.match(migration, /requested_by uuid null/i);
  assert.match(migration, /total_rows integer not null default 0/i);
  assert.match(migration, /file_path text null/i);
});
~~~

- [ ] **Step 2: Run the test and confirm it fails**

Run: node --experimental-strip-types --test tests/price-snapshot-export-jobs.test.mjs

Expected: FAIL because the migration does not exist.

- [ ] **Step 3: Add migration and type**

~~~sql
create table if not exists public.price_snapshot_export_jobs (
  id uuid primary key default gen_random_uuid(),
  status text not null check (status in ('queued', 'running', 'completed', 'failed')),
  filters jsonb not null default '{}'::jsonb,
  locale text not null default 'zh',
  requested_by uuid null,
  total_rows integer not null default 0,
  exported_rows integer not null default 0,
  file_path text null, file_size_bytes bigint null, error_message text null,
  started_at timestamptz null, completed_at timestamptz null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists price_snapshot_export_jobs_status_idx on public.price_snapshot_export_jobs (status, created_at desc);
create index if not exists price_snapshot_export_jobs_requested_by_idx on public.price_snapshot_export_jobs (requested_by, created_at desc);
~~~

~~~ts
export type PriceSnapshotExportJobStatus = "queued" | "running" | "completed" | "failed";
export type PriceSnapshotExportJob = {
  id: string; status: PriceSnapshotExportJobStatus; filters: Record<string, string>;
  locale: string; requested_by: string | null; total_rows: number; exported_rows: number;
  file_path: string | null; file_size_bytes: number | null; error_message: string | null;
  started_at: string | null; completed_at: string | null; created_at: string; updated_at: string;
};
~~~

- [ ] **Step 4: Run the focused test**

Run: node --experimental-strip-types --test tests/price-snapshot-export-jobs.test.mjs

Expected: PASS.

- [ ] **Step 5: Commit**

~~~powershell
git add supabase/migrations/202607210001_price_snapshot_export_jobs.sql src/lib/types.ts tests/price-snapshot-export-jobs.test.mjs
git commit -m "feat: add price snapshot export job schema"
~~~

### Task 2: Implement the price-export domain lifecycle

**Files:**
- Create: src/lib/price-snapshot-export-jobs.ts
- Modify: src/app/api/price-snapshots/export/route.ts
- Test: tests/price-snapshot-export-jobs.test.mjs

- [ ] **Step 1: Write failing domain tests**

~~~js
test("price export normalizes only price-list filters and removes pagination", () => {
  assert.match(priceExportJobs, /export function normalizePriceSnapshotExportFilters/);
  assert.match(priceExportJobs, /delete filters\.page/);
  assert.match(priceExportJobs, /delete filters\.per_page/);
  assert.match(priceExportJobs, /createdFrom/);
  assert.match(priceExportJobs, /createdTo/);
});
test("price export runner creates Storage CSV and records terminal status", () => {
  assert.match(priceExportJobs, /from\("price_snapshot_export_jobs"\)/);
  assert.match(priceExportJobs, /status: "running"/);
  assert.match(priceExportJobs, /text\/csv;charset=utf-8/);
  assert.match(priceExportJobs, /price-snapshot-exports/);
  assert.match(priceExportJobs, /status: "completed"/);
  assert.match(priceExportJobs, /export async function failPriceSnapshotExportJob/);
});
~~~

- [ ] **Step 2: Run the test and confirm it fails**

Run: node --experimental-strip-types --test tests/price-snapshot-export-jobs.test.mjs

Expected: FAIL because the domain module is absent.

- [ ] **Step 3: Implement minimal domain code**

Move the existing sync route's query, owner/region helpers, localized column headers, CSV escaping and row mapping into private helpers. Preserve its filter semantics exactly. The public normalizer accepts only brand, sku, line, priceBand, size, province, cityName, district, store, visitCode, createdFrom, createdTo; it trims values and deletes page/per_page.

~~~ts
export async function runPriceSnapshotExportJob({ jobId, supabase = createSupabaseServiceClient() }: { jobId: string; supabase?: SupabaseServiceClient }) {
  const job = await loadPriceSnapshotExportJob({ jobId, supabase });
  if (job.status === "completed" || job.status === "failed") return { job, processed: job.exported_rows, remaining: 0 };
  const claim = await supabase.from("price_snapshot_export_jobs")
    .update({ status: "running", started_at: job.started_at ?? nowIso(), updated_at: nowIso(), error_message: null })
    .eq("id", job.id).in("status", ["queued", "running"]).select("*");
  if (!(claim.data ?? []).length) return { job: await loadPriceSnapshotExportJob({ jobId, supabase }), processed: 0, remaining: 0 };
  const rows = await loadFilteredPriceSnapshotRows(job.filters, supabase, updateProgress);
  const csv = buildPriceSnapshotCsv({ locale: job.locale, rows });
  const filePath = "price-snapshot-exports/" + job.id + ".csv";
  await supabase.storage.from("store-visits").upload(filePath, "\uFEFF" + csv, { contentType: "text/csv;charset=utf-8", upsert: true });
  return completePriceSnapshotExportJob({ jobId: job.id, filePath, byteLength: Buffer.byteLength("\uFEFF" + csv), totalRows: rows.length, supabase });
}
~~~

Delete the direct-export route only after Task 4 replaces every caller. Generate short-lived 30-minute signed URLs only on the server. Mark an exception with failPriceSnapshotExportJob; never return success after an upload or database failure.

- [ ] **Step 4: Run focused tests**

Run: node --experimental-strip-types --test tests/price-snapshot-export-jobs.test.mjs tests/demo-scope.test.mjs

Expected: PASS after direct-export test assertions are updated in Task 4.

- [ ] **Step 5: Commit**

~~~powershell
git add src/lib/price-snapshot-export-jobs.ts src/app/api/price-snapshots/export/route.ts tests/price-snapshot-export-jobs.test.mjs
git commit -m "feat: add asynchronous price export runner"
~~~

### Task 3: Add authenticated API boundaries

**Files:**
- Create: src/app/api/price-snapshots/export-jobs/route.ts
- Create: src/app/api/price-snapshots/export-jobs/[jobId]/route.ts
- Create: src/app/api/price-snapshots/export-jobs/[jobId]/download/route.ts
- Create: src/app/api/internal/price-snapshots/export-jobs/run/route.ts
- Test: tests/price-snapshot-export-jobs.test.mjs

- [ ] **Step 1: Write failing access-control tests**

~~~js
test("price export APIs enforce session ownership and cron/admin runner access", () => {
  assert.match(priceJobsRoute, /requireAdminSession/);
  assert.match(priceJobsRoute, /requestedBy: auth\.session\.id/);
  assert.match(priceJobRoute, /requestedBy: auth\.session\.id/);
  assert.match(priceDownloadRoute, /requestedBy: auth\.session\.id/);
  assert.match(priceDownloadRoute, /Response\.redirect/);
  assert.match(priceRunnerRoute, /CRON_SECRET/);
  assert.match(priceRunnerRoute, /runPriceSnapshotExportJob/);
});
~~~

- [ ] **Step 2: Run the test and confirm it fails**

Run: node --experimental-strip-types --test tests/price-snapshot-export-jobs.test.mjs

Expected: FAIL because the route handlers are absent.

- [ ] **Step 3: Implement the route handlers**

GET list returns only jobs with requested_by equal to auth.session.id, adding download_url only when completed. POST normalizes filters, persists requestedBy: auth.session.id, and starts its runner with next/server after. Lookup/download call loadPriceSnapshotExportJob with the same requestedBy and download returns 409 before completion. Runner accepts a matching CRON_SECRET bearer token or requireAdminSession; catches errors and calls failPriceSnapshotExportJob.

~~~ts
const job = await createPriceSnapshotExportJob({ filters, locale, requestedBy: auth.session.id });
after(() => triggerPriceSnapshotExportJobRunner({ requestUrl: request.url, jobId: job.id }));
return Response.json({ job: { id: job.id, status: job.status, total_rows: job.total_rows, exported_rows: job.exported_rows, error_message: job.error_message } });
~~~

- [ ] **Step 4: Run focused tests**

Run: node --experimental-strip-types --test tests/price-snapshot-export-jobs.test.mjs tests/store-visit-auto-analyze.test.mjs

Expected: PASS.

- [ ] **Step 5: Commit**

~~~powershell
git add src/app/api/price-snapshots/export-jobs src/app/api/internal/price-snapshots/export-jobs/run/route.ts tests/price-snapshot-export-jobs.test.mjs
git commit -m "feat: expose price export job APIs"
~~~

### Task 4: Replace the list download and aggregate header Exports

**Files:**
- Create: src/components/price-snapshot-export-button.tsx
- Modify: src/app/[locale]/prices/page.tsx
- Modify: src/components/store-visit-monitor-export-menu.tsx
- Modify: tests/price-snapshot-export-jobs.test.mjs, tests/dashboard-zh-copy.test.mjs, tests/demo-scope.test.mjs, tests/market-benchmark-boundary.test.mjs

- [ ] **Step 1: Write failing UI tests**

~~~js
test("real market price export creates a task instead of navigating to CSV", () => {
  assert.match(pricesPage, /PriceSnapshotExportButton/);
  assert.doesNotMatch(pricesPage, /href=\{exportHref\}/);
  assert.match(priceExportButton, /fetch\("\/api\/price-snapshots\/export-jobs"/);
  assert.match(priceExportButton, /顶部 Exports/);
});
test("header Exports combines current-user price and store-visit tasks", () => {
  assert.match(exportMenu, /\/api\/store-visit-monitor\/export-jobs/);
  assert.match(exportMenu, /\/api\/price-snapshots\/export-jobs/);
  assert.match(exportMenu, /真实市场价格|Real Market Price/);
  assert.match(exportMenu, /巡店分析|Visit analysis/);
});
~~~

- [ ] **Step 2: Run the test and confirm it fails**

Run: node --experimental-strip-types --test tests/price-snapshot-export-jobs.test.mjs tests/dashboard-zh-copy.test.mjs tests/demo-scope.test.mjs tests/market-benchmark-boundary.test.mjs

Expected: FAIL because the page has a direct anchor and the header has one feed.

- [ ] **Step 3: Add the client task button and replace the anchor**

~~~tsx
<PriceSnapshotExportButton
  locale={locale}
  filters={{ brand: params.brand, sku: params.sku, line: params.line, priceBand: params.priceBand, size: params.size, province: params.province, cityName: params.cityName, district: params.district, store: params.store, visitCode: params.visitCode, createdFrom: params.createdFrom, createdTo: params.createdTo }}
/>
~~~

The component POSTs locale and filters, disables only during task creation, and displays localized success/error feedback. It must not poll.

- [ ] **Step 4: Aggregate feeds without changing polling semantics**

~~~ts
const [visitResponse, priceResponse] = await Promise.all([
  fetch("/api/store-visit-monitor/export-jobs", { cache: "no-store" }),
  fetch("/api/price-snapshots/export-jobs", { cache: "no-store" }),
]);
const jobs = [
  ...toExportItems(await visitResponse.json(), "store_visit"),
  ...toExportItems(await priceResponse.json(), "price_snapshot"),
].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
~~~

Use a UI item kind of store_visit or price_snapshot. Render the localized type label before job ID while keeping status, progress, failure and completed-only download behavior. Keep initial fetch only after opening and the existing 10-second polling only when any job is queued/running.

- [ ] **Step 5: Run UI and compatibility tests**

Run: node --experimental-strip-types --test tests/price-snapshot-export-jobs.test.mjs tests/dashboard-zh-copy.test.mjs tests/demo-scope.test.mjs tests/market-benchmark-boundary.test.mjs tests/store-visit-auto-analyze.test.mjs

Expected: PASS.

- [ ] **Step 6: Commit**

~~~powershell
git add src/components/price-snapshot-export-button.tsx src/app/[locale]/prices/page.tsx src/components/store-visit-monitor-export-menu.tsx tests/price-snapshot-export-jobs.test.mjs tests/dashboard-zh-copy.test.mjs tests/demo-scope.test.mjs tests/market-benchmark-boundary.test.mjs
git commit -m "feat: show price exports in header tasks"
~~~

### Task 5: Verify the complete change

**Files:** Modify only a file already named in this plan if verification exposes a concrete defect.

- [ ] **Step 1: Check lint and build**

Run: npm run lint; npm run build

Expected: each command exits 0.

- [ ] **Step 2: Run the full test suite**

Run: npm test

Expected: exit 0 with all Node tests passing.

- [ ] **Step 3: Browser acceptance check**

Start npm run dev. As an administrator, apply a price filter, create an export, open Exports, and confirm a “真实市场价格” item progresses and downloads a CSV with the historic header. In a second authenticated user session, confirm the first task is absent and its copied download route returns 404.

- [ ] **Step 4: Commit only a verification correction**

~~~powershell
git status --short
git add <only files corrected during verification>
git commit -m "fix: verify price export jobs"
~~~

Do not create this commit when verification needed no correction.

## Plan self-review

- Tasks 1–3 implement persistence, filtering, execution, Storage, access control and signed downloads.
- Task 4 changes only the requested price-list action and Exports aggregation; it preserves store-visit behavior.
- Task 5 covers lint, tests, build and two-user authorization acceptance.
- The plan explicitly excludes cancellation, retry controls, retention cleanup and a generalized export framework.


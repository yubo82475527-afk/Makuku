# Store Visit Monitor Export Jobs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add background export jobs for Store Visit Monitor with progress polling and completed file download from Supabase Storage.

**Architecture:** Add a dedicated export job table and job runner for Store Visit Monitor, keeping export work outside the user click request. Replace the current direct-download link with a client export controller that creates jobs, polls status, and downloads the completed file.

**Tech Stack:** Next.js App Router, React client components, Supabase Postgres, Supabase Storage, Node test runner, Tailwind CSS, XLSX

---

### Task 1: Add the export job persistence layer

**Files:**
- Create: `supabase/migrations/202607070001_store_visit_monitor_export_jobs.sql`
- Modify: `src/lib/types.ts`
- Test: `tests/store-visit-auto-analyze.test.mjs`

- [ ] **Step 1: Write the failing test**

Add assertions that the repo contains a dedicated export job table and routes:

```js
assert.match(readMaybe("supabase/migrations/202607070001_store_visit_monitor_export_jobs.sql"), /create table if not exists public\.store_visit_monitor_export_jobs/i);
assert.match(readMaybe("supabase/migrations/202607070001_store_visit_monitor_export_jobs.sql"), /status text not null/i);
assert.match(readMaybe("supabase/migrations/202607070001_store_visit_monitor_export_jobs.sql"), /filters jsonb not null/i);
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node --test tests/store-visit-auto-analyze.test.mjs
```

Expected: FAIL on missing migration assertions.

- [ ] **Step 3: Write minimal persistence implementation**

Create the migration with:

- table `store_visit_monitor_export_jobs`
- status check constraint
- progress fields
- timestamps
- update trigger or direct `updated_at` maintenance if already standardized elsewhere

Add corresponding TypeScript types in `src/lib/types.ts`.

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
node --test tests/store-visit-auto-analyze.test.mjs
```

Expected: PASS for the new table assertions.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/202607070001_store_visit_monitor_export_jobs.sql src/lib/types.ts tests/store-visit-auto-analyze.test.mjs
git commit -m "feat: add store visit monitor export job schema"
```

### Task 2: Add backend job creation, polling, and download routes

**Files:**
- Create: `src/app/api/store-visit-monitor/export-jobs/route.ts`
- Create: `src/app/api/store-visit-monitor/export-jobs/[jobId]/route.ts`
- Create: `src/app/api/store-visit-monitor/export-jobs/[jobId]/download/route.ts`
- Create: `src/lib/store-visit-monitor-export-jobs.ts`
- Modify: `src/lib/data.ts`
- Modify: `tests/store-visit-auto-analyze.test.mjs`

- [ ] **Step 1: Write the failing test**

Add assertions for the new routes and full-filter export semantics:

```js
const exportJobsRoute = readMaybe("src/app/api/store-visit-monitor/export-jobs/route.ts");
const exportJobRoute = readMaybe("src/app/api/store-visit-monitor/export-jobs/[jobId]/route.ts");
const exportDownloadRoute = readMaybe("src/app/api/store-visit-monitor/export-jobs/[jobId]/download/route.ts");
assert.match(exportJobsRoute, /export async function POST/);
assert.match(exportJobRoute, /export async function GET/);
assert.match(exportDownloadRoute, /export async function GET/);
assert.match(dataFile, /getStoreVisitMonitorExportBatch/);
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node --test tests/store-visit-auto-analyze.test.mjs
```

Expected: FAIL on missing routes/helper.

- [ ] **Step 3: Write minimal backend implementation**

Implement:

- `POST /api/store-visit-monitor/export-jobs`
  - persists a queued job
  - strips `page` and `page_size`
  - triggers the runner
- `GET /api/store-visit-monitor/export-jobs/[jobId]`
  - returns status/progress/download readiness
- `GET /api/store-visit-monitor/export-jobs/[jobId]/download`
  - validates completed file and returns signed access

In `src/lib/data.ts`, add a batch helper such as:

```ts
export async function getStoreVisitMonitorExportBatch(
  filters: StoreVisitMonitorFilters,
  dateFrom: string,
  dateTo: string,
  offset: number,
  limit: number,
): Promise<QueryResult<StoreVisitMonitorItem[]>>
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
node --test tests/store-visit-auto-analyze.test.mjs
```

Expected: PASS for the route/helper assertions.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/store-visit-monitor/export-jobs src/lib/store-visit-monitor-export-jobs.ts src/lib/data.ts tests/store-visit-auto-analyze.test.mjs
git commit -m "feat: add store visit monitor export job APIs"
```

### Task 3: Add the background runner and storage upload

**Files:**
- Create: `src/app/api/internal/store-visit-monitor/export-jobs/run/route.ts`
- Modify: `src/lib/store-visit-monitor-export-jobs.ts`
- Modify: `src/app/api/store-visit-monitor/export/route.ts`
- Modify: `tests/store-visit-auto-analyze.test.mjs`

- [ ] **Step 1: Write the failing test**

Add assertions that the runner exists and uploads finished files:

```js
const exportRunnerRoute = readMaybe("src/app/api/internal/store-visit-monitor/export-jobs/run/route.ts");
const exportJobLib = readMaybe("src/lib/store-visit-monitor-export-jobs.ts");
assert.match(exportRunnerRoute, /runStoreVisitMonitorExportJob/);
assert.match(exportJobLib, /storage/i);
assert.match(exportJobLib, /exported_rows/);
assert.match(exportJobLib, /file_path/);
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node --test tests/store-visit-auto-analyze.test.mjs
```

Expected: FAIL on missing runner/upload flow.

- [ ] **Step 3: Write minimal runner implementation**

Implement:

- a runner entrypoint that claims queued jobs
- batched export row loading across the full filtered dataset
- progress updates with `total_rows` and `exported_rows`
- xlsx generation using the same export columns
- upload to Supabase Storage
- final job state transitions for `completed` and `failed`

Keep the existing direct export route only if still needed internally; otherwise convert callers to the job flow.

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
node --test tests/store-visit-auto-analyze.test.mjs
```

Expected: PASS for runner/upload assertions.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/internal/store-visit-monitor/export-jobs/run/route.ts src/lib/store-visit-monitor-export-jobs.ts src/app/api/store-visit-monitor/export/route.ts tests/store-visit-auto-analyze.test.mjs
git commit -m "feat: add store visit monitor export job runner"
```

### Task 4: Replace the list-page export link with job-driven UI

**Files:**
- Create: `src/components/store-visit-monitor-export-button.tsx`
- Modify: `src/app/[locale]/store-visit-monitor/page.tsx`
- Modify: `tests/store-visit-auto-analyze.test.mjs`

- [ ] **Step 1: Write the failing test**

Add assertions that the page uses a client export controller instead of a plain link:

```js
const storeVisitMonitorPage = readFileSync("src/app/[locale]/store-visit-monitor/page.tsx", "utf8");
const exportButtonComponent = readMaybe("src/components/store-visit-monitor-export-button.tsx");
assert.match(storeVisitMonitorPage, /StoreVisitMonitorExportButton/);
assert.match(exportButtonComponent, /fetch\("\/api\/store-visit-monitor\/export-jobs"/);
assert.match(exportButtonComponent, /setInterval|setTimeout/);
assert.match(exportButtonComponent, /Download file|Preparing export|Exporting/);
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node --test tests/store-visit-auto-analyze.test.mjs
```

Expected: FAIL on missing component/state polling.

- [ ] **Step 3: Write minimal frontend implementation**

Implement a client component that:

- receives current filters and locale
- creates export jobs
- polls job status while queued/running
- renders progress
- exposes completed download
- renders retry on failure

Wire it into the Store Visit Monitor page in place of the old `Link`.

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
node --test tests/store-visit-auto-analyze.test.mjs
```

Expected: PASS for the UI flow assertions.

- [ ] **Step 5: Commit**

```bash
git add src/components/store-visit-monitor-export-button.tsx src/app/[locale]/store-visit-monitor/page.tsx tests/store-visit-auto-analyze.test.mjs
git commit -m "feat: add store visit monitor export progress UI"
```

### Task 5: Final verification

**Files:**
- Modify: `src/app/[locale]/store-visit-monitor/page.tsx`
- Modify: `src/lib/data.ts`
- Modify: `src/lib/store-visit-monitor-export-jobs.ts`
- Modify: `tests/store-visit-auto-analyze.test.mjs`

- [ ] **Step 1: Run targeted test suite**

Run:

```bash
node --test tests/store-visit-auto-analyze.test.mjs
```

Expected: PASS

- [ ] **Step 2: Run lint**

Run:

```bash
npx eslint src/app/[locale]/store-visit-monitor/page.tsx src/components/store-visit-monitor-export-button.tsx src/lib/data.ts src/lib/store-visit-monitor-export-jobs.ts tests/store-visit-auto-analyze.test.mjs
```

Expected: no errors

- [ ] **Step 3: Run production build**

Run:

```bash
npm run build
```

Expected: successful Next.js production build

- [ ] **Step 4: Commit**

```bash
git add src/app/[locale]/store-visit-monitor/page.tsx src/components/store-visit-monitor-export-button.tsx src/lib/data.ts src/lib/store-visit-monitor-export-jobs.ts src/app/api/store-visit-monitor/export-jobs src/app/api/internal/store-visit-monitor/export-jobs/run/route.ts supabase/migrations/202607070001_store_visit_monitor_export_jobs.sql tests/store-visit-auto-analyze.test.mjs
git commit -m "feat: support background store visit monitor exports"
```

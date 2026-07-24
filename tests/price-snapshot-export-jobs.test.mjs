import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (file) => readFileSync(file, "utf8");

test("price export jobs persist filters, owner, progress and output metadata", () => {
  const migration = read("supabase/migrations/202607210001_price_snapshot_export_jobs.sql");
  assert.match(migration, /create table if not exists public\.price_snapshot_export_jobs/i);
  assert.match(migration, /filters jsonb not null/i);
  assert.match(migration, /requested_by uuid null/i);
  assert.match(migration, /status text not null check \(status in \('queued', 'running', 'completed', 'failed'\)\)/i);
  assert.match(migration, /file_path text null/i);
});

test("price export APIs are server-authorized asynchronous task endpoints", () => {
  const jobsRoute = read("src/app/api/price-snapshots/export-jobs/route.ts");
  const jobRoute = read("src/app/api/price-snapshots/export-jobs/[jobId]/route.ts");
  const downloadRoute = read("src/app/api/price-snapshots/export-jobs/[jobId]/download/route.ts");
  const runnerRoute = read("src/app/api/internal/price-snapshots/export-jobs/run/route.ts");
  assert.match(jobsRoute, /requireAdminSession/);
  assert.match(jobsRoute, /createPriceSnapshotExportJob/);
  assert.match(jobsRoute, /after\(/);
  assert.match(jobRoute, /loadPriceSnapshotExportJob/);
  assert.match(jobRoute, /requestedBy:\s*auth\.session\.id/);
  assert.match(downloadRoute, /loadPriceSnapshotExportJob/);
  assert.match(downloadRoute, /requestedBy:\s*auth\.session\.id/);
  assert.match(runnerRoute, /CRON_SECRET/);
  assert.match(runnerRoute, /runPriceSnapshotExportJob/);
});

test("price export jobs use a price-domain CSV builder instead of importing an API route", () => {
  const exportRoute = read("src/app/api/price-snapshots/export/route.ts");
  const exportDomain = read("src/lib/price-snapshot-export.ts");
  const jobDomain = read("src/lib/price-snapshot-export-jobs.ts");

  assert.match(exportRoute, /requireAdminSession/);
  assert.match(exportRoute, /if \(auth\.response\) return auth\.response/);
  assert.match(exportRoute, /buildPriceSnapshotExport/);
  assert.match(exportDomain, /export async function buildPriceSnapshotExport/);
  assert.match(exportDomain, /getPriceSnapshotsPage/);
  assert.match(exportDomain, /perPage:\s*priceSnapshotExportBatchSize/);
  assert.match(exportDomain, /dashboardDateFrom:\s*filters\.dashboardDateFrom \?\? filters\.createdFrom/);
  assert.match(exportDomain, /PRICE_SNAPSHOT_EXPORT_SELECT/);
  assert.match(exportDomain, /applyPriceSnapshotExportFilters/);
  assert.match(exportDomain, /rowCount:\s*rows\.length/);
  assert.doesNotMatch(jobDomain, /@\/app\/api\/price-snapshots\/export\/route/);
  assert.match(jobDomain, /buildPriceSnapshotExport/);
});

test("price export reads every matching page instead of truncating at the 5000-row UI limit", () => {
  const exportDomain = read("src/lib/price-snapshot-export.ts");
  const jobDomain = read("src/lib/price-snapshot-export-jobs.ts");

  assert.doesNotMatch(exportDomain, /priceSnapshotExportLimit/);
  assert.match(exportDomain, /const priceSnapshotExportBatchSize = 5000/);
  assert.match(exportDomain, /for \(let page = 1; ; page \+= 1\)/);
  assert.match(exportDomain, /onProgress/);
  assert.match(jobDomain, /onProgress: async/);
  assert.match(jobDomain, /total_rows:\s*progress\.totalRows/);
  assert.match(jobDomain, /exported_rows:\s*progress\.exportedRows/);
});

test("price export runner writes real progress and falls back to inline execution without cron", () => {
  const jobDomain = read("src/lib/price-snapshot-export-jobs.ts");
  const runnerRoute = read("src/app/api/internal/price-snapshots/export-jobs/run/route.ts");

  assert.match(jobDomain, /total_rows:\s*exportResult\.rowCount/);
  assert.match(jobDomain, /exported_rows:\s*exportResult\.rowCount/);
  assert.match(jobDomain, /file_size_bytes:\s*Buffer\.byteLength\(exportResult\.csv,\s*"utf8"\)/);
  assert.match(jobDomain, /if \(!secret\)[\s\S]*try \{[\s\S]*runPriceSnapshotExportJob[\s\S]*failPriceSnapshotExportJob/);
  assert.match(jobDomain, /if \(!response\.ok\) throw new Error/);
  assert.match(jobDomain, /catch[\s\S]*failPriceSnapshotExportJob/);
  assert.match(runnerRoute, /failPriceSnapshotExportJob\(\{ jobId, message \}\)/);
});

test("price export types and header menu expose both export domains", () => {
  const types = read("src/lib/types.ts");
  const menu = read("src/components/store-visit-monitor-export-menu.tsx");
  const button = read("src/components/price-snapshot-export-button.tsx");
  const page = read("src/app/[locale]/prices/page.tsx");

  assert.match(types, /export type PriceSnapshotExportJobStatus = "queued" \| "running" \| "completed" \| "failed"/);
  assert.match(types, /export type PriceSnapshotExportJob =/);
  assert.match(menu, /fetch\("\/api\/store-visit-monitor\/export-jobs"/);
  assert.match(menu, /fetch\("\/api\/price-snapshots\/export-jobs"/);
  assert.match(menu, /Market Price/);
  assert.match(menu, /市场价格/);
  assert.match(menu, /Price Review/);
  assert.match(menu, /价格审核/);
  assert.match(menu, /Store Visit Records/);
  assert.match(menu, /巡店记录/);
  assert.doesNotMatch(menu, /真实市场价格|Real Market Price|价格异常审核|Price anomaly review|巡店分析|Visit analysis/);
  assert.match(menu, /setInterval\([\s\S]*10000/);
  assert.match(menu, /visitResponse\.ok \?/);
  assert.match(menu, /priceResponse\.ok \?/);
  assert.doesNotMatch(menu, /if \(!visitResponse\.ok \|\| !priceResponse\.ok\)/);
  assert.match(button, /fetch\("\/api\/price-snapshots\/export-jobs"/);
  assert.match(page, /PriceSnapshotExportButton/);
  assert.match(page, /series:\s*params\.series/);
  assert.match(page, /ownSeries:\s*params\.ownSeries/);
  assert.match(page, /organization:\s*params\.organization/);
  assert.match(page, /priceIndexDrill:\s*params\.priceIndexDrill/);
  assert.doesNotMatch(page, /href=\{exportHref\}/);
});

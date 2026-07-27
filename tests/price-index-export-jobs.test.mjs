import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const read = (file) => readFileSync(file, "utf8");

test("price index export jobs persist filters, owner, progress and output metadata", () => {
  const migration = read("supabase/migrations/202607270001_price_index_export_jobs.sql");
  assert.match(migration, /create table if not exists public\.price_index_export_jobs/i);
  assert.match(migration, /filters jsonb not null/i);
  assert.match(migration, /requested_by uuid null/i);
  assert.match(migration, /status text not null check \(status in \('queued', 'running', 'completed', 'failed'\)\)/i);
  assert.match(migration, /file_path text null/i);
});

test("price index export APIs are server-authorized asynchronous task endpoints", () => {
  const jobsRoute = read("src/app/api/price-index/export-jobs/route.ts");
  const jobRoute = read("src/app/api/price-index/export-jobs/[jobId]/route.ts");
  const downloadRoute = read("src/app/api/price-index/export-jobs/[jobId]/download/route.ts");
  const runnerRoute = read("src/app/api/internal/price-index/export-jobs/run/route.ts");
  assert.match(jobsRoute, /requireAdminSession/);
  assert.match(jobsRoute, /createPriceIndexExportJob/);
  assert.match(jobsRoute, /after\(/);
  assert.match(jobRoute, /loadPriceIndexExportJob/);
  assert.match(jobRoute, /requestedBy:\s*auth\.session\.id/);
  assert.match(downloadRoute, /loadPriceIndexExportJob/);
  assert.match(downloadRoute, /requestedBy:\s*auth\.session\.id/);
  assert.match(runnerRoute, /CRON_SECRET/);
  assert.match(runnerRoute, /runPriceIndexExportJob/);
});

test("price index export builds xlsx with index and detail sheets", () => {
  const exportDomain = read("src/lib/price-index-export.ts");
  const jobDomain = read("src/lib/price-index-export-jobs.ts");
  const jobsRoute = read("src/app/api/price-index/export-jobs/route.ts");

  assert.match(exportDomain, /export function normalizePriceIndexExportFilters/);
  assert.match(exportDomain, /ownSeries \? joinPackageFilterList\(normalizePackageFilterList\(input\.ownPackage\)\)/);
  assert.match(exportDomain, /competitorPackage/);
  assert.match(exportDomain, /getWeeklyPriceCoefficientBoard/);
  assert.match(exportDomain, /buildPriceSnapshotExport/);
  assert.match(exportDomain, /buildPriceIndexMatrix/);
  assert.match(exportDomain, /xlsx-js-style/);
  assert.match(exportDomain, /withPriceIndexExportDataScope/);
  assert.match(exportDomain, /dataScope/);
  assert.match(exportDomain, /detailExport\.rows/);
  assert.match(exportDomain, /价格指数|Price Index/);
  assert.match(exportDomain, /价格明细|Price Detail/);
  assert.match(exportDomain, /bookType: "xlsx"/);
  assert.doesNotMatch(exportDomain, /flattenPriceIndexRows/);
  assert.doesNotMatch(exportDomain, /["']路径["']/);
  assert.match(jobsRoute, /resolveDataScopeForSession/);
  assert.match(jobsRoute, /withPriceIndexExportDataScope/);
  const matrixDomain = read("src/lib/price-index-matrix-export.ts");
  assert.match(matrixDomain, /export function buildPriceIndexMatrix/);
  assert.match(matrixDomain, /stylePriceIndexMatrixSheet/);
  assert.match(matrixDomain, /#,##0/);
  assert.match(matrixDomain, /W1|week\.label/);
  assert.doesNotMatch(matrixDomain, /["']路径["']/);
  assert.match(jobDomain, /buildPriceIndexExport/);
  assert.match(jobDomain, /price-index-exports/);
  assert.match(jobDomain, /application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet/);
});

test("price index export cascade drops downstream filters without upstream", () => {
  const exportDomain = read("src/lib/price-index-export.ts");
  assert.match(exportDomain, /const ownPackage = ownSeries \? joinPackageFilterList\(normalizePackageFilterList\(input\.ownPackage\)\) : undefined/);
  assert.match(exportDomain, /const competitorPackage = ownPackage \? joinPackageFilterList\(normalizePackageFilterList\(input\.competitorPackage\)\) : undefined/);
});

test("price index export button and types are wired", () => {
  assert.equal(existsSync("src/components/price-index-export-button.tsx"), true);
  const button = read("src/components/price-index-export-button.tsx");
  const types = read("src/lib/types.ts");
  const content = read("src/components/dashboard-content.tsx");
  assert.match(button, /postExportJob\("\/api\/price-index\/export-jobs"/);
  assert.match(button, /AsyncExportJobButton/);
  assert.match(types, /export type PriceIndexExportJobStatus/);
  assert.match(types, /export type PriceIndexExportJob =/);
  assert.match(content, /PriceIndexExportButton/);
  assert.match(content, /ownPackage: joinPackageFilterList\(board\.selectedOwnPackage\)/);
  assert.match(content, /competitorPackage: joinPackageFilterList\(board\.selectedCompetitorPackage\)/);
});

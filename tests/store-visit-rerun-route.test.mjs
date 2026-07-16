import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

function readMaybe(path) {
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

const jobsRoute = readMaybe("src/app/api/store-visit-monitor/rerun-jobs/route.ts");
const jobRoute = readMaybe("src/app/api/store-visit-monitor/rerun-jobs/[jobId]/route.ts");
const runRoute = readMaybe("src/app/api/internal/store-visit-monitor/rerun-jobs/run/route.ts");
const dialog = readMaybe("src/components/store-visit-matching-rerun-dialog.tsx");
const menu = readMaybe("src/components/store-visit-rerun-job-menu.tsx");
const monitorClient = readMaybe("src/components/store-visit-monitor-client.tsx");
const appShell = readMaybe("src/components/app-shell.tsx");

test("store visit rerun job APIs create list load and run jobs", () => {
  assert.match(jobsRoute, /export async function POST/);
  assert.match(jobsRoute, /export async function GET/);
  assert.match(jobsRoute, /mode/);
  assert.match(jobsRoute, /createStoreVisitRerunJob/);
  assert.match(jobsRoute, /shouldWakeRerunJob/);
  assert.match(jobsRoute, /staleJobMs/);
  assert.match(jobsRoute, /detached:\s*true/);
  assert.match(jobRoute, /refreshStoreVisitRerunJobProgress/);
  assert.match(runRoute, /CRON_SECRET/);
  assert.match(runRoute, /runStoreVisitRerunJob/);
});

test("rerun dialog supports async match-only and AI reanalysis modes", () => {
  assert.match(dialog, /runAiAnalysis/);
  assert.match(dialog, /mode: runAiAnalysis \? "ai_reanalysis" : "match_only"/);
  assert.match(dialog, /\/api\/store-visit-monitor\/rerun-jobs/);
  assert.match(dialog, /Job created|任务已创建/);
  assert.doesNotMatch(dialog, /\/api\/store-visit-monitor\/rerun-matching"/);
});

test("store visit monitor exposes rerun job menu with progress and failures", () => {
  assert.match(menu, /StoreVisitRerunJobMenu/);
  assert.match(menu, /\/api\/store-visit-monitor\/rerun-jobs/);
  assert.match(menu, /processed_visits/);
  assert.match(menu, /failed_visits/);
  assert.match(menu, /failures/);
  assert.match(menu, /match_only/);
  assert.match(menu, /ai_reanalysis/);
  assert.match(appShell, /StoreVisitRerunJobMenu/);
  assert.match(appShell, /StoreVisitRerunJobMenu[\s\S]*StoreVisitMonitorExportMenu/);
  assert.doesNotMatch(monitorClient, /<StoreVisitRerunJobMenu/);
});

test("rerun job menu uses the same quiet header button style as exports", () => {
  assert.doesNotMatch(menu, /import \{ Badge, Button \}/);
  assert.match(menu, /type ToggleEvent/);
  assert.match(menu, /<details className="relative shrink-0" onToggle=\{handleToggle\}>/);
  assert.match(menu, /<summary className="inline-flex h-8/);
  assert.match(menu, />\s*Tasks\s*</);
  assert.match(menu, /inline-flex h-8/);
  assert.match(menu, /border border-slate-300 bg-white/);
  assert.match(menu, /text-xs font-medium text-slate-700/);
  assert.match(menu, /\[\&::-webkit-details-marker\]:hidden/);
});

import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

function readMaybe(path: string) {
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

const migration = readMaybe("supabase/migrations/202607150003_store_visit_rerun_jobs.sql");
const typesFile = readFileSync("src/lib/types.ts", "utf8");
const serviceFile = readMaybe("src/lib/store-visit-rerun-jobs.ts");

test("store visit rerun jobs migration supports match-only and AI reanalysis modes", () => {
  assert.match(migration, /store_visit_rerun_jobs/);
  assert.match(migration, /mode text not null/);
  assert.match(migration, /match_only/);
  assert.match(migration, /ai_reanalysis/);
  assert.match(migration, /child_ai_jobs jsonb/);
  assert.match(migration, /failures jsonb/);
  assert.match(migration, /enable row level security/i);
});

test("store visit rerun job types expose mode status and failure records", () => {
  assert.match(typesFile, /export type StoreVisitRerunJobMode = "match_only" \| "ai_reanalysis"/);
  assert.match(typesFile, /export type StoreVisitRerunJobStatus = "queued" \| "running" \| "completed" \| "failed"/);
  assert.match(typesFile, /export type StoreVisitRerunJobFailure/);
  assert.match(typesFile, /export type StoreVisitRerunJob/);
  assert.match(typesFile, /child_ai_jobs/);
});

test("store visit rerun job service separates match-only and AI reanalysis execution", () => {
  assert.match(serviceFile, /export async function createStoreVisitRerunJob/);
  assert.match(serviceFile, /export async function listStoreVisitRerunJobs/);
  assert.match(serviceFile, /export async function runStoreVisitRerunJob/);
  assert.match(serviceFile, /export async function refreshStoreVisitRerunJobProgress/);
  assert.match(serviceFile, /mode === "match_only"/);
  assert.match(serviceFile, /mode === "ai_reanalysis"/);
  assert.match(serviceFile, /createStoreVisitAiJob/);
  assert.match(serviceFile, /triggerStoreVisitAiJobRunner/);
  assert.match(
    serviceFile,
    /if \(job\.mode === "ai_reanalysis"\) \{[\s\S]*startAiReanalysisJob/,
  );
  assert.match(
    serviceFile,
    /if \(job\.mode === "match_only"\) \{[\s\S]*rerunStoreVisitMatching/,
  );
});

test("match-only rerun jobs run in resumable batches and reschedule unfinished work", () => {
  assert.match(serviceFile, /maxMatchOnlyVisitsPerRun/);
  assert.match(serviceFile, /startOffset:\s*job\.processed_visits/);
  assert.match(serviceFile, /maxVisits:\s*maxMatchOnlyVisitsPerRun/);
  assert.match(serviceFile, /initialProgress:\s*progressFromJob\(job\)/);
  assert.match(serviceFile, /isMatchingResultComplete\(result\)/);
  assert.match(serviceFile, /triggerStoreVisitRerunJobRunner\(\{[\s\S]*detached:\s*true/);
});

test("AI reanalysis rerun jobs refresh existing child jobs instead of creating duplicates", () => {
  assert.match(serviceFile, /job\.mode === "ai_reanalysis"/);
  assert.match(serviceFile, /job\.child_ai_jobs\.length > 0/);
  assert.match(serviceFile, /refreshStoreVisitRerunJobProgress\(\{ job, supabase \}\)/);
});

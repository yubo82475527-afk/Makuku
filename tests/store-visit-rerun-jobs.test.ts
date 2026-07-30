import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

function readMaybe(path: string) {
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

const migration = readMaybe("supabase/migrations/202607150003_store_visit_rerun_jobs.sql");
const progressMigration = readMaybe("supabase/migrations/202607290001_store_visit_rerun_jobs_progress.sql");
const typesFile = readFileSync("src/lib/types.ts", "utf8");
const serviceFile = readMaybe("src/lib/store-visit-rerun-jobs.ts");
const gatewayFile = readMaybe("src/lib/store-visit-matching-rerun-gateway.ts");
const matchingFile = readMaybe("src/lib/store-visit-matching-rerun.ts");
const vercelFile = readMaybe("vercel.json");
const runRoute = readMaybe("src/app/api/internal/store-visit-monitor/rerun-jobs/run/route.ts");
const menuFile = readMaybe("src/components/store-visit-rerun-job-menu.tsx");

test("store visit rerun jobs migration supports match-only and AI reanalysis modes", () => {
  assert.match(migration, /store_visit_rerun_jobs/);
  assert.match(migration, /mode text not null/);
  assert.match(migration, /match_only/);
  assert.match(migration, /ai_reanalysis/);
  assert.match(migration, /child_ai_jobs jsonb/);
  assert.match(migration, /failures jsonb/);
  assert.match(migration, /enable row level security/i);
});

test("store visit rerun jobs progress migration adds progress jsonb", () => {
  assert.match(progressMigration, /add column if not exists progress jsonb/);
});

test("store visit rerun job types expose mode status progress and failure records", () => {
  assert.match(typesFile, /export type StoreVisitRerunJobMode = "match_only" \| "ai_reanalysis"/);
  assert.match(typesFile, /export type StoreVisitRerunJobStatus = "queued" \| "running" \| "completed" \| "failed"/);
  assert.match(typesFile, /export type StoreVisitRerunJobFailure/);
  assert.match(typesFile, /export type StoreVisitRerunJobProgress/);
  assert.match(typesFile, /export type StoreVisitRerunJob/);
  assert.match(typesFile, /child_ai_jobs/);
  assert.match(typesFile, /progress: StoreVisitRerunJobProgress/);
  assert.match(typesFile, /quality_unsettled_count/);
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
    /if \(job\.mode === "match_only"\) \{[\s\S]*runMatchOnlyRerunJob/,
  );
});

test("match-only rerun jobs resume by excluding finished visit ids and settle quality before completed", () => {
  assert.match(serviceFile, /maxMatchOnlyVisitsPerRun = 120/);
  assert.match(serviceFile, /excludeVisitIds:\s*doneIds/);
  assert.match(serviceFile, /maxVisits:\s*maxMatchOnlyVisitsPerRun/);
  assert.match(serviceFile, /initialProgress:\s*progressFromJob\(job\)/);
  assert.match(serviceFile, /isMatchingVisitsComplete/);
  assert.match(serviceFile, /settleMatchOnlyQuality/);
  assert.match(serviceFile, /quality_unsettled_count/);
  assert.match(serviceFile, /completeMatchOnlyJob/);
  assert.match(serviceFile, /triggerStoreVisitRerunJobRunner\(\{[\s\S]*detached:\s*true/);
  assert.match(serviceFile, /maxVisitFailureAttempts = 3/);
  assert.doesNotMatch(serviceFile, /startOffset:\s*job\.processed_visits/);
});

test("match-only runner claims queued jobs and only reclaims stale running work", () => {
  assert.match(serviceFile, /export const STORE_VISIT_RERUN_STALE_MS = 6 \* 60 \* 1000/);
  assert.match(serviceFile, /\.eq\("status", "queued"\)/);
  assert.match(serviceFile, /\.eq\("status", "running"\)[\s\S]*?\.lt\("updated_at", staleBefore\)/);
  assert.match(serviceFile, /if \(!claimed\) return \{ job: await refreshStoreVisitRerunJobProgress/);
  assert.match(serviceFile, /requeueStoreVisitRerunJob/);
  assert.match(serviceFile, /loadNextRunnableJob/);
});

test("match-only rerun jobs pass requestUrl into the matching gateway for quality wake", () => {
  assert.match(
    serviceFile,
    /createStoreVisitMatchingRerunGateway\(supabase,\s*\{\s*requestUrl\s*\}\)/,
  );
});

test("AI reanalysis rerun jobs refresh existing child jobs instead of creating duplicates", () => {
  assert.match(serviceFile, /job\.mode === "ai_reanalysis"/);
  assert.match(serviceFile, /job\.child_ai_jobs\.length > 0/);
  assert.match(serviceFile, /refreshStoreVisitRerunJobProgress\(\{ job, supabase \}\)/);
});

test("AI reanalysis wakes multiple child jobs instead of only the first Visit", () => {
  assert.match(serviceFile, /maxAiReanalysisChildWakeCount = 5/);
  assert.match(serviceFile, /childAiJobs\.slice\(0,\s*maxAiReanalysisChildWakeCount\)/);
  assert.match(serviceFile, /Promise\.all\(wakeJobs\.map/);
  assert.doesNotMatch(serviceFile, /childAiJobs\[0\]\?\.jobId/);
});

test("vercel cron runs rematch worker every minute", () => {
  assert.match(vercelFile, /store-visit-monitor\/rerun-jobs\/run/);
  assert.match(vercelFile, /"\* \* \* \* \*"/);
});

test("rematch runner route accepts cron GET and POST", () => {
  assert.match(runRoute, /export async function GET/);
  assert.match(runRoute, /export async function POST/);
  assert.match(runRoute, /maxDuration = 300/);
});

test("matching rerun uses limited visit concurrency and build-before-insert retry", () => {
  assert.match(matchingFile, /DEFAULT_MATCH_ONLY_VISIT_CONCURRENCY = 12/);
  assert.match(matchingFile, /mapWithConcurrency/);
  assert.match(matchingFile, /excludeVisitIds/);
  assert.match(matchingFile, /failedVisitIdsThisRun/);
  assert.match(gatewayFile, /INSERT_RETRY_ATTEMPTS/);
  assert.match(gatewayFile, /preserveExistingCandidates:\s*true/);
  assert.match(gatewayFile, /buildAiPriceCandidateRows/);
  assert.match(gatewayFile, /countUnsettledSkuQualityForVisits/);
  assert.match(gatewayFile, /listUnsettledSkuCandidateIdsForVisits/);
});

test("match-only progress refresh does not rewrite worker progress to the database", () => {
  assert.match(serviceFile, /Read-only for UI: never rewrite progress here/);
  const matchOnlyRefresh = serviceFile.match(
    /if \(job\.mode === "match_only" && \(job\.status === "running" \|\| job\.status === "queued"\)\) \{[\s\S]*?\n  \}/,
  )?.[0] ?? "";
  assert.match(matchOnlyRefresh, /countUnsettledSkuQualityForVisits/);
  assert.doesNotMatch(matchOnlyRefresh, /\.update\(/);
});

test("claimed rematch runner requeues on unexpected errors so cron can recover", () => {
  assert.match(serviceFile, /await requeueStoreVisitRerunJob\(supabase, job\.id, \{ error_message: message \}\)/);
  assert.match(serviceFile, /await failStoreVisitRerunJob\(\{ jobId: job\.id, message, supabase \}/);
});

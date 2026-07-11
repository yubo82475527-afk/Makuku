# Store Visit AI Job Atomic Finalization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent visit-detail reconciliation or stale workers from converting successful store-visit AI analysis into false image failures.

**Architecture:** Keep the existing AI and price-candidate pipeline intact. Add one service-role PostgreSQL RPC that fences terminal transitions by the existing per-claim `worker_id` and atomically updates the job item, image terminal status, and parent-job counts; restrict image-to-job reconciliation to queued items only.

**Tech Stack:** Next.js 16, TypeScript, Supabase PostgreSQL/PLpgSQL RPC, Node test runner.

---

## File map

- Create `supabase/migrations/202607110001_store_visit_ai_job_atomic_finalization.sql`: additive, service-role-only atomic finalization RPC.
- Modify `src/lib/store-visit-ai-jobs.ts`: call the RPC, distinguish ownership conflicts from analysis failures, and exclude processing items from reconciliation.
- Modify `tests/store-visit-auto-analyze.test.mjs`: lock down the migration contract and worker/reconciliation behavior.

No other production file, API response, AI prompt, candidate schema, or UI component changes.

### Task 1: Add the atomic finalization RPC

**Files:**
- Create: `supabase/migrations/202607110001_store_visit_ai_job_atomic_finalization.sql`
- Modify: `tests/store-visit-auto-analyze.test.mjs`

- [ ] **Step 1: Write the failing migration contract test**

Add the migration fixture beside the existing AI-job migration fixtures:

```js
const storeVisitAiFinalizeMigration = readMaybe(
  "supabase/migrations/202607110001_store_visit_ai_job_atomic_finalization.sql",
);
```

Add this test after the existing RPC-disambiguation test:

```js
test("store visit AI finalization is fenced, atomic, idempotent, and service-role only", () => {
  assert.match(storeVisitAiFinalizeMigration, /finalize_store_visit_ai_job_item/);
  assert.match(storeVisitAiFinalizeMigration, /for update/i);
  assert.match(storeVisitAiFinalizeMigration, /v_item\.worker_id is distinct from p_worker_id/i);
  assert.match(storeVisitAiFinalizeMigration, /already_finalized/);
  assert.match(storeVisitAiFinalizeMigration, /ownership_lost/);
  assert.match(storeVisitAiFinalizeMigration, /update public\.offline_visit_images/);
  assert.match(storeVisitAiFinalizeMigration, /count\(\*\) filter \(where status = 'succeeded'\)/i);
  assert.match(storeVisitAiFinalizeMigration, /revoke all on function public\.finalize_store_visit_ai_job_item/);
  assert.match(storeVisitAiFinalizeMigration, /grant execute on function public\.finalize_store_visit_ai_job_item[\s\S]*to service_role/);
});
```

- [ ] **Step 2: Run the targeted test and verify it fails**

Run:

```powershell
node --test tests/store-visit-auto-analyze.test.mjs
```

Expected: one new test fails because the migration file is absent; the previous 78 tests remain green.

- [ ] **Step 3: Create the additive RPC migration**

Create `supabase/migrations/202607110001_store_visit_ai_job_atomic_finalization.sql` with this behavior:

```sql
create or replace function public.finalize_store_visit_ai_job_item(
  p_item_id uuid,
  p_worker_id text,
  p_outcome text,
  p_result_summary jsonb default '{}'::jsonb,
  p_error_message text default null
)
returns table(
  finalize_result text,
  finalized_job_id uuid,
  finalized_image_id uuid,
  finalized_item_status text,
  finalized_job_status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.store_visit_ai_job_items%rowtype;
  v_job public.store_visit_ai_jobs%rowtype;
  v_success_count integer;
  v_failed_count integer;
  v_retake_required_count integer;
  v_remaining_count integer;
  v_job_status text;
begin
  if p_outcome not in ('succeeded', 'retake_required', 'failed') then
    raise exception 'invalid store visit AI job item outcome: %', p_outcome;
  end if;
  if p_worker_id is null or btrim(p_worker_id) = '' then
    raise exception 'worker id is required to finalize a store visit AI job item';
  end if;
  if p_outcome = 'failed' and (p_error_message is null or btrim(p_error_message) = '') then
    raise exception 'error message is required for a failed store visit AI job item';
  end if;

  select * into v_item
  from public.store_visit_ai_job_items
  where id = p_item_id
  for update;

  if v_item.id is null then
    raise exception 'store visit AI job item not found: %', p_item_id;
  end if;

  select * into v_job
  from public.store_visit_ai_jobs
  where id = v_item.job_id
  for update;

  if v_item.status in ('succeeded', 'retake_required', 'failed') then
    if v_item.status = p_outcome and v_item.worker_id is not distinct from p_worker_id then
      return query select 'already_finalized', v_item.job_id, v_item.source_image_id, v_item.status, v_job.status;
    else
      return query select 'ownership_lost', v_item.job_id, v_item.source_image_id, v_item.status, v_job.status;
    end if;
    return;
  end if;

  if v_item.status <> 'processing'
    or v_item.worker_id is distinct from p_worker_id
    or v_job.status not in ('queued', 'running') then
    return query select 'ownership_lost', v_item.job_id, v_item.source_image_id, v_item.status, v_job.status;
    return;
  end if;

  update public.store_visit_ai_job_items
  set status = p_outcome,
      result_summary = coalesce(p_result_summary, '{}'::jsonb),
      error_message = case when p_outcome = 'failed' then p_error_message else null end,
      last_heartbeat_at = now(),
      lease_expires_at = null,
      updated_at = now()
  where id = v_item.id;

  update public.offline_visit_images
  set analysis_status = case when p_outcome = 'failed' then 'failed' else 'analyzed' end,
      analysis_error = case when p_outcome = 'failed' then p_error_message else null end,
      error_message = case when p_outcome = 'failed' then p_error_message else null end
  where id = v_item.source_image_id;

  select
    count(*) filter (where status = 'succeeded'),
    count(*) filter (where status = 'failed'),
    count(*) filter (where status = 'retake_required'),
    count(*) filter (where status not in ('succeeded', 'retake_required', 'failed'))
  into v_success_count, v_failed_count, v_retake_required_count, v_remaining_count
  from public.store_visit_ai_job_items
  where job_id = v_item.job_id;

  v_job_status := case
    when v_remaining_count > 0 then 'running'
    when v_success_count = 0 and v_retake_required_count = 0 and v_failed_count > 0 then 'failed'
    else 'completed'
  end;

  update public.store_visit_ai_jobs
  set success_count = v_success_count,
      failed_count = v_failed_count,
      retake_required_count = v_retake_required_count,
      remaining_count = v_remaining_count,
      status = v_job_status,
      completed_at = case when v_remaining_count = 0 then now() else null end,
      last_heartbeat_at = now(),
      lease_expires_at = case when v_remaining_count = 0 then null else lease_expires_at end,
      updated_at = now()
  where id = v_item.job_id;

  return query select 'applied', v_item.job_id, v_item.source_image_id, p_outcome, v_job_status;
end;
$$;

revoke all on function public.finalize_store_visit_ai_job_item(uuid,text,text,jsonb,text)
  from public, anon, authenticated;
grant execute on function public.finalize_store_visit_ai_job_item(uuid,text,text,jsonb,text)
  to service_role;

notify pgrst, 'reload schema';
```

Do not alter existing tables or rewrite existing rows.

- [ ] **Step 4: Run the targeted test and verify it passes**

Run:

```powershell
node --test tests/store-visit-auto-analyze.test.mjs
```

Expected: 79 tests pass, 0 fail.

- [ ] **Step 5: Commit the migration contract**

```powershell
git add -- tests/store-visit-auto-analyze.test.mjs supabase/migrations/202607110001_store_visit_ai_job_atomic_finalization.sql
git commit -m "feat: add atomic store visit AI finalization RPC"
```

### Task 2: Stop reconciliation from stealing active work

**Files:**
- Modify: `src/lib/store-visit-ai-jobs.ts:103-153`
- Modify: `tests/store-visit-auto-analyze.test.mjs`

- [ ] **Step 1: Tighten the reconciliation test first**

Replace the existing stale-job reconciliation test with:

```js
test("store visit detail only reconciles queued AI items and never steals processing work", () => {
  assert.match(storeVisitAiJobs, /const reconcilableItems = input\.items\.filter\(\(item\) => item\.status === "queued"\)/);
  assert.match(storeVisitAiJobs, /reconcileStoreVisitAiJobFromImages/);
  assert.match(storeVisitAiJobs, /image\.analysis_status === "analyzed"/);
  assert.match(storeVisitDetailRoute, /reconcileActiveStoreVisitAiJob/);
  assert.doesNotMatch(storeVisitDetailRoute, /loadActiveStoreVisitAiJob/);
});
```

- [ ] **Step 2: Run the targeted test and verify it fails**

Run:

```powershell
node --test tests/store-visit-auto-analyze.test.mjs
```

Expected: the new reconciliation ownership assertion fails because current code includes all non-terminal items.

- [ ] **Step 3: Restrict reconciliation to queued items**

At the start of `reconcileStoreVisitAiJobFromImages`, replace `openItems` with:

```ts
const reconcilableItems = input.items.filter((item) => item.status === "queued");
if (reconcilableItems.length === 0) return { job: input.job, items: input.items };

const imageIds = cleanIds(reconcilableItems.map((item) => item.source_image_id));
```

Iterate over `reconcilableItems` in the existing loop. Do not change how queued stale items derive terminal state from images.

- [ ] **Step 4: Run the targeted test and verify it passes**

Run:

```powershell
node --test tests/store-visit-auto-analyze.test.mjs
```

Expected: 79 tests pass, 0 fail.

- [ ] **Step 5: Commit the state-ownership boundary**

```powershell
git add -- tests/store-visit-auto-analyze.test.mjs src/lib/store-visit-ai-jobs.ts
git commit -m "fix: preserve active AI job item ownership"
```

### Task 3: Route worker terminal transitions through the RPC

**Files:**
- Modify: `src/lib/store-visit-ai-jobs.ts:378-516`
- Modify: `tests/store-visit-auto-analyze.test.mjs`

- [ ] **Step 1: Write failing worker-finalization assertions**

Add:

```js
test("store visit AI worker uses fenced finalization without converting control conflicts into image failures", () => {
  assert.match(storeVisitAiJobs, /rpc\("finalize_store_visit_ai_job_item"/);
  assert.match(storeVisitAiJobs, /p_worker_id: item\.worker_id/);
  assert.match(storeVisitAiJobs, /finalizeResult === "ownership_lost"/);
  assert.match(storeVisitAiJobs, /item ownership lost/);
  assert.doesNotMatch(storeVisitAiJobs, /Unable to finalize store visit AI job item/);
  assert.doesNotMatch(storeVisitAiJobs, /async function markImageFailed/);
});
```

- [ ] **Step 2: Run the targeted test and verify it fails**

Run:

```powershell
node --test tests/store-visit-auto-analyze.test.mjs
```

Expected: the worker-finalization test fails on the missing RPC call and legacy failure path.

- [ ] **Step 3: Add a typed RPC wrapper**

Add near the job constants:

```ts
type StoreVisitAiFinalizeOutcome = "succeeded" | "retake_required" | "failed";
type StoreVisitAiFinalizeResult = "applied" | "already_finalized" | "ownership_lost";
```

Replace `markImageFailed` with:

```ts
async function finalizeStoreVisitAiJobItem(input: {
  supabase: SupabaseServiceClient;
  item: StoreVisitAiJobItem;
  outcome: StoreVisitAiFinalizeOutcome;
  resultSummary: Record<string, unknown>;
  errorMessage?: string | null;
}) {
  if (!input.item.worker_id) throw new Error("Claimed store visit AI job item has no worker owner.");
  const { data, error } = await input.supabase.rpc("finalize_store_visit_ai_job_item", {
    p_item_id: input.item.id,
    p_worker_id: input.item.worker_id,
    p_outcome: input.outcome,
    p_result_summary: input.resultSummary,
    p_error_message: input.errorMessage ?? null,
  });
  if (error) throw new Error(error.message);
  const row = Array.isArray(data)
    ? data[0] as { finalize_result?: StoreVisitAiFinalizeResult } | undefined
    : null;
  if (!row?.finalize_result) throw new Error("Store visit AI finalization returned no result.");
  return row.finalize_result;
}
```

- [ ] **Step 4: Separate analysis failures from finalization failures**

Replace `processItem` with the complete implementation below. Only analysis/candidate-processing errors are submitted as `failed`; RPC/database errors occur outside that catch and propagate to lease recovery.

```ts
async function processItem(input: {
  supabase: SupabaseServiceClient;
  job: StoreVisitAiJob;
  item: StoreVisitAiJobItem;
}) {
  const { supabase, job, item } = input;
  const { data: markedImages, error: markError } = await supabase
    .from("offline_visit_images")
    .update({
      analysis_status: "analyzing",
      analysis_error: null,
      error_message: null,
    })
    .eq("visit_id", job.visit_id)
    .eq("id", item.source_image_id)
    .select("id");
  if (markError) throw new Error(markError.message);
  if ((markedImages ?? []).length !== 1) throw new Error("Unable to mark the requested photo for AI analysis.");

  let completed: {
    outcome: Exclude<StoreVisitAiFinalizeOutcome, "failed">;
    resultSummary: Record<string, unknown>;
  } | null = null;
  let analysisFailure: string | null = null;

  try {
    const isRerun = job.job_type === "single_image_reanalysis" || job.job_type === "full_visit_reanalysis";
    const result = await runStoreVisitAnalysis({
      visitId: job.visit_id,
      affectedImageIds: [item.source_image_id],
      invalidateAffectedImageSnapshots: isRerun,
      forceAnalyzeImageIds: [item.source_image_id],
    });
    const syncResult = await syncStoreVisitPriceCandidatesFromImages({
      visitId: job.visit_id,
      imageIds: [item.source_image_id],
      supabase,
    });

    const retake = result.aiAnalysis.price_image_retake_required.find((entry) => entry.imageId === item.source_image_id);
    const forcedResult = result.forcedImageResults.find((entry) => entry.imageId === item.source_image_id);
    completed = {
      outcome: retake ? "retake_required" : "succeeded",
      resultSummary: {
        response_id: forcedResult?.responseId ?? null,
        usage_present: Boolean(forcedResult?.usagePresent),
        row_count: forcedResult?.rowCount ?? 0,
        replaced_candidate_count: result.replacedCandidateCount,
        deleted_snapshot_count: result.deletedSnapshotCount,
        synced_candidate_count: syncResult.inserted_count,
        eligible_candidate_row_count: syncResult.eligible_row_count,
        retake_reasons: retake?.reasons ?? null,
        retake_message: retake?.message ?? null,
      },
    };
  } catch (error) {
    analysisFailure = error instanceof Error ? error.message : "Unknown error";
  }

  const outcome: StoreVisitAiFinalizeOutcome = analysisFailure ? "failed" : completed!.outcome;
  const resultSummary = analysisFailure ? { error_message: analysisFailure } : completed!.resultSummary;
  const finalizeResult = await finalizeStoreVisitAiJobItem({
    supabase,
    item,
    outcome,
    resultSummary,
    errorMessage: analysisFailure,
  });

  if (finalizeResult === "ownership_lost") {
    console.warn("[store-visit-ai-jobs] item ownership lost", {
      job_id: job.id,
      visit_id: job.visit_id,
      image_id: item.source_image_id,
      item_id: item.id,
      worker_id: item.worker_id,
      attempt_count: item.attempt_count,
      intended_status: outcome,
    });
    return;
  }

  if (finalizeResult === "already_finalized") {
    console.info("[store-visit-ai-jobs] item already finalized", {
      job_id: job.id,
      item_id: item.id,
      image_id: item.source_image_id,
      status: outcome,
    });
  }

  if (analysisFailure) {
    console.error("[store-visit-ai-jobs] item analysis failed", {
      job_id: job.id,
      job_type: job.job_type,
      visit_id: job.visit_id,
      image_id: item.source_image_id,
      attempt_count: item.attempt_count,
      error: analysisFailure,
    });
    return;
  }

  console.info("[store-visit-ai-jobs] item completed", {
    job_id: job.id,
    job_type: job.job_type,
    visit_id: job.visit_id,
    image_id: item.source_image_id,
    attempt_count: item.attempt_count,
    status: completed!.outcome,
    result_summary: completed!.resultSummary,
  });
}
```

Delete the direct terminal item updates and `markImageFailed`.

- [ ] **Step 5: Run targeted tests and type/lint checks**

Run:

```powershell
node --test tests/store-visit-auto-analyze.test.mjs
npx tsc --noEmit
npm run lint -- --quiet
```

Expected: all target tests pass; TypeScript and ESLint exit 0.

- [ ] **Step 6: Commit the worker integration**

```powershell
git add -- tests/store-visit-auto-analyze.test.mjs src/lib/store-visit-ai-jobs.ts
git commit -m "fix: finalize store visit AI items atomically"
```

### Task 4: Regression verification

**Files:**
- Verify only; no planned production edits.

- [ ] **Step 1: Run the full automated test suite**

Run:

```powershell
node --test tests/*.test.mjs
```

Expected: all tests pass, 0 fail.

- [ ] **Step 2: Run the production build**

Run:

```powershell
npm run build
```

Expected: Next.js production build exits 0 with no TypeScript or route compilation errors.

- [ ] **Step 3: Inspect the final diff and migration safety**

Run:

```powershell
git status --short
git diff HEAD~3 --check
git diff HEAD~3 --stat
```

Expected: only the migration, AI-job domain module, and targeted test changed after the plan commit; no whitespace errors or unrelated files.

- [ ] **Step 4: Record deployment order in the handoff**

State explicitly: apply `202607110001_store_visit_ai_job_atomic_finalization.sql` before or together with the application deployment. Do not run any historical batch/image repair as part of this release.

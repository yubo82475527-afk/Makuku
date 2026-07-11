# Store Visit AI Job Atomic Finalization Design

## 1. Background and decision

Batch `ST202607100050` exposed a race between the AI worker and visit-detail reconciliation. While a worker still owned a `processing` item, a detail-page GET reconciled that item from the image's persisted state and moved it to a terminal status. The worker then attempted its guarded `processing -> terminal` update, affected zero rows, and treated that control-plane conflict as an image-analysis failure. A valid 13-row AI result was therefore displayed as a system error.

This is low-frequency but correctness-critical: a read request can currently invalidate a successful price-analysis outcome. We will implement a deliberately narrow version of the atomic state-machine approach. It must preserve the existing AI analysis, image parsing, candidate generation, review, retry, and H5 presentation behavior.

## 2. Design principles

- A `processing` job item has exactly one state owner: the worker recorded in `worker_id`.
- Visit-detail reads must never terminalize an actively leased `processing` item.
- Terminal task state, image terminal status, and parent-job counts are committed through one database RPC transaction.
- Control-plane conflicts are not image-analysis failures.
- The change is additive and rollback-safe: no table replacement, destructive migration, historical rewrite, or new infrastructure.
- Reuse the existing per-claim random `worker_id` as the fencing token. Do not add a duplicate `claim_token` column in this change.

## 3. State ownership and transitions

The existing statuses remain unchanged.

| Transition | Owner | Rule |
| --- | --- | --- |
| `queued -> processing` | `claim_store_visit_ai_job_item` | Atomically assigns a fresh `worker_id`, increments `attempt_count`, and sets the lease. |
| `processing -> succeeded` | Owning worker via finalize RPC | Requires matching item ID and `worker_id`. |
| `processing -> retake_required` | Owning worker via finalize RPC | Requires matching item ID and `worker_id`. |
| `processing -> failed` | Owning worker via finalize RPC | Only for a genuine analysis/persistence failure, with a user-safe error. |
| expired `processing -> queued` | Existing claim/recovery path | Allowed only after lease expiry; clears the old owner before another claim. |
| non-processing stale item reconciliation | Existing recovery behavior | May remain for compatibility, but must never update `processing` items. |

Terminal states are immutable for normal processing. Repeating the same finalization request returns an idempotent result instead of changing counts twice.

## 4. Atomic finalization RPC

Add an incremental Supabase migration defining a service-role-only RPC such as:

```text
finalize_store_visit_ai_job_item(
  p_item_id uuid,
  p_worker_id text,
  p_outcome text,
  p_result_summary jsonb,
  p_error_message text
)
```

Accepted outcomes are `succeeded`, `retake_required`, and `failed`. The RPC performs the following in one transaction:

1. Lock the item row and load its parent job and source image.
2. Validate the requested outcome and required identifiers.
3. If the item is `processing` and `worker_id` matches, update the item terminal state, clear its lease, and persist its summary/error.
4. Set the corresponding image terminal fields consistently:
   - `succeeded` or `retake_required`: `analysis_status = analyzed`, clear analysis errors.
   - `failed`: `analysis_status = failed`, persist the supplied analysis error.
5. Recompute parent-job counts from all item rows, rather than incrementing counters.
6. Set the parent job to `running`, `completed`, or `failed` using the existing semantics and timestamps.
7. Return one of:
   - `applied`: this call performed the transition.
   - `already_finalized`: the item already has the same terminal outcome; treat as success.
   - `ownership_lost`: the item is not owned by this worker or has a different terminal outcome; do not change the image.

The RPC must lock and qualify rows so a stale worker cannot overwrite a newer attempt. Permissions follow the existing job RPC pattern: revoke access from public, anon, and authenticated roles; grant execution only to `service_role`.

## 5. Application behavior

`processItem` continues to run the existing analysis and candidate synchronization pipeline. Its two direct terminal-update branches are replaced by calls to the finalization RPC.

- Successful AI processing submits `succeeded` or `retake_required` with the existing result summary.
- Genuine processing exceptions submit `failed` through the same RPC.
- `already_finalized` is handled as successful completion.
- `ownership_lost` is logged with job, item, image, worker, attempt, and outcome identifiers, then processing stops without calling `markImageFailed`.
- A database/network error while calling the RPC is not converted into an image failure. The item remains recoverable through its lease and the error is logged for the runner.

The existing AI provider call, `vision_result` shape, candidate generation, candidate idempotency, snapshot behavior, and H5 response contract remain unchanged.

## 6. Reconciliation and recovery

The detail GET route may continue invoking the existing reconciliation entry point for backward compatibility, but reconciliation must exclude every `processing` item regardless of image status or stale `vision_result`. This is the smallest safe behavior change and preserves recovery of old queued jobs.

Lease recovery remains in the existing claim/cron path:

- Active lease: no other path changes the item.
- Expired lease: reset to `queued`, clear owner and lease, and allow a fresh claim.
- A late worker using the old `worker_id` receives `ownership_lost` from the finalize RPC.

This change does not add event sourcing, a workflow engine, a new queue, a new history table, or automatic recovery from persisted AI JSON. Those would add risk without being necessary for this defect.

## 7. Observability

Structured logs must distinguish:

- `item_finalized`
- `item_already_finalized`
- `item_ownership_lost`
- `item_finalize_rpc_failed`
- `item_analysis_failed`

Logs include IDs and status metadata but not image contents, credentials, or full provider responses. The UI continues showing genuine per-image analysis failures; ownership conflicts are not surfaced as photo errors.

## 8. Compatibility and rollout

- Deploy the additive RPC migration before or with application code that calls it.
- Existing rows need no backfill because all currently active claims already have `worker_id`; new claims continue assigning a fresh value.
- The old application remains compatible with the additive migration, so an application rollback does not require a database rollback.
- Do not repair historical visit/image statuses in this migration. Any one-off data repair is a separate, explicitly reviewed operation.
- After deployment, monitor finalize conflicts and failed-image counts. `ownership_lost` may occur during legitimate lease recovery but must not create a new image failure.

## 9. Test and acceptance criteria

Automated tests must cover:

1. Detail-page polling while a valid lease is processing cannot change the item status.
2. The owning worker atomically finalizes `succeeded`, `retake_required`, and `failed` outcomes.
3. Calling finalization twice with the same owner and outcome returns `already_finalized` without changing counts.
4. A stale worker cannot finalize after lease recovery and a new claim; the image is not marked failed.
5. A different terminal outcome cannot overwrite an existing terminal item.
6. Parent counts are recomputed correctly for mixed outcomes and the job reaches the same completed/failed semantics as today.
7. An RPC transport/database failure does not invoke the image-failure path.
8. Existing initial analysis, single-image reanalysis, full-visit reanalysis, candidate synchronization, and stale queued-job recovery tests continue passing.

Acceptance requires reproducing the original ordering—reconciliation between AI result persistence and worker finalization—and verifying that the worker completes without the `Unable to finalize store visit AI job item` false failure.

## 10. Explicit non-goals

- No changes to AI prompts, models, image-quality rules, price parsing, or review decisions.
- No new task orchestration service or multi-Agent capability.
- No broad refactor of store-visit analysis modules.
- No status-history or event-sourcing subsystem.
- No modification of unrelated user data or historical results.

# Store Visit Monitor Export Jobs Design

## Goal

Replace the current direct-download export in Store Visit Monitor with a real background export job that:

- exports all rows under the current filter set, not only the current page
- gives immediate user feedback after clicking export
- shows job progress while the export is running
- stores the finished `.xlsx` file in Supabase Storage
- lets the user download the completed file from the list page

## Scope

This design only covers Store Visit Monitor export behavior.

In scope:

- export job persistence
- export job status polling
- background runner for Store Visit Monitor exports
- storage upload and completed download flow
- list-page export UI changes

Out of scope:

- generic shared export framework for other modules
- historical export center page
- bulk cleanup UI for old export files
- changing Store Visit Monitor table columns or filter semantics

## Current Problem

The current `Export Excel` action is a direct link to `/api/store-visit-monitor/export`. That has two user-visible failures:

1. Clicking the button gives no progress or feedback while the server is working.
2. Large filtered exports are still tied to a single HTTP request and can time out.

The current backend export path already ignores page and page size, but the UI does not communicate this clearly and the overall interaction still feels broken because there is no state between click and download.

## Approach

Introduce a dedicated export job model for Store Visit Monitor. The frontend creates a job with the active filters. A background runner processes the job in batches, updates progress in the job row, builds the workbook, uploads it to Supabase Storage, and marks the job completed. The list page polls the latest job state and exposes a download action only after completion.

This keeps the heavy export work out of the request that the user clicks, while preserving the existing filter model and export column set.

## Data Model

Add a new table: `store_visit_monitor_export_jobs`

Required fields:

- `id uuid primary key`
- `status text not null`
- `filters jsonb not null`
- `locale text not null default 'zh'`
- `requested_by uuid null`
- `total_rows integer not null default 0`
- `exported_rows integer not null default 0`
- `file_path text null`
- `file_size_bytes bigint null`
- `error_message text null`
- `started_at timestamptz null`
- `completed_at timestamptz null`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Allowed statuses:

- `queued`
- `running`
- `completed`
- `failed`

Filters stored in `filters`:

- `visit_code`
- `store_name`
- `promoter`
- `analysis_status`
- `date_from`
- `date_to`

Explicitly excluded from stored filters:

- `page`
- `page_size`

## Storage Layout

Store finished files in Supabase Storage under a dedicated path:

- bucket: existing private bucket if available, otherwise a dedicated export bucket
- object path: `store-visit-monitor-exports/<job-id>.xlsx`

The download endpoint should not expose raw storage internals directly. It should validate the job first, then stream or redirect using a signed URL.

## Backend Flow

### 1. Create Job

Route:

- `POST /api/store-visit-monitor/export-jobs`

Behavior:

- validate incoming filters
- persist a `queued` job row
- trigger the internal runner asynchronously
- return the created job summary

### 2. Poll Job

Route:

- `GET /api/store-visit-monitor/export-jobs/[jobId]`

Behavior:

- load the job
- return status, row counts, error, and whether download is ready
- include a download URL only when status is `completed`

### 3. Run Job

Route:

- `POST /api/internal/store-visit-monitor/export-jobs/run`

Behavior:

- accept `job_id`
- claim the queued job
- mark `running`
- count the full filtered result set once
- read filtered visits in batches
- update `exported_rows` after each batch
- fetch visit quality metrics for the accumulated visit ids in batches
- build the same workbook columns as the current export
- upload the final file to storage
- mark `completed`
- persist `file_path`, `file_size_bytes`, and `completed_at`
- on any error, mark `failed` and persist `error_message`

### 4. Download File

Route:

- `GET /api/store-visit-monitor/export-jobs/[jobId]/download`

Behavior:

- require job status `completed`
- require `file_path`
- return the file using a signed URL or stream response

## Data Access Changes

The existing export helper `getStoreVisitMonitorExport()` should remain responsible for “all rows under the current filters”, not page-limited rows. For the job runner, add a batch-oriented helper that:

- accepts Store Visit Monitor filters
- accepts `offset` and `limit`
- returns visits ordered consistently
- does not depend on page/page-size UI concepts

This helper should reuse the existing filter semantics already used by the list and export code.

## Frontend Interaction

Replace the current `Link`-based export action with a client component in the Store Visit Monitor list card.

User states:

- idle: `Export Excel`
- queued: `Preparing export...`
- running: progress bar + `exported / total`
- completed: `Download file`
- failed: error text + `Retry export`

Interaction rules:

- clicking export creates a new job using the current filters only
- the UI starts polling immediately after job creation
- the polling interval can be short while queued/running and stop when completed/failed
- the user should never lose context by being navigated away from the page

## Progress Semantics

Progress should be based on row counts:

- if `total_rows` is known and greater than zero, show percentage
- otherwise show status text until count is available

Recommended display:

- `Preparing export...`
- `Exporting 350 / 2400`
- `Export complete`
- `Export failed: <message>`

## Error Handling

Backend:

- failed jobs must retain `error_message`
- partial files should not be exposed as completed downloads
- repeated runner calls for a completed job should no-op

Frontend:

- creation failure should surface inline near the export button
- failed jobs should stay visible with a retry action
- completed jobs should survive page refresh while still relevant

## Security and Access

- only authenticated backend users who can access Store Visit Monitor should be able to create jobs
- job read/download routes should validate the same operator context or admin rules used elsewhere in the app
- storage objects should remain private

## Testing

Required coverage:

- job creation strips pagination params from stored filters
- runner exports all filtered rows, not only current page rows
- runner updates progress during batched export
- completed jobs expose download readiness
- failed jobs surface error state cleanly
- list page renders export progress UI states

## Risks and Tradeoffs

Main tradeoff:

- this adds one purpose-built background export path instead of a shared export framework

Reason:

- the user needs a reliable fix now for Store Visit Monitor
- a shared export system would increase scope and slow delivery without solving an immediate second use case

Accepted limitation:

- only the latest or current export state needs to be visible on the page for now
- there is no separate historical export management view in this iteration

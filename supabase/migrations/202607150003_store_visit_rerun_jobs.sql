create table if not exists public.store_visit_rerun_jobs (
  id uuid primary key default gen_random_uuid(),
  mode text not null check (mode in ('match_only','ai_reanalysis')),
  status text not null default 'queued' check (status in ('queued','running','completed','failed')),
  selector jsonb not null,
  locale text not null default 'zh',
  requested_by uuid null,
  total_visits integer not null default 0,
  processed_visits integer not null default 0,
  skipped_visits integer not null default 0,
  failed_visits integer not null default 0,
  inserted_candidate_count integer not null default 0,
  deleted_snapshot_count integer not null default 0,
  method_counts jsonb not null default '{}'::jsonb,
  child_ai_jobs jsonb not null default '[]'::jsonb,
  failures jsonb not null default '[]'::jsonb,
  error_message text null,
  started_at timestamptz null,
  completed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_store_visit_rerun_jobs_requested_created
  on public.store_visit_rerun_jobs (requested_by, created_at desc);

create index if not exists idx_store_visit_rerun_jobs_status_created
  on public.store_visit_rerun_jobs (status, created_at);

alter table public.store_visit_rerun_jobs enable row level security;

drop policy if exists "store_visit_rerun_jobs_select_own" on public.store_visit_rerun_jobs;
create policy "store_visit_rerun_jobs_select_own"
  on public.store_visit_rerun_jobs
  for select
  using (auth.uid() = requested_by);

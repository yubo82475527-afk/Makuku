alter table public.store_visit_rerun_jobs
  add column if not exists progress jsonb not null default '{}'::jsonb;

create table if not exists public.operator_price_review_export_jobs (
  id uuid primary key default gen_random_uuid(),
  status text not null check (status in ('queued', 'running', 'completed', 'failed')),
  filters jsonb not null default '{}'::jsonb,
  locale text not null default 'zh',
  requested_by uuid null,
  total_rows integer not null default 0,
  exported_rows integer not null default 0,
  file_path text null,
  file_size_bytes bigint null,
  error_message text null,
  started_at timestamptz null,
  completed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists operator_price_review_export_jobs_status_idx
  on public.operator_price_review_export_jobs (status, created_at desc);
create index if not exists operator_price_review_export_jobs_requested_by_idx
  on public.operator_price_review_export_jobs (requested_by, created_at desc);

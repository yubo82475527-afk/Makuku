alter table public.offline_stores
  add column if not exists deleted_at timestamptz;

create index if not exists idx_offline_stores_deleted_at
  on public.offline_stores(deleted_at);

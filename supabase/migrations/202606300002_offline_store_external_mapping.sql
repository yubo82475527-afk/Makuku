alter table public.offline_stores
  add column if not exists external_store_id text,
  add column if not exists external_org_id text,
  add column if not exists external_org_name text,
  add column if not exists external_md_id text,
  add column if not exists external_md_name text,
  add column if not exists external_source text,
  add column if not exists external_synced_at timestamptz;

create unique index if not exists uniq_offline_stores_external_source_store
  on public.offline_stores (external_source, external_store_id)
  where external_source is not null and external_store_id is not null;

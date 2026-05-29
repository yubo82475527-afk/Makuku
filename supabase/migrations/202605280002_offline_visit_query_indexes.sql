alter table public.offline_store_visits
  add column if not exists uploader_user_id text;

create index if not exists idx_offline_store_visits_uploader_user_id
  on public.offline_store_visits(uploader_user_id);

create index if not exists idx_offline_store_visits_visit_date
  on public.offline_store_visits(visit_date);

create index if not exists idx_offline_store_visits_city
  on public.offline_store_visits(city);

create index if not exists idx_offline_store_visits_uploader_name
  on public.offline_store_visits(uploader_name);

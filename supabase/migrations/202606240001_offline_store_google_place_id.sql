alter table if exists public.offline_stores
  add column if not exists google_place_id text;

create unique index if not exists offline_stores_google_place_id_key
  on public.offline_stores (google_place_id)
  where google_place_id is not null;

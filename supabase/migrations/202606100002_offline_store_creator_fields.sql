alter table public.offline_stores
  add column if not exists created_by text,
  add column if not exists created_by_user_id text,
  add column if not exists created_by_name text;

create index if not exists idx_offline_stores_created_by_user
  on public.offline_stores(created_by_user_id);

with first_visit_creator as (
  select distinct on (store_id)
    store_id,
    uploader_user_id,
    uploader_name
  from public.offline_store_visits
  where store_id is not null
    and (uploader_user_id is not null or uploader_name is not null)
  order by store_id, created_at asc
)
update public.offline_stores store
set
  created_by_user_id = coalesce(store.created_by_user_id, visit.uploader_user_id),
  created_by_name = coalesce(store.created_by_name, visit.uploader_name),
  created_by = coalesce(store.created_by, visit.uploader_name, visit.uploader_user_id)
from first_visit_creator visit
where visit.store_id = store.id
  and (
    store.created_by is null
    or store.created_by_user_id is null
    or store.created_by_name is null
  );

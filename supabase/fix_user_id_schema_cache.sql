-- Minimal repair for the current production error:
-- PGRST204: Could not find the 'user_id' column of 'offline_store_visits' in the schema cache.

alter table public.offline_store_visits
  add column if not exists user_id text;

update public.offline_store_visits
set user_id = uploader_user_id
where user_id is null
  and uploader_user_id is not null;

create index if not exists idx_offline_store_visits_user_created
  on public.offline_store_visits(user_id, created_at desc);

-- Force Supabase PostgREST to reload the table metadata.
select pg_notify('pgrst', 'reload schema');

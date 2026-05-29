-- One-time production repair for mobile Store Visits.
-- Safe to run multiple times in Supabase SQL Editor.

alter table public.offline_store_visits
  add column if not exists user_id text,
  add column if not exists uploader_user_id text,
  add column if not exists region text,
  add column if not exists channel text,
  add column if not exists promoter text,
  add column if not exists image_urls jsonb not null default '[]'::jsonb,
  add column if not exists ai_result jsonb,
  add column if not exists analysis_status text not null default 'pending',
  add column if not exists analysis_error text;

update public.offline_store_visits
set user_id = uploader_user_id
where user_id is null
  and uploader_user_id is not null;

update public.offline_store_visits
set uploader_user_id = user_id
where uploader_user_id is null
  and user_id is not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'offline_store_visits_analysis_status_check'
      and conrelid = 'public.offline_store_visits'::regclass
  ) then
    alter table public.offline_store_visits
      add constraint offline_store_visits_analysis_status_check
      check (analysis_status in ('pending', 'analyzing', 'completed', 'failed'));
  end if;
end;
$$;

create index if not exists idx_offline_store_visits_user_created
  on public.offline_store_visits(user_id, created_at desc);

create index if not exists idx_offline_store_visits_uploader_user_created
  on public.offline_store_visits(uploader_user_id, created_at desc);

create index if not exists idx_offline_store_visits_analysis_status
  on public.offline_store_visits(analysis_status);

insert into storage.buckets (id, name, public)
values ('store-visits', 'store-visits', false)
on conflict (id) do nothing;

notify pgrst, 'reload schema';

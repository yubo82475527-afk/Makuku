alter table public.offline_store_visits
  add column if not exists region text,
  add column if not exists channel text,
  add column if not exists promoter text,
  add column if not exists image_urls jsonb not null default '[]'::jsonb,
  add column if not exists ai_result jsonb,
  add column if not exists analysis_status text not null default 'pending'
    check (analysis_status in ('pending', 'analyzing', 'completed', 'failed')),
  add column if not exists analysis_error text;

create index if not exists idx_offline_store_visits_analysis_status
  on public.offline_store_visits(analysis_status);

insert into storage.buckets (id, name, public)
values ('store-visits', 'store-visits', false)
on conflict (id) do nothing;

drop policy if exists "service read store visits" on storage.objects;
drop policy if exists "service upload store visits" on storage.objects;

create policy "service read store visits"
on storage.objects for select to authenticated
using (bucket_id = 'store-visits');

create policy "service upload store visits"
on storage.objects for insert to authenticated
with check (bucket_id = 'store-visits');

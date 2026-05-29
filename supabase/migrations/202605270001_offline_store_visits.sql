create table if not exists public.offline_store_visits (
  id uuid primary key default gen_random_uuid(),
  store_name text not null,
  city text not null,
  channel_type text not null,
  uploader_name text not null,
  visit_date date not null default current_date,
  visit_status text not null default 'draft' check (visit_status in ('draft','uploaded','analyzing','analyzed','reviewed','failed')),
  summary_result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.offline_visit_images (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid not null references public.offline_store_visits(id) on delete cascade,
  image_type text not null check (image_type in ('own_shelf','competitor_shelf','promo_tag','other')),
  image_path text not null,
  image_url text,
  file_name text not null,
  content_type text not null,
  file_size integer not null default 0 check (file_size >= 0),
  analysis_status text not null default 'pending' check (analysis_status in ('pending','analyzing','analyzed','failed','reviewed')),
  vision_result jsonb not null default '{}'::jsonb,
  error_message text,
  uploaded_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_offline_store_visits_created on public.offline_store_visits(created_at desc);
create index if not exists idx_offline_store_visits_status on public.offline_store_visits(visit_status);
create index if not exists idx_offline_visit_images_visit on public.offline_visit_images(visit_id, created_at);
create index if not exists idx_offline_visit_images_status on public.offline_visit_images(analysis_status);

alter table public.offline_store_visits enable row level security;
alter table public.offline_visit_images enable row level security;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'offline_store_visits',
    'offline_visit_images'
  ]
  loop
    execute format('drop policy if exists "authenticated read %1$s" on public.%1$I', table_name);
    execute format('drop policy if exists "authenticated insert %1$s" on public.%1$I', table_name);
    execute format('drop policy if exists "authenticated update %1$s" on public.%1$I', table_name);

    execute format('create policy "authenticated read %1$s" on public.%1$I for select to authenticated using (true)', table_name);
    execute format('create policy "authenticated insert %1$s" on public.%1$I for insert to authenticated with check (true)', table_name);
    execute format('create policy "authenticated update %1$s" on public.%1$I for update to authenticated using (true) with check (true)', table_name);
  end loop;
end;
$$;

insert into storage.buckets (id, name, public)
values ('offline-visit-images', 'offline-visit-images', false)
on conflict (id) do nothing;

drop policy if exists "authenticated read offline visit images" on storage.objects;
drop policy if exists "authenticated upload offline visit images" on storage.objects;
drop policy if exists "authenticated update offline visit images" on storage.objects;

create policy "authenticated read offline visit images"
on storage.objects for select to authenticated
using (bucket_id = 'offline-visit-images');

create policy "authenticated upload offline visit images"
on storage.objects for insert to authenticated
with check (bucket_id = 'offline-visit-images');

create policy "authenticated update offline visit images"
on storage.objects for update to authenticated
using (bucket_id = 'offline-visit-images')
with check (bucket_id = 'offline-visit-images');

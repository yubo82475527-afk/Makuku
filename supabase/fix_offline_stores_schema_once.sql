create table if not exists public.offline_stores (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  city text not null,
  channel_type text not null check (channel_type in ('modern_trade','baby_store','pharmacy','general_trade','other')),
  address text,
  created_at timestamptz default now()
);

create index if not exists idx_offline_stores_name on public.offline_stores(name);
create index if not exists idx_offline_stores_city on public.offline_stores(city);

create table if not exists public.app_users (
  id uuid primary key default gen_random_uuid(),
  username text unique not null,
  password_hash text not null,
  display_name text not null,
  role text default 'field_agent',
  created_at timestamptz default now()
);

alter table public.offline_store_visits
  add column if not exists store_id uuid references public.offline_stores(id);

alter table public.offline_stores enable row level security;

do $$
begin
  execute 'drop policy if exists "authenticated read offline_stores" on public.offline_stores';
  execute 'drop policy if exists "authenticated insert offline_stores" on public.offline_stores';
  execute 'drop policy if exists "authenticated update offline_stores" on public.offline_stores';

  execute 'create policy "authenticated read offline_stores" on public.offline_stores for select to authenticated using (true)';
  execute 'create policy "authenticated insert offline_stores" on public.offline_stores for insert to authenticated with check (true)';
  execute 'create policy "authenticated update offline_stores" on public.offline_stores for update to authenticated using (true) with check (true)';
end $$;

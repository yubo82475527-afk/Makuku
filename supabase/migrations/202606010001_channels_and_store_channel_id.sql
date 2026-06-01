create table if not exists public.channels (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  type text not null check (type in ('online', 'offline')),
  sort_order integer not null default 100,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.channels (code, name, type, sort_order, active) values
  ('shopee', 'Shopee', 'online', 10, true),
  ('tiktok', 'TikTok', 'online', 20, true),
  ('modern_trade', 'Modern Trade', 'offline', 30, true),
  ('baby_store', 'Baby Store', 'offline', 40, true),
  ('pharmacy', 'Pharmacy', 'offline', 50, true),
  ('general_trade', 'General Trade', 'offline', 60, true),
  ('other', 'Other', 'offline', 90, true)
on conflict (code) do update set
  name = excluded.name,
  type = excluded.type,
  sort_order = excluded.sort_order,
  active = excluded.active;

alter table public.offline_stores
  add column if not exists channel_id uuid references public.channels(id);

alter table public.offline_store_visits
  add column if not exists channel_id uuid references public.channels(id);

update public.offline_stores s
set channel_id = c.id
from public.channels c
where s.channel_id is null
  and c.code = s.channel_type;

update public.offline_store_visits v
set channel_id = c.id
from public.channels c
where v.channel_id is null
  and c.code = v.channel_type;

create index if not exists idx_channels_type_active
  on public.channels(type, active, sort_order);

create index if not exists idx_offline_stores_channel_id
  on public.offline_stores(channel_id);

create index if not exists idx_offline_store_visits_channel_id
  on public.offline_store_visits(channel_id);

alter table public.channels enable row level security;

do $$
begin
  execute 'drop policy if exists "authenticated read channels" on public.channels';
  execute 'drop policy if exists "authenticated insert channels" on public.channels';
  execute 'drop policy if exists "authenticated update channels" on public.channels';

  execute 'create policy "authenticated read channels" on public.channels for select to authenticated using (true)';
  execute 'create policy "authenticated insert channels" on public.channels for insert to authenticated with check (true)';
  execute 'create policy "authenticated update channels" on public.channels for update to authenticated using (true) with check (true)';
end $$;

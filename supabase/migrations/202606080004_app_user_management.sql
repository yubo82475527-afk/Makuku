create extension if not exists pgcrypto;

create table if not exists public.app_users (
  id uuid primary key default gen_random_uuid(),
  username text unique not null,
  password_hash text not null,
  display_name text not null,
  role text default 'field_agent',
  created_at timestamptz default now()
);

alter table public.app_users
  add column if not exists status text not null default 'enabled',
  add column if not exists disabled_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

update public.app_users
set status = 'enabled'
where status is null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'app_users_status_check'
      and conrelid = 'public.app_users'::regclass
  ) then
    alter table public.app_users
      add constraint app_users_status_check
      check (status in ('enabled', 'disabled'));
  end if;
end $$;

create unique index if not exists app_users_username_key
  on public.app_users(username);

create index if not exists idx_app_users_status
  on public.app_users(status);

alter table public.app_users enable row level security;

do $$
begin
  execute 'drop policy if exists "authenticated read app_users" on public.app_users';
  execute 'drop policy if exists "authenticated insert app_users" on public.app_users';
  execute 'drop policy if exists "authenticated update app_users" on public.app_users';

  execute 'create policy "authenticated read app_users" on public.app_users for select to authenticated using (true)';
  execute 'create policy "authenticated insert app_users" on public.app_users for insert to authenticated with check (true)';
  execute 'create policy "authenticated update app_users" on public.app_users for update to authenticated using (true) with check (true)';
end $$;

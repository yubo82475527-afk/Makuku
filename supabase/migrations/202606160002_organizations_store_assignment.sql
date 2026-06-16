create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'active' check (status in ('active', 'inactive')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create unique index if not exists organizations_name_key
  on public.organizations(lower(name));

insert into public.organizations (name, status)
select seed.name, 'active'
from (
  values
    ('GREATER JAKARTA'),
    ('EAST JAVA'),
    ('CENTRAL JAVA'),
    ('WEST JAVA'),
    ('NORTH SUMATERA'),
    ('SOUTH SUMATERA'),
    ('BIG PEKANBARU'),
    ('BIG BALI')
) as seed(name)
where not exists (
  select 1
  from public.organizations existing
  where lower(existing.name) = lower(seed.name)
);

create table if not exists public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  app_user_id uuid not null references public.app_users(id) on delete cascade,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create unique index if not exists uniq_organization_members_active
  on public.organization_members(organization_id, app_user_id)
  where active;

create index if not exists idx_organization_members_user
  on public.organization_members(app_user_id)
  where active;

create table if not exists public.organization_region_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  province text not null,
  city_name text,
  district text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create unique index if not exists uniq_organization_region_rules_active_scope
  on public.organization_region_rules(
    lower(province),
    lower(coalesce(city_name, '')),
    lower(coalesce(district, ''))
  )
  where active;

create index if not exists idx_organization_region_rules_lookup
  on public.organization_region_rules(lower(province), lower(coalesce(city_name, '')), lower(coalesce(district, '')))
  where active;

alter table public.offline_stores
  add column if not exists organization_id uuid references public.organizations(id) on delete set null,
  add column if not exists organization_assignment_method text,
  add column if not exists organization_assigned_at timestamptz,
  add column if not exists organization_region_rule_id uuid references public.organization_region_rules(id) on delete set null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'offline_stores_organization_assignment_method_check'
      and conrelid = 'public.offline_stores'::regclass
  ) then
    alter table public.offline_stores
      add constraint offline_stores_organization_assignment_method_check
      check (organization_assignment_method is null or organization_assignment_method in ('auto_region_rule', 'manual'));
  end if;
end;
$$;

create index if not exists idx_offline_stores_organization
  on public.offline_stores(organization_id);

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.organization_region_rules enable row level security;

do $$
begin
  execute 'drop policy if exists "authenticated read organizations" on public.organizations';
  execute 'drop policy if exists "authenticated insert organizations" on public.organizations';
  execute 'drop policy if exists "authenticated update organizations" on public.organizations';
  execute 'drop policy if exists "authenticated read organization_members" on public.organization_members';
  execute 'drop policy if exists "authenticated insert organization_members" on public.organization_members';
  execute 'drop policy if exists "authenticated update organization_members" on public.organization_members';
  execute 'drop policy if exists "authenticated delete organization_members" on public.organization_members';
  execute 'drop policy if exists "authenticated read organization_region_rules" on public.organization_region_rules';
  execute 'drop policy if exists "authenticated insert organization_region_rules" on public.organization_region_rules';
  execute 'drop policy if exists "authenticated update organization_region_rules" on public.organization_region_rules';

  execute 'create policy "authenticated read organizations" on public.organizations for select to authenticated using (true)';
  execute 'create policy "authenticated insert organizations" on public.organizations for insert to authenticated with check (true)';
  execute 'create policy "authenticated update organizations" on public.organizations for update to authenticated using (true) with check (true)';
  execute 'create policy "authenticated read organization_members" on public.organization_members for select to authenticated using (true)';
  execute 'create policy "authenticated insert organization_members" on public.organization_members for insert to authenticated with check (true)';
  execute 'create policy "authenticated update organization_members" on public.organization_members for update to authenticated using (true) with check (true)';
  execute 'create policy "authenticated delete organization_members" on public.organization_members for delete to authenticated using (true)';
  execute 'create policy "authenticated read organization_region_rules" on public.organization_region_rules for select to authenticated using (true)';
  execute 'create policy "authenticated insert organization_region_rules" on public.organization_region_rules for insert to authenticated with check (true)';
  execute 'create policy "authenticated update organization_region_rules" on public.organization_region_rules for update to authenticated using (true) with check (true)';
end;
$$;

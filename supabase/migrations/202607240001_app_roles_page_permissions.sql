-- Configurable roles + page permissions (Makuku 1.0)
-- System roles: admin, field_agent. Compatibility seed: manager (non-system).

create table if not exists public.app_roles (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name text not null,
  description text,
  is_system boolean not null default false,
  data_scope text not null default 'organization'
    check (data_scope in ('all', 'organization')),
  status text not null default 'active'
    check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uniq_app_roles_code unique (code)
);

create table if not exists public.app_role_page_permissions (
  id uuid primary key default gen_random_uuid(),
  role_id uuid not null references public.app_roles(id) on delete cascade,
  page_key text not null,
  created_at timestamptz not null default now(),
  constraint uniq_app_role_page_permissions unique (role_id, page_key)
);

create index if not exists idx_app_role_page_permissions_role_id
  on public.app_role_page_permissions(role_id);

create index if not exists idx_app_role_page_permissions_page_key
  on public.app_role_page_permissions(page_key);

insert into public.app_roles (code, name, description, is_system, data_scope, status)
values
  (
    'admin',
    'Admin',
    'System administrator with full page and data access',
    true,
    'all',
    'active'
  ),
  (
    'field_agent',
    'Field agent',
    'H5 capture default role; no PC page permissions',
    true,
    'organization',
    'active'
  ),
  (
    'manager',
    'Manager',
    'Compatibility PC role; not a system role',
    false,
    'organization',
    'active'
  )
on conflict (code) do update
set
  name = excluded.name,
  description = excluded.description,
  is_system = excluded.is_system,
  data_scope = excluded.data_scope,
  status = excluded.status,
  updated_at = now();

-- Seed PC pages for admin + manager (field_agent gets none; legacy pages excluded from role assignment)
with page_keys(page_key) as (
  values
    ('dashboard'),
    ('prices'),
    ('offline-price-candidates'),
    ('store-visit-monitor'),
    ('competitor-mappings'),
    ('sku-master'),
    ('competitor-products'),
    ('product-match-normalizations'),
    ('offline-stores'),
    ('organizations'),
    ('users'),
    ('roles'),
    ('report-center'),
    ('store-visit-ai-debug')
),
target_roles as (
  select id, code
  from public.app_roles
  where code in ('admin', 'manager')
)
insert into public.app_role_page_permissions (role_id, page_key)
select target_roles.id, page_keys.page_key
from target_roles
cross join page_keys
on conflict (role_id, page_key) do nothing;

alter table public.app_roles enable row level security;
alter table public.app_role_page_permissions enable row level security;

drop policy if exists "app_roles_authenticated_read" on public.app_roles;
create policy "app_roles_authenticated_read"
  on public.app_roles
  for select
  to authenticated
  using (true);

drop policy if exists "app_role_page_permissions_authenticated_read" on public.app_role_page_permissions;
create policy "app_role_page_permissions_authenticated_read"
  on public.app_role_page_permissions
  for select
  to authenticated
  using (true);

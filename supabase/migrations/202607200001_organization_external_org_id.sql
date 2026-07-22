alter table public.organizations
  add column if not exists external_org_id text;

create unique index if not exists idx_organizations_external_org_id
  on public.organizations(lower(external_org_id))
  where external_org_id is not null and btrim(external_org_id) <> '';

do $$
begin
  alter table public.offline_stores
    drop constraint if exists offline_stores_organization_assignment_method_check;

  alter table public.offline_stores
    add constraint offline_stores_organization_assignment_method_check
    check (
      organization_assignment_method is null
      or organization_assignment_method in ('auto_region_rule', 'manual', 'ai_suggested', 'external_org_id')
    );
end;
$$;

update public.offline_stores store
set
  organization_id = org.id,
  organization_assignment_method = 'external_org_id',
  organization_assigned_at = now(),
  organization_region_rule_id = null
from public.organizations org
where store.external_org_id is not null
  and btrim(store.external_org_id) <> ''
  and org.external_org_id is not null
  and btrim(org.external_org_id) <> ''
  and lower(store.external_org_id) = lower(org.external_org_id)
  and store.organization_id is distinct from org.id;

alter table public.offline_stores
  add column if not exists organization_assignment_confidence numeric,
  add column if not exists organization_assignment_reason text;

do $$
begin
  alter table public.offline_stores
    drop constraint if exists offline_stores_organization_assignment_method_check;

  alter table public.offline_stores
    add constraint offline_stores_organization_assignment_method_check
    check (
      organization_assignment_method is null
      or organization_assignment_method in ('auto_region_rule', 'manual', 'ai_suggested')
    );
end;
$$;

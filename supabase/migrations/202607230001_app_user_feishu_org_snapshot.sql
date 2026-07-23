alter table public.app_users
  add column if not exists feishu_org_ids text[] not null default '{}'::text[];

alter table public.app_users
  add column if not exists feishu_org_names text[] not null default '{}'::text[];

alter table public.app_users
  add column if not exists organization_assignment_method text null;

alter table public.app_users
  drop constraint if exists app_users_organization_assignment_method_check;

alter table public.app_users
  add constraint app_users_organization_assignment_method_check
  check (
    organization_assignment_method is null
    or organization_assignment_method in ('feishu_auto', 'manual')
  );

comment on column public.app_users.feishu_org_ids is 'Feishu open_department_id snapshot, same order as feishu_org_names';
comment on column public.app_users.feishu_org_names is 'Feishu department name snapshot, same order as feishu_org_ids';
comment on column public.app_users.organization_assignment_method is 'How system org membership was last assigned: feishu_auto | manual';

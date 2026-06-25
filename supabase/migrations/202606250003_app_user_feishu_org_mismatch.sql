alter table public.app_users
  add column if not exists feishu_org_mismatch boolean not null default false;

update public.app_users
set feishu_org_mismatch = false
where feishu_org_mismatch is null;

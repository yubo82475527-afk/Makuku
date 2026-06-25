alter table public.app_users
  alter column email drop not null;

alter table public.app_users
  add column if not exists password_login_enabled boolean not null default true;

update public.app_users
set password_login_enabled = true
where password_login_enabled is null;

drop index if exists idx_app_users_feishu_user_id;

create unique index if not exists uniq_app_users_feishu_user_id
  on public.app_users(feishu_user_id)
  where feishu_user_id is not null;

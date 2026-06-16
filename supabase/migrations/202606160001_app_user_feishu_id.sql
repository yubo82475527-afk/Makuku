alter table public.app_users
  add column if not exists email text,
  add column if not exists feishu_user_id text;

create index if not exists idx_app_users_email
  on public.app_users(email)
  where email is not null;

create index if not exists idx_app_users_feishu_user_id
  on public.app_users(feishu_user_id)
  where feishu_user_id is not null;

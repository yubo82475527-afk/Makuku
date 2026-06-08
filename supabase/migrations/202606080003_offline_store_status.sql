alter table public.offline_stores
  add column if not exists status text;

alter table public.offline_stores
  add column if not exists disabled_at timestamptz;

update public.offline_stores
set
  status = case
    when deleted_at is not null then 'disabled'
    when status in ('enabled', 'disabled') then status
    else 'enabled'
  end,
  disabled_at = case
    when deleted_at is not null then coalesce(disabled_at, deleted_at)
    else disabled_at
  end
where status is null
   or status not in ('enabled', 'disabled')
   or deleted_at is not null;

alter table public.offline_stores
  alter column status set default 'enabled';

alter table public.offline_stores
  alter column status set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'offline_stores_status_check'
      and conrelid = 'public.offline_stores'::regclass
  ) then
    alter table public.offline_stores
      add constraint offline_stores_status_check
      check (status in ('enabled', 'disabled'));
  end if;
end $$;

create index if not exists idx_offline_stores_status
  on public.offline_stores(status);

create index if not exists idx_offline_stores_disabled_at
  on public.offline_stores(disabled_at);

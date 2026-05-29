create extension if not exists pgcrypto;

create table if not exists public.store_visit_ai_configs (
  id uuid primary key default gen_random_uuid(),
  version_name text not null,
  system_prompt text not null,
  temperature numeric not null default 0,
  max_tokens integer not null default 2200,
  status text not null default 'archived',
  last_test_visit_id uuid,
  last_test_result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  activated_at timestamptz
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'store_visit_ai_configs_status_check'
      and conrelid = 'public.store_visit_ai_configs'::regclass
  ) then
    alter table public.store_visit_ai_configs
      add constraint store_visit_ai_configs_status_check
      check (status in ('active','archived'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'store_visit_ai_configs_temperature_check'
      and conrelid = 'public.store_visit_ai_configs'::regclass
  ) then
    alter table public.store_visit_ai_configs
      add constraint store_visit_ai_configs_temperature_check
      check (temperature >= 0 and temperature <= 2);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'store_visit_ai_configs_max_tokens_check'
      and conrelid = 'public.store_visit_ai_configs'::regclass
  ) then
    alter table public.store_visit_ai_configs
      add constraint store_visit_ai_configs_max_tokens_check
      check (max_tokens between 500 and 6000);
  end if;
end;
$$;

create unique index if not exists idx_store_visit_ai_configs_one_active
  on public.store_visit_ai_configs((status))
  where status = 'active';

create index if not exists idx_store_visit_ai_configs_created
  on public.store_visit_ai_configs(created_at desc);

alter table public.store_visit_ai_configs enable row level security;

do $$
begin
  execute 'drop policy if exists "authenticated read store_visit_ai_configs" on public.store_visit_ai_configs';
  execute 'drop policy if exists "authenticated insert store_visit_ai_configs" on public.store_visit_ai_configs';
  execute 'drop policy if exists "authenticated update store_visit_ai_configs" on public.store_visit_ai_configs';

  execute 'create policy "authenticated read store_visit_ai_configs" on public.store_visit_ai_configs for select to authenticated using (true)';
  execute 'create policy "authenticated insert store_visit_ai_configs" on public.store_visit_ai_configs for insert to authenticated with check (true)';
  execute 'create policy "authenticated update store_visit_ai_configs" on public.store_visit_ai_configs for update to authenticated using (true) with check (true)';
end;
$$;

notify pgrst, 'reload schema';

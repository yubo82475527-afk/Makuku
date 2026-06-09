alter table public.ai_price_candidates
  add column if not exists rejection_reason text,
  add column if not exists review_job_id uuid,
  add column if not exists review_method text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'ai_price_candidates_review_method_check'
      and conrelid = 'public.ai_price_candidates'::regclass
  )
  then
    alter table public.ai_price_candidates
      add constraint ai_price_candidates_review_method_check
      check (review_method is null or review_method in ('auto_rule','manual','bulk_manual'));
  end if;
end;
$$;

create table if not exists public.ai_price_review_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Default bulk review rule',
  min_ai_confidence numeric not null default 0.95,
  min_match_score numeric not null default 0.9,
  require_matched_entity boolean not null default true,
  require_no_warnings boolean not null default true,
  require_price_and_piece boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create unique index if not exists idx_ai_price_review_rules_one_active
  on public.ai_price_review_rules(active)
  where active = true;

insert into public.ai_price_review_rules (
  name,
  min_ai_confidence,
  min_match_score,
  require_matched_entity,
  require_no_warnings,
  require_price_and_piece,
  active
)
select
  'Default bulk review rule',
  0.95,
  0.9,
  true,
  true,
  true,
  true
where not exists (
  select 1 from public.ai_price_review_rules where active = true
);

create table if not exists public.ai_price_review_jobs (
  id uuid primary key default gen_random_uuid(),
  action text not null default 'approve' check (action in ('approve','reject')),
  status text not null default 'queued' check (status in ('queued','running','completed','failed')),
  rule_snapshot jsonb not null default '{}'::jsonb,
  filter_snapshot jsonb not null default '{}'::jsonb,
  rejection_reason text,
  total_count integer not null default 0,
  success_count integer not null default 0,
  skipped_count integer not null default 0,
  failed_count integer not null default 0,
  created_by text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create table if not exists public.ai_price_review_job_items (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.ai_price_review_jobs(id) on delete cascade,
  candidate_id uuid not null references public.ai_price_candidates(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued','processing','succeeded','skipped','failed')),
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  unique(job_id, candidate_id)
);

do $$
begin
  if to_regclass('public.ai_price_review_jobs') is not null
    and not exists (
      select 1 from pg_constraint
      where conname = 'ai_price_candidates_review_job_id_fkey'
        and conrelid = 'public.ai_price_candidates'::regclass
    )
  then
    alter table public.ai_price_candidates
      add constraint ai_price_candidates_review_job_id_fkey
      foreign key (review_job_id) references public.ai_price_review_jobs(id) on delete set null;
  end if;
end;
$$;

create index if not exists idx_ai_price_review_jobs_status
  on public.ai_price_review_jobs(status, created_at desc);

create index if not exists idx_ai_price_review_job_items_job_status
  on public.ai_price_review_job_items(job_id, status, created_at);

create index if not exists idx_ai_price_candidates_review_job
  on public.ai_price_candidates(review_job_id);

alter table public.ai_price_review_rules enable row level security;
alter table public.ai_price_review_jobs enable row level security;
alter table public.ai_price_review_job_items enable row level security;

do $$
begin
  execute 'drop policy if exists "authenticated read ai_price_review_rules" on public.ai_price_review_rules';
  execute 'drop policy if exists "authenticated write ai_price_review_rules" on public.ai_price_review_rules';
  execute 'drop policy if exists "authenticated read ai_price_review_jobs" on public.ai_price_review_jobs';
  execute 'drop policy if exists "authenticated write ai_price_review_jobs" on public.ai_price_review_jobs';
  execute 'drop policy if exists "authenticated read ai_price_review_job_items" on public.ai_price_review_job_items';
  execute 'drop policy if exists "authenticated write ai_price_review_job_items" on public.ai_price_review_job_items';

  execute 'create policy "authenticated read ai_price_review_rules" on public.ai_price_review_rules for select to authenticated using (true)';
  execute 'create policy "authenticated write ai_price_review_rules" on public.ai_price_review_rules for all to authenticated using (true) with check (true)';
  execute 'create policy "authenticated read ai_price_review_jobs" on public.ai_price_review_jobs for select to authenticated using (true)';
  execute 'create policy "authenticated write ai_price_review_jobs" on public.ai_price_review_jobs for all to authenticated using (true) with check (true)';
  execute 'create policy "authenticated read ai_price_review_job_items" on public.ai_price_review_job_items for select to authenticated using (true)';
  execute 'create policy "authenticated write ai_price_review_job_items" on public.ai_price_review_job_items for all to authenticated using (true) with check (true)';
end;
$$;

notify pgrst, 'reload schema';

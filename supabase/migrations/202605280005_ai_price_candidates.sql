create extension if not exists pgcrypto;

create table if not exists public.ai_price_candidates (
  id uuid primary key default gen_random_uuid()
);

alter table public.ai_price_candidates
  add column if not exists visit_id uuid,
  add column if not exists raw_brand text not null default '',
  add column if not exists raw_product text not null default '',
  add column if not exists raw_price text not null default '',
  add column if not exists parsed_price_idr numeric,
  add column if not exists candidate_type text not null default 'SKU',
  add column if not exists ai_confidence numeric not null default 0,
  add column if not exists matched_entity_type text not null default 'unmatched',
  add column if not exists matched_entity_id text,
  add column if not exists matched_label text,
  add column if not exists match_score numeric not null default 0,
  add column if not exists warnings jsonb not null default '[]'::jsonb,
  add column if not exists status text not null default 'pending',
  add column if not exists price_snapshot_id uuid,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'ai_price_candidates_candidate_type_check'
      and conrelid = 'public.ai_price_candidates'::regclass
  ) then
    alter table public.ai_price_candidates
      add constraint ai_price_candidates_candidate_type_check
      check (candidate_type in ('SKU','PROMO','SHELF_SIGNAL'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'ai_price_candidates_ai_confidence_check'
      and conrelid = 'public.ai_price_candidates'::regclass
  ) then
    alter table public.ai_price_candidates
      add constraint ai_price_candidates_ai_confidence_check
      check (ai_confidence >= 0 and ai_confidence <= 1);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'ai_price_candidates_matched_entity_type_check'
      and conrelid = 'public.ai_price_candidates'::regclass
  ) then
    alter table public.ai_price_candidates
      add constraint ai_price_candidates_matched_entity_type_check
      check (matched_entity_type in ('material_master','competitor_product','unmatched'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'ai_price_candidates_match_score_check'
      and conrelid = 'public.ai_price_candidates'::regclass
  ) then
    alter table public.ai_price_candidates
      add constraint ai_price_candidates_match_score_check
      check (match_score >= 0 and match_score <= 1);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'ai_price_candidates_status_check'
      and conrelid = 'public.ai_price_candidates'::regclass
  ) then
    alter table public.ai_price_candidates
      add constraint ai_price_candidates_status_check
      check (status in ('pending','approved','rejected'));
  end if;

  if to_regclass('public.offline_store_visits') is not null
    and not exists (
      select 1 from pg_constraint
      where conname = 'ai_price_candidates_visit_id_fkey'
        and conrelid = 'public.ai_price_candidates'::regclass
    )
  then
    alter table public.ai_price_candidates
      add constraint ai_price_candidates_visit_id_fkey
      foreign key (visit_id) references public.offline_store_visits(id) on delete cascade;
  end if;

  if to_regclass('public.price_snapshots') is not null
    and not exists (
      select 1 from pg_constraint
      where conname = 'ai_price_candidates_price_snapshot_id_fkey'
        and conrelid = 'public.ai_price_candidates'::regclass
    )
  then
    alter table public.ai_price_candidates
      add constraint ai_price_candidates_price_snapshot_id_fkey
      foreign key (price_snapshot_id) references public.price_snapshots(id) on delete set null;
  end if;
end;
$$;

create index if not exists idx_ai_price_candidates_visit
  on public.ai_price_candidates(visit_id, created_at desc);

create index if not exists idx_ai_price_candidates_status
  on public.ai_price_candidates(status, created_at desc);

alter table public.ai_price_candidates enable row level security;

do $$
begin
  execute 'drop policy if exists "authenticated read ai_price_candidates" on public.ai_price_candidates';
  execute 'drop policy if exists "authenticated insert ai_price_candidates" on public.ai_price_candidates';
  execute 'drop policy if exists "authenticated update ai_price_candidates" on public.ai_price_candidates';

  execute 'create policy "authenticated read ai_price_candidates" on public.ai_price_candidates for select to authenticated using (true)';
  execute 'create policy "authenticated insert ai_price_candidates" on public.ai_price_candidates for insert to authenticated with check (true)';
  execute 'create policy "authenticated update ai_price_candidates" on public.ai_price_candidates for update to authenticated using (true) with check (true)';
end;
$$;

notify pgrst, 'reload schema';

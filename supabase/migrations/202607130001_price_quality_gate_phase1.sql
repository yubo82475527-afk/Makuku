create table if not exists public.price_quality_benchmark_daily (
  id uuid primary key default gen_random_uuid(),
  benchmark_date date not null,
  matched_entity_type text not null
    check (matched_entity_type in ('material_master', 'competitor_product')),
  matched_entity_id text not null,
  channel text not null
    check (channel in ('offline', 'shopee', 'tiktok', 'manual')),
  window_start_date date not null,
  window_end_date date not null,
  median_price_per_piece numeric(14, 4) not null
    check (median_price_per_piece > 0),
  sample_count integer not null check (sample_count >= 0),
  store_count integer not null check (store_count >= 0),
  benchmark_status text not null
    check (benchmark_status in ('READY', 'INSUFFICIENT')),
  calculation_version text not null,
  generated_at timestamptz not null default now(),
  check (window_end_date >= window_start_date),
  unique (benchmark_date, matched_entity_type, matched_entity_id, channel)
);

create index if not exists idx_price_quality_benchmark_daily_lookup
  on public.price_quality_benchmark_daily(
    benchmark_date,
    matched_entity_type,
    matched_entity_id,
    channel
  );

alter table public.price_quality_benchmark_daily enable row level security;

alter table public.ai_price_candidates
  add column if not exists evidence_review_decision text,
  add column if not exists quality_gate_status text not null default 'PENDING',
  add column if not exists quality_gate_reason_codes jsonb not null default '[]'::jsonb,
  add column if not exists quality_gate_version text,
  add column if not exists benchmark_date date,
  add column if not exists benchmark_price_per_piece numeric,
  add column if not exists benchmark_deviation_pct numeric,
  add column if not exists benchmark_sample_count integer,
  add column if not exists benchmark_store_count integer,
  add column if not exists quality_gate_evaluated_at timestamptz,
  add column if not exists quality_gate_error text,
  add column if not exists quality_gate_attempt_count integer not null default 0,
  add column if not exists quality_gate_worker_id text,
  add column if not exists quality_gate_claimed_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'ai_price_candidates_evidence_review_decision_check'
      and conrelid = 'public.ai_price_candidates'::regclass
  ) then
    alter table public.ai_price_candidates
      add constraint ai_price_candidates_evidence_review_decision_check
      check (
        evidence_review_decision is null
        or evidence_review_decision in ('AUTO_APPROVE', 'NEED_REVIEW')
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'ai_price_candidates_quality_gate_status_check'
      and conrelid = 'public.ai_price_candidates'::regclass
  ) then
    alter table public.ai_price_candidates
      add constraint ai_price_candidates_quality_gate_status_check
      check (
        quality_gate_status in (
          'PENDING',
          'PROCESSING',
          'PASSED',
          'REVIEW_REQUIRED',
          'INSUFFICIENT_BENCHMARK',
          'FAILED',
          'NOT_REQUIRED'
        )
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'ai_price_candidates_quality_gate_reason_codes_check'
      and conrelid = 'public.ai_price_candidates'::regclass
  ) then
    alter table public.ai_price_candidates
      add constraint ai_price_candidates_quality_gate_reason_codes_check
      check (jsonb_typeof(quality_gate_reason_codes) = 'array');
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'ai_price_candidates_benchmark_price_check'
      and conrelid = 'public.ai_price_candidates'::regclass
  ) then
    alter table public.ai_price_candidates
      add constraint ai_price_candidates_benchmark_price_check
      check (benchmark_price_per_piece is null or benchmark_price_per_piece > 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'ai_price_candidates_benchmark_sample_count_check'
      and conrelid = 'public.ai_price_candidates'::regclass
  ) then
    alter table public.ai_price_candidates
      add constraint ai_price_candidates_benchmark_sample_count_check
      check (benchmark_sample_count is null or benchmark_sample_count >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'ai_price_candidates_benchmark_store_count_check'
      and conrelid = 'public.ai_price_candidates'::regclass
  ) then
    alter table public.ai_price_candidates
      add constraint ai_price_candidates_benchmark_store_count_check
      check (benchmark_store_count is null or benchmark_store_count >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'ai_price_candidates_quality_gate_attempt_count_check'
      and conrelid = 'public.ai_price_candidates'::regclass
  ) then
    alter table public.ai_price_candidates
      add constraint ai_price_candidates_quality_gate_attempt_count_check
      check (quality_gate_attempt_count >= 0);
  end if;
end;
$$;

create index if not exists idx_ai_price_candidates_quality_gate_queue
  on public.ai_price_candidates(quality_gate_status, quality_gate_claimed_at, created_at)
  where status = 'pending'
    and candidate_type = 'SKU'
    and coalesce(h5_lifecycle_status, '') not in ('deleted', 'replaced', 'reanalyzed');

create or replace function public.reset_ai_price_candidate_quality_gate_on_input_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'pending'
    and (
      new.matched_entity_type is distinct from old.matched_entity_type
      or new.matched_entity_id is distinct from old.matched_entity_id
      or new.net_price_idr is distinct from old.net_price_idr
      or new.parsed_price_idr is distinct from old.parsed_price_idr
      or new.price_per_piece is distinct from old.price_per_piece
      or new.reviewed_price_per_piece is distinct from old.reviewed_price_per_piece
      or new.piece_count is distinct from old.piece_count
      or new.reviewed_piece_count is distinct from old.reviewed_piece_count
      or new.promo_type is distinct from old.promo_type
    )
  then
    new.quality_gate_status := 'PENDING';
    new.quality_gate_reason_codes := '[]'::jsonb;
    new.quality_gate_version := null;
    new.benchmark_date := null;
    new.benchmark_price_per_piece := null;
    new.benchmark_deviation_pct := null;
    new.benchmark_sample_count := null;
    new.benchmark_store_count := null;
    new.quality_gate_evaluated_at := null;
    new.quality_gate_error := null;
    new.quality_gate_attempt_count := 0;
    new.quality_gate_worker_id := null;
    new.quality_gate_claimed_at := null;
    new.review_decision := 'NEED_REVIEW';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_reset_ai_price_candidate_quality_gate
  on public.ai_price_candidates;

create trigger trg_reset_ai_price_candidate_quality_gate
before update of
  matched_entity_type,
  matched_entity_id,
  net_price_idr,
  parsed_price_idr,
  price_per_piece,
  reviewed_price_per_piece,
  piece_count,
  reviewed_piece_count,
  promo_type
on public.ai_price_candidates
for each row execute function public.reset_ai_price_candidate_quality_gate_on_input_change();

update public.ai_price_candidates
set evidence_review_decision = coalesce(evidence_review_decision, review_decision);

update public.ai_price_candidates
set
  quality_gate_status = 'NOT_REQUIRED',
  quality_gate_reason_codes = '[]'::jsonb
where status <> 'pending'
   or candidate_type <> 'SKU'
   or coalesce(h5_lifecycle_status, '') in ('deleted', 'replaced', 'reanalyzed');

update public.ai_price_candidates
set
  quality_gate_status = 'PENDING',
  review_decision = 'NEED_REVIEW',
  quality_gate_error = null,
  quality_gate_worker_id = null,
  quality_gate_claimed_at = null
where status = 'pending'
  and candidate_type = 'SKU'
  and coalesce(h5_lifecycle_status, '') not in ('deleted', 'replaced', 'reanalyzed');

notify pgrst, 'reload schema';

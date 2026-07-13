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

create index if not exists idx_price_snapshots_quality_gate_refresh
  on public.price_snapshots(
    captured_at,
    source_matched_entity_type,
    source_matched_entity_id,
    offline_store_id
  )
  include (price_per_piece, competitor_product_id, material_sku_code, channel, created_at)
  where channel = 'offline'
    and offline_store_id is not null
    and price_per_piece > 0;

create or replace function public.refresh_price_quality_benchmark_daily(
  p_benchmark_date date default null
)
returns table (
  benchmark_date date,
  inserted_count integer,
  ready_count integer,
  insufficient_count integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_benchmark_date date := coalesce(
    p_benchmark_date,
    timezone('Asia/Jakarta', now())::date
  );
  v_window_start date := v_benchmark_date - 30;
  v_window_end date := v_benchmark_date - 1;
  v_inserted_count integer := 0;
  v_ready_count integer := 0;
  v_insufficient_count integer := 0;
begin
  delete from public.price_quality_benchmark_daily benchmark
  where benchmark.benchmark_date = v_benchmark_date;

  with eligible as (
    select
      snapshot.id,
      coalesce(
        snapshot.source_matched_entity_type,
        case
          when snapshot.competitor_product_id is not null then 'competitor_product'
          when snapshot.material_sku_code is not null then 'material_master'
          else null
        end
      ) as matched_entity_type,
      coalesce(
        snapshot.source_matched_entity_id,
        snapshot.competitor_product_id::text,
        snapshot.material_sku_code
      ) as matched_entity_id,
      snapshot.channel,
      snapshot.offline_store_id,
      timezone('Asia/Jakarta', snapshot.captured_at)::date as captured_date,
      snapshot.price_per_piece,
      snapshot.captured_at,
      row_number() over (
        partition by
          coalesce(
            snapshot.source_matched_entity_type,
            case
              when snapshot.competitor_product_id is not null then 'competitor_product'
              when snapshot.material_sku_code is not null then 'material_master'
              else null
            end
          ),
          coalesce(
            snapshot.source_matched_entity_id,
            snapshot.competitor_product_id::text,
            snapshot.material_sku_code
          ),
          snapshot.channel,
          snapshot.offline_store_id,
          timezone('Asia/Jakarta', snapshot.captured_at)::date
        order by snapshot.captured_at desc, snapshot.created_at desc, snapshot.id desc
      ) as row_rank
    from public.price_snapshots snapshot
    where snapshot.channel = 'offline'
      and snapshot.offline_store_id is not null
      and snapshot.price_per_piece > 0
      and timezone('Asia/Jakarta', snapshot.captured_at)::date
        between v_window_start and v_window_end
  ),
  grouped as (
    select
      eligible.matched_entity_type,
      eligible.matched_entity_id,
      eligible.channel,
      percentile_cont(0.5) within group (
        order by eligible.price_per_piece
      )::numeric(14, 4) as median_price_per_piece,
      count(*)::integer as sample_count,
      count(distinct eligible.offline_store_id)::integer as store_count
    from eligible
    where eligible.row_rank = 1
      and eligible.matched_entity_type is not null
      and eligible.matched_entity_id is not null
    group by
      eligible.matched_entity_type,
      eligible.matched_entity_id,
      eligible.channel
  ),
  inserted as (
    insert into public.price_quality_benchmark_daily (
      benchmark_date,
      matched_entity_type,
      matched_entity_id,
      channel,
      window_start_date,
      window_end_date,
      median_price_per_piece,
      sample_count,
      store_count,
      benchmark_status,
      calculation_version
    )
    select
      v_benchmark_date,
      grouped.matched_entity_type,
      grouped.matched_entity_id,
      grouped.channel,
      v_window_start,
      v_window_end,
      grouped.median_price_per_piece,
      grouped.sample_count,
      grouped.store_count,
      case
        when grouped.sample_count >= 5 and grouped.store_count >= 3 then 'READY'
        else 'INSUFFICIENT'
      end,
      'price-quality-benchmark-v1'
    from grouped
    returning benchmark_status
  )
  select
    count(*)::integer,
    count(*) filter (where inserted.benchmark_status = 'READY')::integer,
    count(*) filter (where inserted.benchmark_status = 'INSUFFICIENT')::integer
  into v_inserted_count, v_ready_count, v_insufficient_count
  from inserted;

  return query
  select
    v_benchmark_date,
    v_inserted_count,
    v_ready_count,
    v_insufficient_count;
end;
$$;

revoke all on function public.refresh_price_quality_benchmark_daily(date)
  from public, anon, authenticated;
grant execute on function public.refresh_price_quality_benchmark_daily(date)
  to service_role;

notify pgrst, 'reload schema';

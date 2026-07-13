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

create table if not exists public.price_quality_benchmark_refresh_runs (
  benchmark_date date primary key,
  status text not null check (status in ('COMPLETED')),
  inserted_count integer not null check (inserted_count >= 0),
  ready_count integer not null check (ready_count >= 0),
  insufficient_count integer not null check (insufficient_count >= 0),
  calculation_version text not null,
  completed_at timestamptz not null default now()
);

alter table public.price_quality_benchmark_refresh_runs enable row level security;

create or replace function public.compute_ai_price_candidate_input_fingerprint(
  p_matched_entity_type text,
  p_matched_entity_id text,
  p_list_price_idr numeric,
  p_package_price_idr numeric,
  p_net_price_idr numeric,
  p_parsed_price_idr numeric,
  p_price_per_piece numeric,
  p_reviewed_price_per_piece numeric,
  p_ai_price_per_piece numeric,
  p_piece_count integer,
  p_reviewed_piece_count integer,
  p_promo_type text,
  p_ai_promo_type text
)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select md5(
    coalesce(p_matched_entity_type, '') || chr(31)
    || coalesce(p_matched_entity_id, '') || chr(31)
    || coalesce(p_list_price_idr::text, '') || chr(31)
    || coalesce(p_package_price_idr::text, '') || chr(31)
    || coalesce(p_net_price_idr::text, '') || chr(31)
    || coalesce(p_parsed_price_idr::text, '') || chr(31)
    || coalesce(p_price_per_piece::text, '') || chr(31)
    || coalesce(p_reviewed_price_per_piece::text, '') || chr(31)
    || coalesce(p_ai_price_per_piece::text, '') || chr(31)
    || coalesce(p_piece_count::text, '') || chr(31)
    || coalesce(p_reviewed_piece_count::text, '') || chr(31)
    || coalesce(p_promo_type, '') || chr(31)
    || coalesce(p_ai_promo_type, '')
  );
$$;

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
  add column if not exists quality_gate_claimed_at timestamptz,
  add column if not exists quality_gate_input_fingerprint text,
  add column if not exists auto_approval_status text not null default 'NOT_REQUIRED',
  add column if not exists auto_approval_attempt_count integer not null default 0,
  add column if not exists auto_approval_worker_id text,
  add column if not exists auto_approval_claimed_at timestamptz,
  add column if not exists auto_approval_error text,
  add column if not exists approval_input_fingerprint text generated always as (
    public.compute_ai_price_candidate_input_fingerprint(
      matched_entity_type,
      matched_entity_id,
      list_price_idr,
      package_price_idr,
      net_price_idr,
      parsed_price_idr,
      price_per_piece,
      reviewed_price_per_piece,
      ai_price_per_piece,
      piece_count,
      reviewed_piece_count,
      promo_type,
      ai_promo_type
    )
  ) stored;

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

  if not exists (
    select 1 from pg_constraint
    where conname = 'ai_price_candidates_auto_approval_status_check'
      and conrelid = 'public.ai_price_candidates'::regclass
  ) then
    alter table public.ai_price_candidates
      add constraint ai_price_candidates_auto_approval_status_check
      check (auto_approval_status in ('PENDING', 'PROCESSING', 'FAILED', 'EXHAUSTED', 'COMPLETED', 'NOT_REQUIRED'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'ai_price_candidates_auto_approval_attempt_count_check'
      and conrelid = 'public.ai_price_candidates'::regclass
  ) then
    alter table public.ai_price_candidates
      add constraint ai_price_candidates_auto_approval_attempt_count_check
      check (auto_approval_attempt_count >= 0);
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
    and new.candidate_type = 'SKU'
    and (
      new.matched_entity_type is distinct from old.matched_entity_type
      or new.matched_entity_id is distinct from old.matched_entity_id
      or new.list_price_idr is distinct from old.list_price_idr
      or new.package_price_idr is distinct from old.package_price_idr
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
    new.quality_gate_input_fingerprint := null;
    new.auto_approval_status := 'NOT_REQUIRED';
    new.auto_approval_attempt_count := 0;
    new.auto_approval_worker_id := null;
    new.auto_approval_claimed_at := null;
    new.auto_approval_error := null;
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
  list_price_idr,
  package_price_idr,
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
set evidence_review_decision = review_decision
where evidence_review_decision is null;

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
  and quality_gate_evaluated_at is null
  and quality_gate_version is null
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
  v_window_start_at timestamptz := v_window_start::timestamp at time zone 'Asia/Jakarta';
  v_window_end_exclusive_at timestamptz := v_benchmark_date::timestamp at time zone 'Asia/Jakarta';
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
      and snapshot.captured_at >= v_window_start_at
      and snapshot.captured_at < v_window_end_exclusive_at
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

  insert into public.price_quality_benchmark_refresh_runs (
    benchmark_date,
    status,
    inserted_count,
    ready_count,
    insufficient_count,
    calculation_version,
    completed_at
  ) values (
    v_benchmark_date,
    'COMPLETED',
    v_inserted_count,
    v_ready_count,
    v_insufficient_count,
    'price-quality-benchmark-v1',
    now()
  )
  on conflict (benchmark_date) do update
  set
    status = excluded.status,
    inserted_count = excluded.inserted_count,
    ready_count = excluded.ready_count,
    insufficient_count = excluded.insufficient_count,
    calculation_version = excluded.calculation_version,
    completed_at = excluded.completed_at;

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

create or replace function public.claim_ai_price_candidates_for_quality_gate(
  p_worker_id text,
  p_limit integer default 50
)
returns table (
  candidate_id uuid,
  candidate_price_per_piece numeric,
  evidence_review_decision text,
  matched_entity_type text,
  matched_entity_id text,
  promo_type text,
  benchmark_date date,
  median_price_per_piece numeric,
  benchmark_sample_count integer,
  benchmark_store_count integer,
  benchmark_status text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if nullif(trim(p_worker_id), '') is null then
    raise exception 'worker id is required';
  end if;

  update public.ai_price_candidates candidate
  set
    quality_gate_status = 'FAILED',
    quality_gate_reason_codes = '[]'::jsonb,
    quality_gate_version = null,
    quality_gate_evaluated_at = now(),
    quality_gate_error = 'Quality gate lease expired after maximum attempts.',
    quality_gate_worker_id = null,
    quality_gate_claimed_at = null,
    quality_gate_input_fingerprint = candidate.approval_input_fingerprint,
    review_decision = 'NEED_REVIEW'
  where candidate.status = 'pending'
    and candidate.candidate_type = 'SKU'
    and candidate.quality_gate_status = 'PROCESSING'
    and candidate.quality_gate_attempt_count >= 3
    and candidate.quality_gate_claimed_at < now() - interval '10 minutes';

  return query
  with claimable as (
    select candidate.id
    from public.ai_price_candidates candidate
    where candidate.status = 'pending'
      and candidate.candidate_type = 'SKU'
      and coalesce(candidate.h5_lifecycle_status, '') not in ('deleted', 'replaced', 'reanalyzed')
      and candidate.quality_gate_attempt_count < 3
      and exists (
        select 1
        from public.price_quality_benchmark_refresh_runs refresh
        where refresh.benchmark_date = timezone('Asia/Jakarta', now())::date
          and refresh.status = 'COMPLETED'
      )
      and (
        candidate.quality_gate_status = 'PENDING'
        or candidate.quality_gate_status = 'FAILED'
        or (
          candidate.quality_gate_status = 'PROCESSING'
          and candidate.quality_gate_claimed_at < now() - interval '10 minutes'
        )
      )
    order by candidate.created_at, candidate.id
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 50), 100))
  ),
  claimed as (
    update public.ai_price_candidates candidate
    set
      quality_gate_status = 'PROCESSING',
      quality_gate_worker_id = p_worker_id,
      quality_gate_claimed_at = now(),
      quality_gate_attempt_count = candidate.quality_gate_attempt_count + 1,
      quality_gate_error = null,
      review_decision = 'NEED_REVIEW'
    from claimable
    where candidate.id = claimable.id
    returning candidate.*
  )
  select
    candidate.id,
    coalesce(
      candidate.reviewed_price_per_piece,
      candidate.price_per_piece,
      candidate.ai_price_per_piece
    ),
    candidate.evidence_review_decision,
    candidate.matched_entity_type,
    candidate.matched_entity_id,
    coalesce(candidate.promo_type, candidate.ai_promo_type),
    benchmark.benchmark_date,
    benchmark.median_price_per_piece,
    benchmark.sample_count,
    benchmark.store_count,
    benchmark.benchmark_status
  from claimed candidate
  left join public.price_quality_benchmark_daily benchmark
    on benchmark.benchmark_date = timezone('Asia/Jakarta', now())::date
   and benchmark.matched_entity_type = candidate.matched_entity_type
   and benchmark.matched_entity_id = candidate.matched_entity_id
   and benchmark.channel = 'offline';
end;
$$;

create or replace function public.finalize_ai_price_candidate_quality_gate(
  p_candidate_id uuid,
  p_worker_id text,
  p_quality_gate_status text,
  p_reason_codes jsonb,
  p_quality_gate_version text,
  p_benchmark_date date,
  p_benchmark_price_per_piece numeric,
  p_benchmark_deviation_pct numeric,
  p_benchmark_sample_count integer,
  p_benchmark_store_count integer,
  p_error text
)
returns table (finalize_result text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated integer := 0;
  v_current_status text;
begin
  if p_quality_gate_status not in (
    'PASSED',
    'REVIEW_REQUIRED',
    'INSUFFICIENT_BENCHMARK',
    'FAILED'
  ) then
    raise exception 'invalid quality gate status: %', p_quality_gate_status;
  end if;

  update public.ai_price_candidates candidate
  set
    quality_gate_status = p_quality_gate_status,
    quality_gate_reason_codes = coalesce(p_reason_codes, '[]'::jsonb),
    quality_gate_version = p_quality_gate_version,
    benchmark_date = p_benchmark_date,
    benchmark_price_per_piece = p_benchmark_price_per_piece,
    benchmark_deviation_pct = p_benchmark_deviation_pct,
    benchmark_sample_count = p_benchmark_sample_count,
    benchmark_store_count = p_benchmark_store_count,
    quality_gate_evaluated_at = now(),
    quality_gate_error = left(p_error, 1000),
    quality_gate_input_fingerprint = candidate.approval_input_fingerprint,
    quality_gate_worker_id = null,
    quality_gate_claimed_at = null,
    auto_approval_status = case
      when p_quality_gate_status = 'PASSED'
       and candidate.evidence_review_decision = 'AUTO_APPROVE'
        then 'PENDING'
      else 'NOT_REQUIRED'
    end,
    auto_approval_attempt_count = 0,
    auto_approval_worker_id = null,
    auto_approval_claimed_at = null,
    auto_approval_error = null,
    review_decision = case
      when p_quality_gate_status = 'PASSED'
       and candidate.evidence_review_decision = 'AUTO_APPROVE'
        then 'AUTO_APPROVE'
      else 'NEED_REVIEW'
    end
  where candidate.id = p_candidate_id
    and candidate.quality_gate_status = 'PROCESSING'
    and candidate.quality_gate_worker_id = p_worker_id;

  get diagnostics v_updated = row_count;
  if v_updated = 1 then
    return query select 'APPLIED'::text;
    return;
  end if;

  select candidate.quality_gate_status
  into v_current_status
  from public.ai_price_candidates candidate
  where candidate.id = p_candidate_id;

  if v_current_status in (
    'PASSED',
    'REVIEW_REQUIRED',
    'INSUFFICIENT_BENCHMARK',
    'FAILED',
    'NOT_REQUIRED'
  ) then
    return query select 'ALREADY_FINALIZED'::text;
  else
    return query select 'OWNERSHIP_LOST'::text;
  end if;
end;
$$;

create or replace function public.claim_ai_price_candidates_for_auto_approval(
  p_worker_id text,
  p_limit integer default 50
)
returns table (candidate_id uuid)
language plpgsql
security definer
set search_path = public
as $$
begin
  if nullif(trim(p_worker_id), '') is null then
    raise exception 'worker id is required';
  end if;

  update public.ai_price_candidates candidate
  set
    auto_approval_status = 'EXHAUSTED',
    auto_approval_worker_id = null,
    auto_approval_claimed_at = null,
    auto_approval_error = coalesce(
      candidate.auto_approval_error,
      'Automatic approval exhausted after maximum attempts.'
    ),
    review_decision = 'NEED_REVIEW'
  where candidate.status = 'pending'
    and candidate.auto_approval_attempt_count >= 3
    and (
      candidate.auto_approval_status = 'FAILED'
      or (
        candidate.auto_approval_status = 'PROCESSING'
        and candidate.auto_approval_claimed_at < now() - interval '10 minutes'
      )
    );

  return query
  with claimable as (
    select candidate.id
    from public.ai_price_candidates candidate
    where candidate.status = 'pending'
      and candidate.quality_gate_status = 'PASSED'
      and candidate.review_decision = 'AUTO_APPROVE'
      and candidate.auto_approval_attempt_count < 3
      and (
        candidate.auto_approval_status in ('PENDING', 'FAILED')
        or (
          candidate.auto_approval_status = 'PROCESSING'
          and candidate.auto_approval_claimed_at < now() - interval '10 minutes'
        )
      )
    order by candidate.auto_approval_claimed_at nulls first, candidate.created_at, candidate.id
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 50), 100))
  ),
  claimed as (
    update public.ai_price_candidates candidate
    set
      auto_approval_status = 'PROCESSING',
      auto_approval_worker_id = p_worker_id,
      auto_approval_claimed_at = now(),
      auto_approval_attempt_count = candidate.auto_approval_attempt_count + 1,
      auto_approval_error = null
    from claimable
    where candidate.id = claimable.id
    returning candidate.id
  )
  select claimed.id from claimed;
end;
$$;

create or replace function public.finalize_ai_price_candidate_auto_approval_failure(
  p_candidate_id uuid,
  p_worker_id text,
  p_error text
)
returns table (finalize_result text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated integer := 0;
begin
  update public.ai_price_candidates candidate
  set
    auto_approval_status = case
      when candidate.auto_approval_attempt_count >= 3 then 'EXHAUSTED'
      else 'FAILED'
    end,
    auto_approval_worker_id = null,
    auto_approval_claimed_at = null,
    auto_approval_error = left(p_error, 1000),
    review_decision = case
      when candidate.auto_approval_attempt_count >= 3 then 'NEED_REVIEW'
      else candidate.review_decision
    end
  where candidate.id = p_candidate_id
    and candidate.status = 'pending'
    and candidate.auto_approval_status = 'PROCESSING'
    and candidate.auto_approval_worker_id = p_worker_id;

  get diagnostics v_updated = row_count;
  return query select case when v_updated = 1 then 'APPLIED' else 'OWNERSHIP_LOST' end::text;
end;
$$;

create or replace function public.approve_ai_price_candidate_with_quality_gate(
  p_candidate_id uuid,
  p_expected_approval_input_fingerprint text,
  p_price_idr numeric,
  p_piece_count integer,
  p_promo_type text,
  p_competitor_product_id uuid,
  p_sku_master_id uuid,
  p_material_sku_code text,
  p_reviewer text,
  p_review_job_id uuid,
  p_review_method text,
  p_auto_approval_worker_id text
)
returns table (candidate_id uuid, snapshot_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_candidate public.ai_price_candidates%rowtype;
  v_offline_store_id uuid;
  v_visit_date date;
  v_net_price numeric;
  v_list_price numeric;
  v_package_price numeric;
  v_piece_count integer;
  v_price_per_piece numeric;
  v_promo_type text;
  v_source_matched_entity_id text;
  v_snapshot_id uuid;
begin
  if p_review_method not in ('auto_rule', 'bulk_manual', 'manual') then
    raise exception 'invalid review method';
  end if;

  select candidate.*
  into v_candidate
  from public.ai_price_candidates candidate
  where candidate.id = p_candidate_id
  for update of candidate;

  if not found then
    raise exception 'Candidate not found';
  end if;
  if v_candidate.status <> 'pending' then
    raise exception 'Only pending candidates can be approved';
  end if;
  if nullif(p_expected_approval_input_fingerprint, '') is null
    or v_candidate.approval_input_fingerprint is distinct from p_expected_approval_input_fingerprint
  then
    raise exception 'Candidate inputs changed; reload before approving.';
  end if;

  if p_review_method in ('auto_rule', 'bulk_manual') then
    if v_candidate.quality_gate_status <> 'PASSED'
      or v_candidate.quality_gate_input_fingerprint is distinct from v_candidate.approval_input_fingerprint
      or v_candidate.evidence_review_decision <> 'AUTO_APPROVE'
      or v_candidate.review_decision <> 'AUTO_APPROVE'
      or v_candidate.match_score < 0.9
      or v_candidate.matched_entity_id is null
      or v_candidate.matched_entity_type = 'unmatched'
      or coalesce(jsonb_array_length(v_candidate.warnings), 0) > 0
      or coalesce(jsonb_array_length(v_candidate.conflicts), 0) > 0
    then
      raise exception 'Historical price quality gate has not passed for the current inputs.';
    end if;
    if p_review_method = 'auto_rule'
      and (
        v_candidate.auto_approval_status <> 'PROCESSING'
        or v_candidate.auto_approval_worker_id is distinct from p_auto_approval_worker_id
      )
    then
      raise exception 'Automatic approval ownership lost.';
    end if;
  elsif v_candidate.quality_gate_status in ('PENDING', 'PROCESSING') then
    raise exception 'Historical price quality check is still running.';
  elsif v_candidate.quality_gate_status = 'FAILED'
    and v_candidate.quality_gate_attempt_count < 3
  then
    raise exception 'Historical price quality check is waiting for retry.';
  end if;

  v_net_price := coalesce(v_candidate.net_price_idr, v_candidate.parsed_price_idr);
  v_piece_count := coalesce(v_candidate.reviewed_piece_count, v_candidate.piece_count);
  v_promo_type := nullif(trim(coalesce(v_candidate.promo_type, '')), '');
  if v_net_price is null or v_net_price <= 0 then
    raise exception 'Valid price is required';
  end if;
  if v_piece_count is null or v_piece_count <= 0 then
    raise exception 'Valid piece count is required';
  end if;
  if p_price_idr is distinct from v_net_price
    or p_piece_count is distinct from v_piece_count
    or nullif(trim(coalesce(p_promo_type, '')), '') is distinct from v_promo_type
  then
    raise exception 'Save the correction and wait for historical price re-evaluation before approving.';
  end if;

  if v_candidate.matched_entity_type = 'material_master' then
    if v_candidate.matched_entity_id is null
      or p_material_sku_code is distinct from v_candidate.matched_entity_id
      or p_sku_master_id is null
      or p_competitor_product_id is not null
    then
      raise exception 'Material ownership changed; reload before approving.';
    end if;
    v_source_matched_entity_id := p_material_sku_code;
  elsif v_candidate.matched_entity_type = 'competitor_product' then
    if v_candidate.matched_entity_id is null
      or p_competitor_product_id::text is distinct from v_candidate.matched_entity_id
      or p_sku_master_id is not null
      or p_material_sku_code is not null
    then
      raise exception 'Competitor product ownership changed; reload before approving.';
    end if;
    v_source_matched_entity_id := p_competitor_product_id::text;
  else
    raise exception 'Please match a product before approving this candidate';
  end if;

  if v_candidate.source_image_id is null then
    raise exception 'AI price candidate is missing source_image_id and cannot create a price snapshot';
  end if;

  select visit.store_id, visit.visit_date
  into v_offline_store_id, v_visit_date
  from public.offline_store_visits visit
  where visit.id = v_candidate.visit_id;

  v_list_price := coalesce(v_candidate.list_price_idr, v_net_price);
  v_package_price := coalesce(v_candidate.package_price_idr, v_net_price);
  v_price_per_piece := coalesce(
    nullif(v_candidate.visible_price_per_piece_idr, 0),
    nullif(v_candidate.reviewed_price_per_piece, 0),
    nullif(v_candidate.price_per_piece, 0),
    round(v_net_price / v_piece_count, 4)
  );

  select snapshot.id
  into v_snapshot_id
  from public.price_snapshots snapshot
  where snapshot.source = 'offline_ai_confirmed'
    and snapshot.source_visit_id = v_candidate.visit_id
    and snapshot.source_image_id = v_candidate.source_image_id
    and snapshot.source_matched_entity_type = v_candidate.matched_entity_type
    and snapshot.source_matched_entity_id = v_source_matched_entity_id
    and snapshot.net_price_idr = v_net_price
  limit 1;

  if v_snapshot_id is null then
    insert into public.price_snapshots (
      competitor_product_id,
      sku_master_id,
      material_sku_code,
      offline_store_id,
      channel,
      list_price_idr,
      package_price_idr,
      promo_price_idr,
      voucher_value_idr,
      shipping_subsidy_idr,
      net_price_idr,
      price_per_piece,
      promo_type,
      captured_at,
      source,
      source_visit_id,
      source_image_id,
      source_matched_entity_type,
      source_matched_entity_id,
      evidence_url
    ) values (
      p_competitor_product_id,
      p_sku_master_id,
      p_material_sku_code,
      v_offline_store_id,
      'offline',
      v_list_price,
      v_package_price,
      v_package_price,
      0,
      0,
      v_net_price,
      v_price_per_piece,
      case
        when v_promo_type is null
          or lower(v_promo_type) in ('none', 'no activity', 'no promo', 'normal')
          then 'offline_ai_confirmed'
        else v_promo_type
      end,
      case
        when v_visit_date is not null
          then v_visit_date::timestamp at time zone 'Asia/Jakarta'
        else now()
      end,
      'offline_ai_confirmed',
      v_candidate.visit_id,
      v_candidate.source_image_id,
      v_candidate.matched_entity_type,
      v_source_matched_entity_id,
      null
    )
    on conflict do nothing
    returning id into v_snapshot_id;

    if v_snapshot_id is null then
      select snapshot.id
      into v_snapshot_id
      from public.price_snapshots snapshot
      where snapshot.source = 'offline_ai_confirmed'
        and snapshot.source_visit_id = v_candidate.visit_id
        and snapshot.source_image_id = v_candidate.source_image_id
        and snapshot.source_matched_entity_type = v_candidate.matched_entity_type
        and snapshot.source_matched_entity_id = v_source_matched_entity_id
        and snapshot.net_price_idr = v_net_price
      limit 1;
    end if;
  elsif v_offline_store_id is not null then
    update public.price_snapshots snapshot
    set offline_store_id = coalesce(snapshot.offline_store_id, v_offline_store_id)
    where snapshot.id = v_snapshot_id;
  end if;

  if v_snapshot_id is null then
    raise exception 'Failed to create or resolve price snapshot';
  end if;

  update public.ai_price_candidates candidate
  set
    status = 'approved',
    parsed_price_idr = v_net_price,
    reviewed_piece_count = v_piece_count,
    reviewed_price_per_piece = v_price_per_piece,
    price_snapshot_id = v_snapshot_id,
    reviewed_at = now(),
    reviewed_by = p_reviewer,
    review_job_id = p_review_job_id,
    review_method = p_review_method,
    rejection_reason = null,
    auto_approval_status = case when p_review_method = 'auto_rule' then 'COMPLETED' else 'NOT_REQUIRED' end,
    auto_approval_worker_id = null,
    auto_approval_claimed_at = null,
    auto_approval_error = null
  where candidate.id = v_candidate.id;

  return query select v_candidate.id, v_snapshot_id;
end;
$$;

revoke all on function public.claim_ai_price_candidates_for_quality_gate(text, integer)
  from public, anon, authenticated;
revoke all on function public.finalize_ai_price_candidate_quality_gate(
  uuid,
  text,
  text,
  jsonb,
  text,
  date,
  numeric,
  numeric,
  integer,
  integer,
  text
) from public, anon, authenticated;
revoke all on function public.approve_ai_price_candidate_with_quality_gate(
  uuid,
  text,
  numeric,
  integer,
  text,
  uuid,
  uuid,
  text,
  text,
  uuid,
  text,
  text
) from public, anon, authenticated;
revoke all on function public.claim_ai_price_candidates_for_auto_approval(text, integer)
  from public, anon, authenticated;
revoke all on function public.finalize_ai_price_candidate_auto_approval_failure(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.claim_ai_price_candidates_for_quality_gate(text, integer)
  to service_role;
grant execute on function public.finalize_ai_price_candidate_quality_gate(
  uuid,
  text,
  text,
  jsonb,
  text,
  date,
  numeric,
  numeric,
  integer,
  integer,
  text
) to service_role;
grant execute on function public.approve_ai_price_candidate_with_quality_gate(
  uuid,
  text,
  numeric,
  integer,
  text,
  uuid,
  uuid,
  text,
  text,
  uuid,
  text,
  text
) to service_role;
grant execute on function public.claim_ai_price_candidates_for_auto_approval(text, integer)
  to service_role;
grant execute on function public.finalize_ai_price_candidate_auto_approval_failure(uuid, text, text)
  to service_role;

notify pgrst, 'reload schema';

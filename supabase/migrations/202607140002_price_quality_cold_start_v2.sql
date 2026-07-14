alter table public.ai_price_candidates
  add column if not exists benchmark_assessment text not null default 'NOT_EVALUATED',
  add column if not exists benchmark_assessment_reason text;

alter table public.price_quality_gate_evaluations
  add column if not exists benchmark_assessment text not null default 'NOT_EVALUATED',
  add column if not exists benchmark_assessment_reason text;

alter table public.price_snapshots
  add column if not exists benchmark_assessment_at_approval text;

update public.ai_price_candidates candidate
set
  benchmark_assessment = case
    when candidate.benchmark_price_per_piece > 0
      and candidate.benchmark_sample_count >= 5
      and candidate.benchmark_store_count >= 3
      then 'READY'
    when candidate.quality_gate_status = 'INSUFFICIENT_BENCHMARK'
      then 'BUILDING'
    else 'NOT_EVALUATED'
  end,
  benchmark_assessment_reason = case
    when candidate.quality_gate_status <> 'INSUFFICIENT_BENCHMARK' then null
    when candidate.benchmark_sample_count is null and candidate.benchmark_store_count is null then 'NO_HISTORY'
    when coalesce(candidate.benchmark_sample_count, 0) < 5
      and coalesce(candidate.benchmark_store_count, 0) < 3
      then 'LOW_SAMPLE_AND_STORE'
    when coalesce(candidate.benchmark_sample_count, 0) < 5 then 'LOW_SAMPLE'
    when coalesce(candidate.benchmark_store_count, 0) < 3 then 'LOW_STORE'
    else 'NO_HISTORY'
  end
where candidate.quality_gate_version is distinct from 'price-quality-gate-v2';

update public.price_quality_gate_evaluations evaluation
set
  benchmark_assessment = case
    when evaluation.benchmark_price_per_piece > 0
      and evaluation.benchmark_sample_count >= 5
      and evaluation.benchmark_store_count >= 3
      then 'READY'
    when evaluation.quality_gate_status = 'INSUFFICIENT_BENCHMARK'
      then 'BUILDING'
    else 'NOT_EVALUATED'
  end,
  benchmark_assessment_reason = case
    when evaluation.quality_gate_status <> 'INSUFFICIENT_BENCHMARK' then null
    when evaluation.benchmark_sample_count is null and evaluation.benchmark_store_count is null then 'NO_HISTORY'
    when coalesce(evaluation.benchmark_sample_count, 0) < 5
      and coalesce(evaluation.benchmark_store_count, 0) < 3
      then 'LOW_SAMPLE_AND_STORE'
    when coalesce(evaluation.benchmark_sample_count, 0) < 5 then 'LOW_SAMPLE'
    when coalesce(evaluation.benchmark_store_count, 0) < 3 then 'LOW_STORE'
    else 'NO_HISTORY'
  end
where evaluation.quality_gate_version is distinct from 'price-quality-gate-v2';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'ai_price_candidates_benchmark_assessment_check'
      and conrelid = 'public.ai_price_candidates'::regclass
  ) then
    alter table public.ai_price_candidates
      add constraint ai_price_candidates_benchmark_assessment_check
      check (benchmark_assessment in ('READY', 'BUILDING', 'NOT_EVALUATED'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'ai_price_candidates_benchmark_assessment_reason_check'
      and conrelid = 'public.ai_price_candidates'::regclass
  ) then
    alter table public.ai_price_candidates
      add constraint ai_price_candidates_benchmark_assessment_reason_check
      check (
        (benchmark_assessment = 'BUILDING' and benchmark_assessment_reason is not null and benchmark_assessment_reason in (
          'NO_HISTORY', 'LOW_SAMPLE', 'LOW_STORE', 'LOW_SAMPLE_AND_STORE'
        ))
        or (benchmark_assessment <> 'BUILDING' and benchmark_assessment_reason is null)
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'price_quality_gate_evaluations_benchmark_assessment_check'
      and conrelid = 'public.price_quality_gate_evaluations'::regclass
  ) then
    alter table public.price_quality_gate_evaluations
      add constraint price_quality_gate_evaluations_benchmark_assessment_check
      check (benchmark_assessment in ('READY', 'BUILDING', 'NOT_EVALUATED'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'price_quality_gate_evaluations_benchmark_assessment_reason_check'
      and conrelid = 'public.price_quality_gate_evaluations'::regclass
  ) then
    alter table public.price_quality_gate_evaluations
      add constraint price_quality_gate_evaluations_benchmark_assessment_reason_check
      check (
        (benchmark_assessment = 'BUILDING' and benchmark_assessment_reason is not null and benchmark_assessment_reason in (
          'NO_HISTORY', 'LOW_SAMPLE', 'LOW_STORE', 'LOW_SAMPLE_AND_STORE'
        ))
        or (benchmark_assessment <> 'BUILDING' and benchmark_assessment_reason is null)
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'price_snapshots_benchmark_assessment_at_approval_check'
      and conrelid = 'public.price_snapshots'::regclass
  ) then
    alter table public.price_snapshots
      add constraint price_snapshots_benchmark_assessment_at_approval_check
      check (
        benchmark_assessment_at_approval is null
        or benchmark_assessment_at_approval in ('READY', 'BUILDING', 'NOT_EVALUATED')
      );
  end if;
end;
$$;

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
      or new.evidence_review_decision is distinct from old.evidence_review_decision
      or new.list_price_idr is distinct from old.list_price_idr
      or new.package_price_idr is distinct from old.package_price_idr
      or new.net_price_idr is distinct from old.net_price_idr
      or new.parsed_price_idr is distinct from old.parsed_price_idr
      or new.visible_price_per_piece_idr is distinct from old.visible_price_per_piece_idr
      or new.price_per_piece is distinct from old.price_per_piece
      or new.reviewed_price_per_piece is distinct from old.reviewed_price_per_piece
      or new.ai_price_per_piece is distinct from old.ai_price_per_piece
      or new.piece_count is distinct from old.piece_count
      or new.reviewed_piece_count is distinct from old.reviewed_piece_count
      or new.promo_type is distinct from old.promo_type
      or new.ai_promo_type is distinct from old.ai_promo_type
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
    new.benchmark_assessment := 'NOT_EVALUATED';
    new.benchmark_assessment_reason := null;
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

drop function if exists public.claim_ai_price_candidates_for_quality_gate(text, integer);

create function public.claim_ai_price_candidates_for_quality_gate(
  p_worker_id text,
  p_limit integer default 50
)
returns table (
  candidate_id uuid,
  claim_input_fingerprint text,
  candidate_price_per_piece numeric,
  evidence_review_decision text,
  matched_entity_type text,
  matched_entity_id text,
  match_score numeric,
  has_warnings boolean,
  has_conflicts boolean,
  has_source_image boolean,
  has_valid_package_facts boolean,
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

  with expired_claims as (
    select
      candidate.id,
      candidate.approval_input_fingerprint,
      candidate.quality_gate_attempt_count,
      candidate.quality_gate_worker_id
    from public.ai_price_candidates candidate
    where candidate.status = 'pending'
      and candidate.candidate_type = 'SKU'
      and candidate.quality_gate_status = 'PROCESSING'
      and candidate.quality_gate_attempt_count >= 3
      and candidate.quality_gate_claimed_at < now() - interval '10 minutes'
    for update skip locked
  ), terminalized as (
    update public.ai_price_candidates candidate
    set
      quality_gate_status = 'FAILED',
      quality_gate_reason_codes = '[]'::jsonb,
      quality_gate_version = null,
      benchmark_assessment = 'NOT_EVALUATED',
      benchmark_assessment_reason = null,
      quality_gate_evaluated_at = now(),
      quality_gate_error = 'Quality gate lease expired after maximum attempts.',
      quality_gate_worker_id = null,
      quality_gate_claimed_at = null,
      quality_gate_input_fingerprint = expired.approval_input_fingerprint,
      review_decision = 'NEED_REVIEW'
    from expired_claims expired
    where candidate.id = expired.id
    returning
      candidate.id,
      expired.approval_input_fingerprint,
      expired.quality_gate_attempt_count,
      expired.quality_gate_worker_id
  )
  insert into public.price_quality_gate_evaluations (
    candidate_id,
    claim_input_fingerprint,
    quality_gate_attempt_count,
    worker_id,
    quality_gate_status,
    reason_codes,
    benchmark_assessment,
    benchmark_assessment_reason,
    evaluation_error
  )
  select
    terminalized.id,
    terminalized.approval_input_fingerprint,
    terminalized.quality_gate_attempt_count,
    coalesce(terminalized.quality_gate_worker_id, 'expired-lease'),
    'FAILED',
    '[]'::jsonb,
    'NOT_EVALUATED',
    null,
    'Quality gate lease expired after maximum attempts.'
  from terminalized;

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
  ), claimed as (
    update public.ai_price_candidates candidate
    set
      quality_gate_status = 'PROCESSING',
      quality_gate_worker_id = p_worker_id,
      quality_gate_claimed_at = now(),
      quality_gate_attempt_count = candidate.quality_gate_attempt_count + 1,
      quality_gate_error = null,
      quality_gate_input_fingerprint = candidate.approval_input_fingerprint,
      review_decision = 'NEED_REVIEW'
    from claimable
    where candidate.id = claimable.id
    returning candidate.*
  )
  select
    candidate.id,
    candidate.quality_gate_input_fingerprint,
    coalesce(
      candidate.reviewed_price_per_piece,
      candidate.price_per_piece,
      candidate.ai_price_per_piece
    ),
    candidate.evidence_review_decision,
    candidate.matched_entity_type,
    candidate.matched_entity_id,
    candidate.match_score,
    jsonb_array_length(coalesce(candidate.warnings, '[]'::jsonb)) > 0,
    jsonb_array_length(coalesce(candidate.conflicts, '[]'::jsonb)) > 0,
    candidate.source_image_id is not null,
    coalesce(candidate.net_price_idr, candidate.parsed_price_idr) > 0
      and coalesce(candidate.reviewed_piece_count, candidate.piece_count) > 0,
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

revoke all on function public.claim_ai_price_candidates_for_quality_gate(text, integer)
  from public, anon, authenticated;
grant execute on function public.claim_ai_price_candidates_for_quality_gate(text, integer)
  to service_role;

create function public.finalize_ai_price_candidate_quality_gate(
  p_candidate_id uuid,
  p_worker_id text,
  p_expected_input_fingerprint text,
  p_quality_gate_status text,
  p_reason_codes jsonb,
  p_quality_gate_version text,
  p_benchmark_date date,
  p_benchmark_price_per_piece numeric,
  p_benchmark_deviation_pct numeric,
  p_benchmark_sample_count integer,
  p_benchmark_store_count integer,
  p_benchmark_assessment text,
  p_benchmark_assessment_reason text,
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
  if p_quality_gate_status not in ('PASSED', 'REVIEW_REQUIRED', 'INSUFFICIENT_BENCHMARK', 'FAILED') then
    raise exception 'invalid quality gate status: %', p_quality_gate_status;
  end if;
  if p_benchmark_assessment not in ('READY', 'BUILDING', 'NOT_EVALUATED') then
    raise exception 'invalid benchmark assessment: %', p_benchmark_assessment;
  end if;
  if (p_benchmark_assessment = 'BUILDING') is distinct from (p_benchmark_assessment_reason is not null) then
    raise exception 'benchmark assessment reason does not match assessment';
  end if;
  if p_benchmark_assessment_reason is not null
    and p_benchmark_assessment_reason not in ('NO_HISTORY', 'LOW_SAMPLE', 'LOW_STORE', 'LOW_SAMPLE_AND_STORE')
  then
    raise exception 'invalid benchmark assessment reason: %', p_benchmark_assessment_reason;
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
    benchmark_assessment = p_benchmark_assessment,
    benchmark_assessment_reason = p_benchmark_assessment_reason,
    quality_gate_evaluated_at = now(),
    quality_gate_error = left(p_error, 1000),
    quality_gate_input_fingerprint = p_expected_input_fingerprint,
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
    and candidate.quality_gate_worker_id = p_worker_id
    and candidate.quality_gate_input_fingerprint = p_expected_input_fingerprint
    and candidate.approval_input_fingerprint = p_expected_input_fingerprint;

  get diagnostics v_updated = row_count;
  if v_updated = 1 then
    insert into public.price_quality_gate_evaluations (
      candidate_id,
      claim_input_fingerprint,
      quality_gate_attempt_count,
      worker_id,
      quality_gate_status,
      reason_codes,
      quality_gate_version,
      benchmark_date,
      benchmark_price_per_piece,
      benchmark_deviation_pct,
      benchmark_sample_count,
      benchmark_store_count,
      benchmark_assessment,
      benchmark_assessment_reason,
      evaluation_error
    )
    select
      candidate.id,
      p_expected_input_fingerprint,
      candidate.quality_gate_attempt_count,
      p_worker_id,
      p_quality_gate_status,
      coalesce(p_reason_codes, '[]'::jsonb),
      p_quality_gate_version,
      p_benchmark_date,
      p_benchmark_price_per_piece,
      p_benchmark_deviation_pct,
      p_benchmark_sample_count,
      p_benchmark_store_count,
      p_benchmark_assessment,
      p_benchmark_assessment_reason,
      left(p_error, 1000)
    from public.ai_price_candidates candidate
    where candidate.id = p_candidate_id;

    return query select 'APPLIED'::text;
    return;
  end if;

  select candidate.quality_gate_status
  into v_current_status
  from public.ai_price_candidates candidate
  where candidate.id = p_candidate_id;

  if v_current_status in ('PASSED', 'REVIEW_REQUIRED', 'INSUFFICIENT_BENCHMARK', 'FAILED', 'NOT_REQUIRED') then
    return query select 'ALREADY_FINALIZED'::text;
  end if;
  return query select 'OWNERSHIP_LOST'::text;
end;
$$;

revoke all on function public.finalize_ai_price_candidate_quality_gate(
  uuid, text, text, text, jsonb, text, date, numeric, numeric, integer, integer, text, text, text
) from public, anon, authenticated;
grant execute on function public.finalize_ai_price_candidate_quality_gate(
  uuid, text, text, text, jsonb, text, date, numeric, numeric, integer, integer, text, text, text
) to service_role;

alter function public.approve_ai_price_candidate_with_quality_gate(
  uuid, text, numeric, integer, text, text, text, text, text, uuid, text, text
) rename to approve_ai_price_candidate_with_quality_gate_core;

revoke all on function public.approve_ai_price_candidate_with_quality_gate_core(
  uuid, text, numeric, integer, text, text, text, text, text, uuid, text, text
) from public, anon, authenticated, service_role;

create function public.approve_ai_price_candidate_with_quality_gate(
  p_candidate_id uuid,
  p_review_token text,
  p_price_idr numeric,
  p_piece_count integer,
  p_promo_type text,
  p_matched_entity_type text,
  p_matched_entity_id text,
  p_matched_label text,
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
  v_benchmark_assessment text;
  v_original_matched_entity_type text;
  v_original_matched_entity_id text;
  v_visit_id uuid;
  v_source_image_id uuid;
  v_existing_snapshot_id uuid;
  v_candidate_id uuid;
  v_snapshot_id uuid;
begin
  select
    candidate.benchmark_assessment,
    candidate.matched_entity_type,
    candidate.matched_entity_id,
    candidate.visit_id,
    candidate.source_image_id
  into
    v_benchmark_assessment,
    v_original_matched_entity_type,
    v_original_matched_entity_id,
    v_visit_id,
    v_source_image_id
  from public.ai_price_candidates candidate
  where candidate.id = p_candidate_id;

  if p_matched_entity_type is distinct from v_original_matched_entity_type
    or p_matched_entity_id is distinct from v_original_matched_entity_id
  then
    v_benchmark_assessment := 'NOT_EVALUATED';
  end if;

  select snapshot.id
  into v_existing_snapshot_id
  from public.price_snapshots snapshot
  where snapshot.source = 'offline_ai_confirmed'
    and snapshot.source_visit_id = v_visit_id
    and snapshot.source_image_id = v_source_image_id
    and snapshot.source_matched_entity_type = p_matched_entity_type
    and snapshot.source_matched_entity_id = p_matched_entity_id
    and snapshot.net_price_idr = p_price_idr
  limit 1;

  select approved.candidate_id, approved.snapshot_id
  into v_candidate_id, v_snapshot_id
  from public.approve_ai_price_candidate_with_quality_gate_core(
    p_candidate_id,
    p_review_token,
    p_price_idr,
    p_piece_count,
    p_promo_type,
    p_matched_entity_type,
    p_matched_entity_id,
    p_matched_label,
    p_reviewer,
    p_review_job_id,
    p_review_method,
    p_auto_approval_worker_id
  ) approved;

  if v_existing_snapshot_id is null then
    update public.price_snapshots snapshot
    set benchmark_assessment_at_approval = v_benchmark_assessment
    where snapshot.id = v_snapshot_id
      and snapshot.benchmark_assessment_at_approval is null;
  end if;

  return query select v_candidate_id, v_snapshot_id;
end;
$$;

revoke all on function public.approve_ai_price_candidate_with_quality_gate(
  uuid, text, numeric, integer, text, text, text, text, text, uuid, text, text
) from public, anon, authenticated;
grant execute on function public.approve_ai_price_candidate_with_quality_gate(
  uuid, text, numeric, integer, text, text, text, text, text, uuid, text, text
) to service_role;

create function public.requeue_ai_price_candidates_for_cold_start_v2()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_requeued integer := 0;
begin
update public.ai_price_candidates candidate
set
  quality_gate_status = 'PENDING',
  quality_gate_reason_codes = '[]'::jsonb,
  quality_gate_version = null,
  benchmark_date = null,
  benchmark_price_per_piece = null,
  benchmark_deviation_pct = null,
  benchmark_sample_count = null,
  benchmark_store_count = null,
  benchmark_assessment = 'NOT_EVALUATED',
  benchmark_assessment_reason = null,
  quality_gate_evaluated_at = null,
  quality_gate_error = null,
  quality_gate_attempt_count = 0,
  quality_gate_worker_id = null,
  quality_gate_claimed_at = null,
  auto_approval_status = 'NOT_REQUIRED',
  auto_approval_attempt_count = 0,
  auto_approval_worker_id = null,
  auto_approval_claimed_at = null,
  auto_approval_error = null,
  review_decision = 'NEED_REVIEW'
where candidate.status = 'pending'
  and candidate.candidate_type = 'SKU'
  and candidate.quality_gate_status = 'INSUFFICIENT_BENCHMARK'
  and coalesce(candidate.h5_lifecycle_status, '') not in ('deleted', 'replaced', 'reanalyzed')
  and candidate.evidence_review_decision = 'AUTO_APPROVE'
  and candidate.price_evidence_detail is not null
  and jsonb_typeof(candidate.price_evidence_detail) = 'object'
  and candidate.price_evidence_detail <> '{}'::jsonb
  and candidate.price_evidence_reason_code is not null
  and candidate.price_evidence_reason_code <> 'LEGACY_EVIDENCE_UNAVAILABLE'
  and candidate.match_score >= 0.9
  and candidate.matched_entity_type in ('material_master', 'competitor_product')
  and candidate.matched_entity_id is not null
  and candidate.source_image_id is not null
  and coalesce(candidate.net_price_idr, candidate.parsed_price_idr) > 0
  and coalesce(candidate.reviewed_piece_count, candidate.piece_count) > 0
  and jsonb_array_length(coalesce(candidate.warnings, '[]'::jsonb)) = 0
  and jsonb_array_length(coalesce(candidate.conflicts, '[]'::jsonb)) = 0
  and candidate.approval_input_fingerprint is not null
  and candidate.quality_gate_input_fingerprint = candidate.approval_input_fingerprint;

  get diagnostics v_requeued = row_count;
  return v_requeued;
end;
$$;

revoke all on function public.requeue_ai_price_candidates_for_cold_start_v2()
  from public, anon, authenticated;
grant execute on function public.requeue_ai_price_candidates_for_cold_start_v2()
  to service_role;

notify pgrst, 'reload schema';

-- Prioritize fresh candidate IDs without changing the existing FIFO claim RPCs.

drop function if exists public.claim_ai_price_candidates_for_priority_quality_gate(text, uuid[]);

create function public.claim_ai_price_candidates_for_priority_quality_gate(
  p_worker_id text,
  p_candidate_ids uuid[]
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
  if coalesce(array_length(p_candidate_ids, 1), 0) = 0 then
    raise exception 'candidate ids are required';
  end if;

  with expired_claims as (
    select
      candidate.id,
      candidate.approval_input_fingerprint,
      candidate.quality_gate_attempt_count,
      candidate.quality_gate_worker_id
    from public.ai_price_candidates candidate
    where candidate.id = any(p_candidate_ids)
      and candidate.status = 'pending'
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
    where candidate.id = any(p_candidate_ids)
      and candidate.status = 'pending'
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

revoke all on function public.claim_ai_price_candidates_for_priority_quality_gate(text, uuid[])
  from public, anon, authenticated;
grant execute on function public.claim_ai_price_candidates_for_priority_quality_gate(text, uuid[])
  to service_role;

drop function if exists public.claim_ai_price_candidates_for_priority_auto_approval(text, uuid[]);

create function public.claim_ai_price_candidates_for_priority_auto_approval(
  p_worker_id text,
  p_candidate_ids uuid[]
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
  if coalesce(array_length(p_candidate_ids, 1), 0) = 0 then
    raise exception 'candidate ids are required';
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
  where candidate.id = any(p_candidate_ids)
    and candidate.status = 'pending'
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
    where candidate.id = any(p_candidate_ids)
      and candidate.status = 'pending'
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
  ), claimed as (
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

revoke all on function public.claim_ai_price_candidates_for_priority_auto_approval(text, uuid[])
  from public, anon, authenticated;
grant execute on function public.claim_ai_price_candidates_for_priority_auto_approval(text, uuid[])
  to service_role;

notify pgrst, 'reload schema';

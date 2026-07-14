create or replace function public.claim_ai_price_candidates_for_quality_gate(
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
    order by
      case
        when candidate.created_at >= now() - interval '1 day' then 0
        else 1
      end,
      candidate.created_at,
      candidate.id
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

notify pgrst, 'reload schema';

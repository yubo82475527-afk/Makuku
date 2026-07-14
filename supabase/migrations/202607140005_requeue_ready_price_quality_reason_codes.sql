create function public.requeue_ready_price_quality_reason_codes()
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
    quality_gate_input_fingerprint = null,
    auto_approval_status = 'NOT_REQUIRED',
    auto_approval_attempt_count = 0,
    auto_approval_worker_id = null,
    auto_approval_claimed_at = null,
    auto_approval_error = null,
    review_decision = 'NEED_REVIEW'
  where candidate.status = 'pending'
    and candidate.candidate_type = 'SKU'
    and coalesce(candidate.h5_lifecycle_status, '') not in ('deleted', 'replaced', 'reanalyzed')
    and candidate.benchmark_assessment = 'READY'
    and candidate.quality_gate_status in ('REVIEW_REQUIRED', 'INSUFFICIENT_BENCHMARK', 'FAILED')
    and candidate.price_snapshot_id is null;

  get diagnostics v_requeued = row_count;
  return v_requeued;
end;
$$;

revoke all on function public.requeue_ready_price_quality_reason_codes() from public;
grant execute on function public.requeue_ready_price_quality_reason_codes() to service_role;

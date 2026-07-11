create or replace function public.finalize_store_visit_ai_job_item(
  p_item_id uuid,
  p_worker_id text,
  p_outcome text,
  p_result_summary jsonb default '{}'::jsonb,
  p_error_message text default null
)
returns table(
  finalize_result text,
  finalized_job_id uuid,
  finalized_image_id uuid,
  finalized_item_status text,
  finalized_job_status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.store_visit_ai_job_items%rowtype;
  v_job public.store_visit_ai_jobs%rowtype;
  v_success_count integer;
  v_failed_count integer;
  v_retake_required_count integer;
  v_remaining_count integer;
  v_job_status text;
begin
  if p_outcome not in ('succeeded', 'retake_required', 'failed') then
    raise exception 'invalid store visit AI job item outcome: %', p_outcome;
  end if;
  if p_worker_id is null or btrim(p_worker_id) = '' then
    raise exception 'worker id is required to finalize a store visit AI job item';
  end if;
  if p_outcome = 'failed' and (p_error_message is null or btrim(p_error_message) = '') then
    raise exception 'error message is required for a failed store visit AI job item';
  end if;

  select *
    into v_item
  from public.store_visit_ai_job_items
  where id = p_item_id
  for update;

  if v_item.id is null then
    raise exception 'store visit AI job item not found: %', p_item_id;
  end if;

  select *
    into v_job
  from public.store_visit_ai_jobs
  where id = v_item.job_id
  for update;

  if v_item.status in ('succeeded', 'retake_required', 'failed') then
    if v_item.status = p_outcome and v_item.worker_id is not distinct from p_worker_id then
      return query
      select 'already_finalized', v_item.job_id, v_item.source_image_id, v_item.status, v_job.status;
    else
      return query
      select 'ownership_lost', v_item.job_id, v_item.source_image_id, v_item.status, v_job.status;
    end if;
    return;
  end if;

  if v_item.status <> 'processing'
    or v_item.worker_id is distinct from p_worker_id
    or v_job.status not in ('queued', 'running') then
    return query
    select 'ownership_lost', v_item.job_id, v_item.source_image_id, v_item.status, v_job.status;
    return;
  end if;

  update public.store_visit_ai_job_items
  set status = p_outcome,
      result_summary = coalesce(p_result_summary, '{}'::jsonb),
      error_message = case when p_outcome = 'failed' then p_error_message else null end,
      last_heartbeat_at = now(),
      lease_expires_at = null,
      updated_at = now()
  where id = v_item.id;

  update public.offline_visit_images
  set analysis_status = case when p_outcome = 'failed' then 'failed' else 'analyzed' end,
      analysis_error = case when p_outcome = 'failed' then p_error_message else null end,
      error_message = case when p_outcome = 'failed' then p_error_message else null end
  where id = v_item.source_image_id;

  select
    count(*) filter (where status = 'succeeded'),
    count(*) filter (where status = 'failed'),
    count(*) filter (where status = 'retake_required'),
    count(*) filter (where status not in ('succeeded', 'retake_required', 'failed'))
  into v_success_count, v_failed_count, v_retake_required_count, v_remaining_count
  from public.store_visit_ai_job_items
  where job_id = v_item.job_id;

  v_job_status := case
    when v_remaining_count > 0 then 'running'
    when v_success_count = 0 and v_retake_required_count = 0 and v_failed_count > 0 then 'failed'
    else 'completed'
  end;

  update public.store_visit_ai_jobs
  set success_count = v_success_count,
      failed_count = v_failed_count,
      retake_required_count = v_retake_required_count,
      remaining_count = v_remaining_count,
      status = v_job_status,
      completed_at = case when v_remaining_count = 0 then now() else null end,
      last_heartbeat_at = now(),
      lease_expires_at = case when v_remaining_count = 0 then null else lease_expires_at end,
      updated_at = now()
  where id = v_item.job_id;

  return query
  select 'applied', v_item.job_id, v_item.source_image_id, p_outcome, v_job_status;
end;
$$;

revoke all on function public.finalize_store_visit_ai_job_item(uuid,text,text,jsonb,text)
  from public, anon, authenticated;
grant execute on function public.finalize_store_visit_ai_job_item(uuid,text,text,jsonb,text)
  to service_role;

notify pgrst, 'reload schema';

alter table public.store_visit_ai_job_items
  add column if not exists next_attempt_at timestamptz;

create index if not exists idx_store_visit_ai_job_items_queue_next_attempt
  on public.store_visit_ai_job_items (status, next_attempt_at, created_at);

drop function if exists public.claim_store_visit_ai_job_item(uuid,text,integer,integer);

create function public.claim_store_visit_ai_job_item(
  p_job_id uuid default null,
  p_worker_id text default null,
  p_max_global_processing integer default 200,
  p_lease_seconds integer default 240
)
returns table(claimed_job_id uuid, claimed_item_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_processing_count integer;
begin
  update public.store_visit_ai_job_items
    set status = 'queued',
        worker_id = null,
        lease_expires_at = null,
        updated_at = now()
  where status = 'processing'
    and lease_expires_at is not null
    and lease_expires_at < now();

  update public.store_visit_ai_jobs
    set status = 'queued',
        lease_expires_at = null,
        updated_at = now()
  where status = 'running'
    and not exists (
      select 1
      from public.store_visit_ai_job_items item
      where item.job_id = store_visit_ai_jobs.id
        and item.status = 'processing'
    )
    and exists (
      select 1
      from public.store_visit_ai_job_items item
      where item.job_id = store_visit_ai_jobs.id
        and item.status = 'queued'
        and (item.next_attempt_at is null or item.next_attempt_at <= now())
    );

  select count(*)
    into v_processing_count
  from public.store_visit_ai_job_items
  where status = 'processing'
    and (lease_expires_at is null or lease_expires_at >= now());

  if v_processing_count >= greatest(coalesce(p_max_global_processing, 200), 1) then
    return;
  end if;

  return query
  with candidate as (
    select item.id as candidate_item_id, job.id as candidate_job_id
    from public.store_visit_ai_job_items item
    join public.store_visit_ai_jobs job on job.id = item.job_id
    where item.status = 'queued'
      and (item.next_attempt_at is null or item.next_attempt_at <= now())
      and job.status in ('queued','running')
      and (p_job_id is null or job.id = p_job_id)
    order by job.created_at asc, item.position asc, item.created_at asc
    limit 1
    for update of item skip locked
  ),
  updated_item as (
    update public.store_visit_ai_job_items item
      set status = 'processing',
          attempt_count = item.attempt_count + 1,
          worker_id = coalesce(p_worker_id, gen_random_uuid()::text),
          last_heartbeat_at = now(),
          lease_expires_at = now() + make_interval(secs => greatest(coalesce(p_lease_seconds, 240), 60)),
          next_attempt_at = null,
          error_message = null,
          updated_at = now()
    from candidate
    where item.id = candidate.candidate_item_id
      and item.status = 'queued'
    returning item.id, item.job_id
  ),
  updated_job as (
    update public.store_visit_ai_jobs job
      set status = 'running',
          started_at = coalesce(job.started_at, now()),
          last_heartbeat_at = now(),
          lease_expires_at = now() + make_interval(secs => greatest(coalesce(p_lease_seconds, 240), 60)),
          updated_at = now()
    from updated_item
    where job.id = updated_item.job_id
    returning job.id
  )
  select updated_item.job_id as claimed_job_id, updated_item.id as claimed_item_id
  from updated_item
  join updated_job on updated_job.id = updated_item.job_id;
end;
$$;

revoke all on function public.claim_store_visit_ai_job_item(uuid,text,integer,integer) from public, anon, authenticated;
grant execute on function public.claim_store_visit_ai_job_item(uuid,text,integer,integer) to service_role;

notify pgrst, 'reload schema';

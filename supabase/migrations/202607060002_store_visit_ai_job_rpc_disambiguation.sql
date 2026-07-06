drop function if exists public.create_store_visit_ai_job(uuid,text,uuid[],text,jsonb);

create function public.create_store_visit_ai_job(
  p_visit_id uuid,
  p_job_type text,
  p_source_image_ids uuid[],
  p_created_by text default null,
  p_request_snapshot jsonb default '{}'::jsonb
)
returns table(created_job_id uuid, reused boolean, conflict boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_active_job public.store_visit_ai_jobs%rowtype;
  v_new_job_id uuid;
  v_existing_ids uuid[];
  v_requested_ids uuid[];
begin
  if p_job_type not in ('initial_analysis','single_image_reanalysis','full_visit_reanalysis') then
    raise exception 'invalid store visit ai job type: %', p_job_type;
  end if;

  select array_agg(distinct image_id order by image_id)
    into v_requested_ids
  from unnest(p_source_image_ids) as image_id
  where image_id is not null;

  if v_requested_ids is null or array_length(v_requested_ids, 1) = 0 then
    raise exception 'at least one source image is required';
  end if;

  select *
    into v_active_job
  from public.store_visit_ai_jobs
  where visit_id = p_visit_id
    and status in ('queued','running')
  order by created_at desc
  limit 1
  for update;

  if v_active_job.id is not null then
    select array_agg(source_image_id order by source_image_id)
      into v_existing_ids
    from public.store_visit_ai_job_items
    where public.store_visit_ai_job_items.job_id = v_active_job.id;

    return query
    select v_active_job.id, true, coalesce(v_existing_ids, '{}'::uuid[]) <> v_requested_ids;
    return;
  end if;

  insert into public.store_visit_ai_jobs (
    visit_id,
    job_type,
    status,
    request_snapshot,
    total_count,
    remaining_count,
    created_by
  )
  values (
    p_visit_id,
    p_job_type,
    'queued',
    coalesce(p_request_snapshot, '{}'::jsonb) || jsonb_build_object('target_image_ids', v_requested_ids),
    array_length(v_requested_ids, 1),
    array_length(v_requested_ids, 1),
    p_created_by
  )
  returning id into v_new_job_id;

  insert into public.store_visit_ai_job_items (job_id, source_image_id, position, status)
  select v_new_job_id, image_id, row_number() over () - 1, 'queued'
  from unnest(v_requested_ids) as image_id;

  return query
  select v_new_job_id, false, false;
end;
$$;

drop function if exists public.claim_store_visit_ai_job_item(uuid,text,integer,integer);

create function public.claim_store_visit_ai_job_item(
  p_job_id uuid default null,
  p_worker_id text default null,
  p_max_global_processing integer default 8,
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
    );

  select count(*)
    into v_processing_count
  from public.store_visit_ai_job_items
  where status = 'processing'
    and (lease_expires_at is null or lease_expires_at >= now());

  if v_processing_count >= greatest(coalesce(p_max_global_processing, 8), 1) then
    return;
  end if;

  return query
  with candidate as (
    select item.id as candidate_item_id, job.id as candidate_job_id
    from public.store_visit_ai_job_items item
    join public.store_visit_ai_jobs job on job.id = item.job_id
    where item.status = 'queued'
      and job.status in ('queued','running')
      and (p_job_id is null or job.id = p_job_id)
      and not exists (
        select 1
        from public.store_visit_ai_job_items processing_item
        join public.store_visit_ai_jobs processing_job on processing_job.id = processing_item.job_id
        where processing_job.visit_id = job.visit_id
          and processing_item.status = 'processing'
      )
    order by job.created_at asc, item.position asc, item.created_at asc
    limit 1
    for update skip locked
  ),
  updated_item as (
    update public.store_visit_ai_job_items item
      set status = 'processing',
          attempt_count = item.attempt_count + 1,
          worker_id = coalesce(p_worker_id, gen_random_uuid()::text),
          last_heartbeat_at = now(),
          lease_expires_at = now() + make_interval(secs => greatest(coalesce(p_lease_seconds, 240), 60)),
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

revoke all on function public.create_store_visit_ai_job(uuid,text,uuid[],text,jsonb) from public, anon, authenticated;
revoke all on function public.claim_store_visit_ai_job_item(uuid,text,integer,integer) from public, anon, authenticated;
grant execute on function public.create_store_visit_ai_job(uuid,text,uuid[],text,jsonb) to service_role;
grant execute on function public.claim_store_visit_ai_job_item(uuid,text,integer,integer) to service_role;

notify pgrst, 'reload schema';

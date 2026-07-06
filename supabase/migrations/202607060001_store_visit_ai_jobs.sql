create table if not exists public.store_visit_ai_jobs (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid not null references public.offline_store_visits(id) on delete cascade,
  job_type text not null check (job_type in ('initial_analysis','single_image_reanalysis','full_visit_reanalysis')),
  status text not null default 'queued' check (status in ('queued','running','completed','failed','cancelled')),
  request_snapshot jsonb not null default '{}'::jsonb,
  total_count integer not null default 0,
  success_count integer not null default 0,
  failed_count integer not null default 0,
  retake_required_count integer not null default 0,
  remaining_count integer not null default 0,
  created_by text,
  started_at timestamptz,
  completed_at timestamptz,
  last_heartbeat_at timestamptz,
  lease_expires_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create table if not exists public.store_visit_ai_job_items (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.store_visit_ai_jobs(id) on delete cascade,
  source_image_id uuid not null references public.offline_visit_images(id) on delete cascade,
  position integer not null default 0,
  status text not null default 'queued' check (status in ('queued','processing','succeeded','retake_required','failed')),
  attempt_count integer not null default 0,
  worker_id text,
  last_heartbeat_at timestamptz,
  lease_expires_at timestamptz,
  error_message text,
  result_summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  unique(job_id, source_image_id)
);

create unique index if not exists idx_store_visit_ai_one_active_visit
  on public.store_visit_ai_jobs(visit_id)
  where status in ('queued','running');

create index if not exists idx_store_visit_ai_jobs_status
  on public.store_visit_ai_jobs(status, created_at);

create index if not exists idx_store_visit_ai_jobs_lease
  on public.store_visit_ai_jobs(status, lease_expires_at);

create index if not exists idx_store_visit_ai_items_job_status
  on public.store_visit_ai_job_items(job_id, status, position, created_at);

create index if not exists idx_store_visit_ai_items_processing_lease
  on public.store_visit_ai_job_items(status, lease_expires_at);

alter table public.store_visit_ai_jobs enable row level security;
alter table public.store_visit_ai_job_items enable row level security;

do $$
begin
  execute 'drop policy if exists "authenticated read store_visit_ai_jobs" on public.store_visit_ai_jobs';
  execute 'drop policy if exists "authenticated write store_visit_ai_jobs" on public.store_visit_ai_jobs';
  execute 'drop policy if exists "authenticated read store_visit_ai_job_items" on public.store_visit_ai_job_items';
  execute 'drop policy if exists "authenticated write store_visit_ai_job_items" on public.store_visit_ai_job_items';
end;
$$;

create or replace function public.create_store_visit_ai_job(
  p_visit_id uuid,
  p_job_type text,
  p_source_image_ids uuid[],
  p_created_by text default null,
  p_request_snapshot jsonb default '{}'::jsonb
)
returns table(job_id uuid, reused boolean, conflict boolean)
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
    where job_id = v_active_job.id;

    job_id := v_active_job.id;
    reused := true;
    conflict := coalesce(v_existing_ids, '{}'::uuid[]) <> v_requested_ids;
    return next;
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

  job_id := v_new_job_id;
  reused := false;
  conflict := false;
  return next;
end;
$$;

create or replace function public.claim_store_visit_ai_job_item(
  p_job_id uuid default null,
  p_worker_id text default null,
  p_max_global_processing integer default 8,
  p_lease_seconds integer default 240
)
returns table(job_id uuid, item_id uuid)
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
  select updated_item.job_id, updated_item.id
  from updated_item
  join updated_job on updated_job.id = updated_item.job_id;
end;
$$;

revoke all on function public.create_store_visit_ai_job(uuid,text,uuid[],text,jsonb) from public, anon, authenticated;
revoke all on function public.claim_store_visit_ai_job_item(uuid,text,integer,integer) from public, anon, authenticated;
grant execute on function public.create_store_visit_ai_job(uuid,text,uuid[],text,jsonb) to service_role;
grant execute on function public.claim_store_visit_ai_job_item(uuid,text,integer,integer) to service_role;

notify pgrst, 'reload schema';

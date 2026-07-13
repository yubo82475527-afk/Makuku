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
  perform pg_advisory_xact_lock(
    hashtext('price-quality-benchmark'),
    (v_benchmark_date - date '2000-01-01')::integer
  );

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
  on conflict on constraint price_quality_benchmark_refresh_runs_pkey do update
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

notify pgrst, 'reload schema';

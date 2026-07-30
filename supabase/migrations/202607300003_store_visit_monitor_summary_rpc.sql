-- Store visit monitor promoter/store summaries: aggregate in Postgres instead of
-- loading all visits + ai_price_candidates into the app process.
-- Metric口径 must stay aligned with buildStoreVisitMonitor* in src/lib/data.ts.

create index if not exists idx_ai_price_candidates_monitor_summary_sku
  on public.ai_price_candidates (visit_id)
  where candidate_type = 'SKU';

create or replace function public.store_visit_monitor_promoter_summary(
  p_date_from date,
  p_date_to date,
  p_visit_code text default null,
  p_store_name text default null,
  p_promoter text default null,
  p_analysis_status text default null,
  p_scoped_store_ids uuid[] default null,
  p_page integer default 1,
  p_page_size integer default 50
)
returns table (
  promoter text,
  store_count integer,
  parsed_product_count integer,
  approved_product_count integer,
  pass_rate double precision,
  total_count bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_page integer := greatest(coalesce(p_page, 1), 1);
  v_page_size integer := least(greatest(coalesce(p_page_size, 50), 1), 1000);
begin
  return query
  with filtered_visits as (
    select
      v.id,
      coalesce(
        nullif(trim(v.promoter), ''),
        nullif(trim(v.uploader_name), ''),
        'Unnamed promoter'
      ) as promoter_key,
      coalesce(
        nullif(trim(v.store_id::text), ''),
        nullif(trim(v.store_name), ''),
        v.id::text
      ) as store_key
    from public.offline_store_visits v
    where v.visit_status <> 'draft'
      and v.visit_date >= p_date_from
      and v.visit_date <= p_date_to
      and (p_scoped_store_ids is null or v.store_id = any (p_scoped_store_ids))
      and (
        p_visit_code is null
        or btrim(p_visit_code) = ''
        or v.visit_code ilike '%' || p_visit_code || '%'
      )
      and (
        p_store_name is null
        or btrim(p_store_name) = ''
        or v.store_name ilike '%' || p_store_name || '%'
      )
      and (
        p_promoter is null
        or btrim(p_promoter) = ''
        or v.promoter ilike '%' || p_promoter || '%'
        or v.uploader_name ilike '%' || p_promoter || '%'
      )
      and (
        p_analysis_status is null
        or btrim(p_analysis_status) = ''
        or v.analysis_status = p_analysis_status
      )
  ),
  quality as (
    select
      c.visit_id,
      count(*)::integer as parsed_count,
      count(*) filter (where c.status = 'approved')::integer as approved_count
    from public.ai_price_candidates c
    inner join filtered_visits fv on fv.id = c.visit_id
    where c.candidate_type = 'SKU'
      and coalesce(c.h5_lifecycle_status, '') not in ('deleted', 'replaced', 'reanalyzed')
    group by c.visit_id
  ),
  aggregated as (
    select
      fv.promoter_key as promoter_name,
      count(distinct fv.store_key)::integer as store_count_value,
      coalesce(sum(q.parsed_count), 0)::integer as parsed_product_count_value,
      coalesce(sum(q.approved_count), 0)::integer as approved_product_count_value
    from filtered_visits fv
    left join quality q on q.visit_id = fv.id
    group by fv.promoter_key
  ),
  ranked as (
    select
      a.promoter_name,
      a.store_count_value,
      a.parsed_product_count_value,
      a.approved_product_count_value,
      case
        when a.parsed_product_count_value > 0
          then a.approved_product_count_value::double precision / a.parsed_product_count_value
        else null
      end as pass_rate_value,
      count(*) over () as total_count_value
    from aggregated a
  )
  select
    r.promoter_name,
    r.store_count_value,
    r.parsed_product_count_value,
    r.approved_product_count_value,
    r.pass_rate_value,
    r.total_count_value
  from ranked r
  order by
    r.store_count_value desc,
    r.parsed_product_count_value desc,
    r.promoter_name asc
  limit v_page_size
  offset (v_page - 1) * v_page_size;
end;
$$;

create or replace function public.store_visit_monitor_store_summary(
  p_date_from date,
  p_date_to date,
  p_visit_code text default null,
  p_store_name text default null,
  p_promoter text default null,
  p_analysis_status text default null,
  p_scoped_store_ids uuid[] default null,
  p_page integer default 1,
  p_page_size integer default 50
)
returns table (
  store_key text,
  store_name text,
  organization_name text,
  province text,
  city text,
  district text,
  parsed_product_count integer,
  approved_product_count integer,
  pass_rate double precision,
  total_count bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_page integer := greatest(coalesce(p_page, 1), 1);
  v_page_size integer := least(greatest(coalesce(p_page_size, 50), 1), 1000);
begin
  return query
  with filtered_visits as (
    select
      v.id,
      v.store_id,
      v.store_name as visit_store_name,
      v.province as visit_province,
      coalesce(nullif(trim(v.city_name), ''), nullif(trim(v.city), '')) as visit_city,
      v.district as visit_district,
      coalesce(
        nullif(trim(v.store_id::text), ''),
        nullif(trim(v.store_name), ''),
        v.id::text
      ) as store_key_value
    from public.offline_store_visits v
    where v.visit_status <> 'draft'
      and v.visit_date >= p_date_from
      and v.visit_date <= p_date_to
      and (p_scoped_store_ids is null or v.store_id = any (p_scoped_store_ids))
      and (
        p_visit_code is null
        or btrim(p_visit_code) = ''
        or v.visit_code ilike '%' || p_visit_code || '%'
      )
      and (
        p_store_name is null
        or btrim(p_store_name) = ''
        or v.store_name ilike '%' || p_store_name || '%'
      )
      and (
        p_promoter is null
        or btrim(p_promoter) = ''
        or v.promoter ilike '%' || p_promoter || '%'
        or v.uploader_name ilike '%' || p_promoter || '%'
      )
      and (
        p_analysis_status is null
        or btrim(p_analysis_status) = ''
        or v.analysis_status = p_analysis_status
      )
  ),
  quality as (
    select
      c.visit_id,
      count(*)::integer as parsed_count,
      count(*) filter (where c.status = 'approved')::integer as approved_count
    from public.ai_price_candidates c
    inner join filtered_visits fv on fv.id = c.visit_id
    where c.candidate_type = 'SKU'
      and coalesce(c.h5_lifecycle_status, '') not in ('deleted', 'replaced', 'reanalyzed')
    group by c.visit_id
  ),
  aggregated as (
    select
      fv.store_key_value,
      coalesce(
        nullif(trim(max(s.name)), ''),
        nullif(trim(max(fv.visit_store_name)), ''),
        fv.store_key_value
      ) as store_name_value,
      nullif(trim(max(org.name)), '') as organization_name_value,
      coalesce(
        nullif(trim(max(s.province)), ''),
        nullif(trim(max(fv.visit_province)), '')
      ) as province_value,
      coalesce(
        nullif(trim(max(s.city_name)), ''),
        nullif(trim(max(s.city)), ''),
        nullif(trim(max(fv.visit_city)), '')
      ) as city_value,
      coalesce(
        nullif(trim(max(s.district)), ''),
        nullif(trim(max(fv.visit_district)), '')
      ) as district_value,
      coalesce(sum(q.parsed_count), 0)::integer as parsed_product_count_value,
      coalesce(sum(q.approved_count), 0)::integer as approved_product_count_value
    from filtered_visits fv
    left join quality q on q.visit_id = fv.id
    left join public.offline_stores s on s.id = fv.store_id
    left join public.organizations org on org.id = s.organization_id
    group by fv.store_key_value
  ),
  ranked as (
    select
      a.store_key_value,
      a.store_name_value,
      a.organization_name_value,
      a.province_value,
      a.city_value,
      a.district_value,
      a.parsed_product_count_value,
      a.approved_product_count_value,
      case
        when a.parsed_product_count_value > 0
          then a.approved_product_count_value::double precision / a.parsed_product_count_value
        else null
      end as pass_rate_value,
      count(*) over () as total_count_value
    from aggregated a
  )
  select
    r.store_key_value,
    r.store_name_value,
    r.organization_name_value,
    r.province_value,
    r.city_value,
    r.district_value,
    r.parsed_product_count_value,
    r.approved_product_count_value,
    r.pass_rate_value,
    r.total_count_value
  from ranked r
  order by
    r.parsed_product_count_value desc,
    r.store_name_value asc
  limit v_page_size
  offset (v_page - 1) * v_page_size;
end;
$$;

grant execute on function public.store_visit_monitor_promoter_summary(
  date, date, text, text, text, text, uuid[], integer, integer
) to service_role;

grant execute on function public.store_visit_monitor_store_summary(
  date, date, text, text, text, text, uuid[], integer, integer
) to service_role;

comment on function public.store_visit_monitor_promoter_summary(date, date, text, text, text, text, uuid[], integer, integer) is
  'Paginated promoter summary for store-visit-monitor. Aligns with buildStoreVisitMonitorPromoterSummary.';

comment on function public.store_visit_monitor_store_summary(date, date, text, text, text, text, uuid[], integer, integer) is
  'Paginated store summary for store-visit-monitor. Aligns with buildStoreVisitMonitorStoreSummary.';

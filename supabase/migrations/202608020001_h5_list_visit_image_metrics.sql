-- H5 列表：在库内聚合图片指标，避免把 vision_result 大 JSON 拉到应用层。

create or replace function public.h5_list_visit_image_metrics(p_visit_ids uuid[])
returns table (
  visit_id uuid,
  photo_count integer,
  failed_photo_count integer,
  has_in_flight_price_image boolean
)
language sql
stable
set search_path = public
as $$
  select
    i.visit_id,
    count(*)::integer as photo_count,
    count(*) filter (
      where i.image_type in ('own_shelf', 'makuku_shelf', 'competitor_shelf')
        and (
          i.analysis_status = 'failed'
          or (i.vision_result -> 'photo_quality' ->> 'status') = 'retake_required'
          or (
            coalesce(i.vision_result -> 'photo_quality' ->> 'status', 'pass') = 'pass'
            and coalesce(jsonb_array_length(i.vision_result -> 'rows'), 0) = 0
            and i.analysis_status = 'analyzed'
          )
        )
    )::integer as failed_photo_count,
    coalesce(
      bool_or(
        i.image_type in ('own_shelf', 'makuku_shelf', 'competitor_shelf')
        and i.analysis_status in ('pending', 'analyzing')
      ),
      false
    ) as has_in_flight_price_image
  from public.offline_visit_images i
  where i.visit_id = any (p_visit_ids)
    and i.deleted_at is null
    and i.replaced_by_image_id is null
  group by i.visit_id;
$$;

revoke all on function public.h5_list_visit_image_metrics(uuid[]) from public;
grant execute on function public.h5_list_visit_image_metrics(uuid[]) to service_role;

-- 列表 candidates 查询：只扫 H5 有效行
create index if not exists idx_ai_price_candidates_visit_h5_active
  on public.ai_price_candidates (visit_id)
  where coalesce(h5_lifecycle_status, '') not in ('deleted', 'replaced', 'reanalyzed');

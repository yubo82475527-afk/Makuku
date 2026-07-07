with ranked_h5_rows as (
  select
    c.id,
    row_number() over (
      partition by c.visit_id, c.source_image_id, c.source_row_index
      order by
        case
          when lower(trim(coalesce(c.raw_product, ''))) = lower(trim(coalesce(i.vision_result #>> array['rows', c.source_row_index::text, 'sku'], '')))
            then 0
          else 1
        end,
        case when c.status = 'approved' then 0 else 1 end,
        case when c.price_snapshot_id is not null then 0 else 1 end,
        c.reviewed_at desc nulls last,
        c.created_at desc,
        c.id
    ) as row_rank
  from public.ai_price_candidates c
  left join public.offline_visit_images i
    on i.id = c.source_image_id
  where c.source_image_id is not null
    and c.source_row_index is not null
    and coalesce(c.h5_lifecycle_status, '') not in ('deleted', 'replaced', 'reanalyzed')
    and c.status in ('pending', 'approved')
)
update public.ai_price_candidates c
set
  h5_lifecycle_status = 'reanalyzed',
  h5_lifecycle_at = coalesce(c.h5_lifecycle_at, now()),
  rejection_reason = coalesce(
    c.rejection_reason,
    'Duplicate H5 row candidate archived before enforcing row identity.'
  )
from ranked_h5_rows ranked
where c.id = ranked.id
  and ranked.row_rank > 1;

create unique index if not exists idx_ai_price_candidates_h5_active_row
  on public.ai_price_candidates(visit_id, source_image_id, source_row_index)
  where source_image_id is not null
    and source_row_index is not null
    and coalesce(h5_lifecycle_status, '') not in ('deleted', 'replaced', 'reanalyzed')
    and status in ('pending', 'approved');

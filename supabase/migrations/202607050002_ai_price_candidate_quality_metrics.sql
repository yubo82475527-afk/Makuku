alter table public.ai_price_candidates
  add column if not exists ai_matched_entity_type text,
  add column if not exists ai_matched_entity_id text,
  add column if not exists ai_matched_label text,
  add column if not exists ai_list_price_idr numeric,
  add column if not exists ai_package_price_idr numeric,
  add column if not exists ai_net_price_idr numeric,
  add column if not exists ai_piece_count integer,
  add column if not exists ai_price_per_piece numeric,
  add column if not exists ai_promo_type text;

update public.ai_price_candidates
set
  ai_matched_entity_type = coalesce(ai_matched_entity_type, matched_entity_type),
  ai_matched_entity_id = coalesce(ai_matched_entity_id, matched_entity_id),
  ai_matched_label = coalesce(ai_matched_label, matched_label),
  ai_list_price_idr = coalesce(ai_list_price_idr, list_price_idr),
  ai_package_price_idr = coalesce(ai_package_price_idr, package_price_idr),
  ai_net_price_idr = coalesce(ai_net_price_idr, net_price_idr, parsed_price_idr),
  ai_piece_count = coalesce(ai_piece_count, piece_count),
  ai_price_per_piece = coalesce(ai_price_per_piece, price_per_piece),
  ai_promo_type = coalesce(ai_promo_type, promo_type)
where
  ai_matched_entity_type is null
  or ai_matched_entity_id is null
  or ai_matched_label is null
  or ai_list_price_idr is null
  or ai_package_price_idr is null
  or ai_net_price_idr is null
  or ai_piece_count is null
  or ai_price_per_piece is null
  or ai_promo_type is null;

create or replace view public.ai_price_candidate_quality_metrics_v1 as
select
  c.id as candidate_id,
  c.visit_id,
  v.visit_code,
  v.store_name,
  v.promoter,
  v.visit_date,
  v.analysis_status,
  c.review_method,
  c.status,
  c.candidate_type,
  c.h5_lifecycle_status,
  c.ai_matched_entity_type,
  c.ai_matched_entity_id,
  c.ai_net_price_idr,
  c.ai_piece_count,
  ps.id as price_snapshot_id,
  ps.net_price_idr as final_net_price_idr,
  ps.source_matched_entity_type as final_matched_entity_type,
  ps.source_matched_entity_id as final_matched_entity_id,
  (c.candidate_type = 'SKU'
    and coalesce(c.h5_lifecycle_status, '') not in ('deleted', 'replaced', 'reanalyzed')) as is_active_candidate,
  (
    c.candidate_type = 'SKU'
    and coalesce(c.h5_lifecycle_status, '') not in ('deleted', 'replaced', 'reanalyzed')
    and c.status = 'approved'
    and ps.id is not null
    and c.ai_matched_entity_type is not distinct from ps.source_matched_entity_type
    and c.ai_matched_entity_id is not distinct from ps.source_matched_entity_id
    and c.ai_net_price_idr is not distinct from ps.net_price_idr
  ) as row_correct_flag,
  (
    c.candidate_type = 'SKU'
    and coalesce(c.h5_lifecycle_status, '') not in ('deleted', 'replaced', 'reanalyzed')
    and c.status = 'approved'
    and c.review_method = 'auto_rule'
  ) as auto_approved_flag,
  abs(coalesce(c.ai_net_price_idr, 0) - coalesce(ps.net_price_idr, 0)) as price_delta_abs,
  case
    when c.candidate_type = 'SKU'
      and coalesce(c.h5_lifecycle_status, '') not in ('deleted', 'replaced', 'reanalyzed')
      and c.status = 'approved'
      and ps.id is not null
      and ps.net_price_idr is not null
      and ps.net_price_idr > 0
      and c.ai_net_price_idr is not null
    then abs(c.ai_net_price_idr - ps.net_price_idr) / ps.net_price_idr
    else null
  end as price_delta_pct
from public.ai_price_candidates c
left join public.offline_store_visits v
  on v.id = c.visit_id
left join public.price_snapshots ps
  on ps.id = c.price_snapshot_id;

notify pgrst, 'reload schema';

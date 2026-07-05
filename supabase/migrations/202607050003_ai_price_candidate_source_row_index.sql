alter table public.ai_price_candidates
  add column if not exists source_row_index integer;

create index if not exists idx_ai_price_candidates_source_row
  on public.ai_price_candidates(visit_id, source_image_id, source_row_index)
  where source_image_id is not null and source_row_index is not null;

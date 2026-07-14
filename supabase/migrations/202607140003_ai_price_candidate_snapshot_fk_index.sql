-- Snapshot invalidation uses ON DELETE SET NULL on this foreign key. Without
-- the supporting index, each deleted snapshot scans the full candidate table.
create index if not exists idx_ai_price_candidates_price_snapshot_id
  on public.ai_price_candidates(price_snapshot_id);

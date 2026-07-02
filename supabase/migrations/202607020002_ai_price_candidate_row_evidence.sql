alter table ai_price_candidates
  add column if not exists raw_piece_count_text text,
  add column if not exists raw_package_price_text text,
  add column if not exists raw_net_price_text text,
  add column if not exists raw_price_per_piece_text text,
  add column if not exists visible_price_per_piece_idr numeric,
  add column if not exists price_basis text;

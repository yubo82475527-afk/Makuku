delete from public.sku_matches
where match_method = 'series_rule';

alter table public.sku_matches
  drop constraint if exists sku_matches_match_method_check;

alter table public.sku_matches
  add constraint sku_matches_match_method_check
  check (match_method in ('rule', 'ai', 'manual'));

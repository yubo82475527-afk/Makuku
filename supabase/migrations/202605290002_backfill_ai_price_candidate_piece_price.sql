with key_sku_prices as (
  select
    v.id as visit_id,
    lower(regexp_replace(coalesce(item->>'brand', '') || ' ' || coalesce(item->>'product', '') || ' ' || coalesce(item->>'price', ''), '[^a-zA-Z0-9]+', ' ', 'g')) as item_key,
    nullif(item->>'piece_count', '')::integer as piece_count
  from public.offline_store_visits v
  cross join lateral jsonb_array_elements(coalesce(v.ai_result->'price_insights'->'key_sku_prices', '[]'::jsonb)) item
  where jsonb_typeof(coalesce(v.ai_result->'price_insights'->'key_sku_prices', '[]'::jsonb)) = 'array'
    and nullif(item->>'piece_count', '') is not null
    and nullif(item->>'piece_count', '')::integer > 0
),
candidate_matches as (
  select
    c.id,
    k.piece_count,
    case
      when c.parsed_price_idr is not null and k.piece_count > 0
        then round(c.parsed_price_idr / k.piece_count, 2)
      else null
    end as price_per_piece,
    row_number() over (partition by c.id order by k.piece_count desc) as rn
  from public.ai_price_candidates c
  join key_sku_prices k
    on k.visit_id = c.visit_id
   and k.item_key = lower(regexp_replace(coalesce(c.raw_brand, '') || ' ' || coalesce(c.raw_product, '') || ' ' || coalesce(c.raw_price, ''), '[^a-zA-Z0-9]+', ' ', 'g'))
  where c.piece_count is null
)
update public.ai_price_candidates c
set
  piece_count = m.piece_count,
  price_per_piece = m.price_per_piece
from candidate_matches m
where c.id = m.id
  and m.rn = 1;

notify pgrst, 'reload schema';

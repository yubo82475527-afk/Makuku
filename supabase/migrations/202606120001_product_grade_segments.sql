alter table public.sku_master
  drop constraint if exists sku_master_segment_check;

alter table public.competitor_products
  drop constraint if exists competitor_products_segment_check;

update public.sku_master
set segment = case
  when segment in ('premium', 'mid') then 'BD MID'
  when segment = 'value' then 'BD Eco'
  when segment in ('AD', 'BD Eco', 'BD MID') then segment
  else 'unknown'
end
where segment is distinct from case
  when segment in ('premium', 'mid') then 'BD MID'
  when segment = 'value' then 'BD Eco'
  when segment in ('AD', 'BD Eco', 'BD MID') then segment
  else 'unknown'
end;

update public.competitor_products
set segment = case
  when segment in ('premium', 'mid') then 'BD MID'
  when segment = 'value' then 'BD Eco'
  when segment in ('AD', 'BD Eco', 'BD MID') then segment
  else 'unknown'
end
where segment is distinct from case
  when segment in ('premium', 'mid') then 'BD MID'
  when segment = 'value' then 'BD Eco'
  when segment in ('AD', 'BD Eco', 'BD MID') then segment
  else 'unknown'
end;

update public.market_benchmarks
set price_band = case
  when price_band in ('premium', 'mid') then 'BD MID'
  when price_band = 'value' then 'BD Eco'
  when price_band in ('AD', 'BD Eco', 'BD MID') then price_band
  else coalesce(nullif(price_band, ''), 'unknown')
end
where price_band is distinct from case
  when price_band in ('premium', 'mid') then 'BD MID'
  when price_band = 'value' then 'BD Eco'
  when price_band in ('AD', 'BD Eco', 'BD MID') then price_band
  else coalesce(nullif(price_band, ''), 'unknown')
end;

alter table public.sku_master
  add constraint sku_master_segment_check
  check (segment in ('AD', 'BD Eco', 'BD MID', 'unknown'));

alter table public.competitor_products
  add constraint competitor_products_segment_check
  check (segment in ('AD', 'BD Eco', 'BD MID', 'unknown'));

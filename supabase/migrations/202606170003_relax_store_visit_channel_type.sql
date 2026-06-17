alter table public.offline_store_visits
  drop constraint if exists offline_store_visits_channel_type_check;

update public.offline_store_visits
set channel_type = case channel_type
  when 'baby_shop' then 'BABY SHOP'
  when 'baby_store' then 'BABY SHOP'
  when 'mt_lka_supermarket' then 'MT-LKA-SUPERMARKET'
  when 'mt_lka_babyshop' then 'MT-LKA-BABYSHOP'
  when 'modern_trade' then 'MODERN TRADE'
  else channel_type
end
where channel_type in (
  'baby_shop',
  'baby_store',
  'mt_lka_supermarket',
  'mt_lka_babyshop',
  'modern_trade'
);

update public.offline_store_visits v
set channel_id = c.id
from public.channels c
where v.channel_id is null
  and c.code = v.channel_type;

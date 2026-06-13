alter table public.competitor_products
  add column if not exists competitor_sku_code text,
  add column if not exists status text not null default 'active',
  add column if not exists updated_at timestamptz;

alter table public.competitor_products
  drop constraint if exists competitor_products_status_check;

alter table public.competitor_products
  add constraint competitor_products_status_check
  check (status in ('active', 'disabled'));

create index if not exists idx_competitor_products_status
  on public.competitor_products(status);

create index if not exists idx_competitor_products_competitor_sku_code
  on public.competitor_products(competitor_sku_code);

alter table public.price_snapshots
  add column if not exists offline_store_id uuid references public.offline_stores(id) on delete set null;

create index if not exists idx_price_snapshots_offline_store
  on public.price_snapshots(offline_store_id);

insert into public.channels (code, name, type, sort_order, active) values
  ('BABY SHOP', 'BABY SHOP', 'offline', 30, true),
  ('BS', 'BS', 'offline', 40, true),
  ('LKA', 'LKA', 'offline', 50, true),
  ('LKA BS', 'LKA BS', 'offline', 60, true),
  ('MODERN TRADE', 'MODERN TRADE', 'offline', 70, true),
  ('MT-LKA-BABYSHOP', 'MT-LKA-BABYSHOP', 'offline', 80, true),
  ('MT-LKA-SUPERMARKET', 'MT-LKA-SUPERMARKET', 'offline', 90, true),
  ('NKA', 'NKA', 'offline', 100, true)
on conflict (code) do update set
  name = excluded.name,
  type = excluded.type,
  sort_order = excluded.sort_order,
  active = true;

update public.channels
set active = false
where type = 'offline'
  and code not in (
    'BABY SHOP',
    'BS',
    'LKA',
    'LKA BS',
    'MODERN TRADE',
    'MT-LKA-BABYSHOP',
    'MT-LKA-SUPERMARKET',
    'NKA'
  );

do $$
begin
  alter table public.offline_stores
    drop constraint if exists offline_stores_channel_type_check;

  update public.offline_stores
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

  update public.offline_stores
  set channel_type = 'BABY SHOP'
  where channel_type is null
     or channel_type not in (
      'BABY SHOP',
      'BS',
      'LKA',
      'LKA BS',
      'MODERN TRADE',
      'MT-LKA-BABYSHOP',
      'MT-LKA-SUPERMARKET',
      'NKA'
    );

  alter table public.offline_stores
    add constraint offline_stores_channel_type_check
    check (
      channel_type in (
        'BABY SHOP',
        'BS',
        'LKA',
        'LKA BS',
        'MODERN TRADE',
        'MT-LKA-BABYSHOP',
        'MT-LKA-SUPERMARKET',
        'NKA'
      )
    );
end;
$$;

with ranked_matches as (
  select
    id,
    row_number() over (
      partition by competitor_product_id
      order by reviewed desc, created_at desc, id desc
    ) as rank
  from public.sku_matches
)
delete from public.sku_matches match
using ranked_matches
where match.id = ranked_matches.id
  and ranked_matches.rank > 1;

create unique index if not exists uniq_sku_matches_competitor_product
  on public.sku_matches(competitor_product_id);

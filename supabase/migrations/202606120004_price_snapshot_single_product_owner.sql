alter table public.price_snapshots
  alter column competitor_product_id drop not null;

update public.price_snapshots
set sku_master_id = null
where competitor_product_id is not null
  and sku_master_id is not null;

alter table public.price_snapshots
  drop constraint if exists price_snapshots_single_product_owner_check;

alter table public.price_snapshots
  add constraint price_snapshots_single_product_owner_check
  check (
    (competitor_product_id is not null and sku_master_id is null)
    or
    (competitor_product_id is null and sku_master_id is not null)
  );

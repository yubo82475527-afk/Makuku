alter table public.price_snapshots
  add column if not exists package_price_idr numeric;

update public.price_snapshots
set package_price_idr = promo_price_idr
where package_price_idr is null
  and promo_price_idr is not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'price_snapshots_package_price_idr_check'
      and conrelid = 'public.price_snapshots'::regclass
  ) then
    alter table public.price_snapshots
      add constraint price_snapshots_package_price_idr_check
      check (package_price_idr is null or package_price_idr >= 0);
  end if;
end;
$$;

create or replace function public.normalize_price_snapshot()
returns trigger
language plpgsql
as $$
declare
  product_piece_count integer;
begin
  select coalesce(product.piece_count, sku.piece_count, material.pack_count)
    into product_piece_count
  from (select new.competitor_product_id, new.sku_master_id, new.material_sku_code) snapshot
  left join public.competitor_products product
    on product.id = snapshot.competitor_product_id
  left join public.sku_master sku
    on sku.id = snapshot.sku_master_id
  left join public.material_master material
    on material.tenant_sku_code = coalesce(snapshot.material_sku_code, sku.material_sku_code);

  new.package_price_idr := coalesce(new.package_price_idr, new.promo_price_idr, new.list_price_idr, new.net_price_idr, 0);
  new.promo_price_idr := coalesce(new.promo_price_idr, new.package_price_idr);
  new.net_price_idr := coalesce(
    new.net_price_idr,
    greatest(coalesce(new.package_price_idr, 0) - coalesce(new.voucher_value_idr, 0) - coalesce(new.shipping_subsidy_idr, 0), 0)
  );

  if product_piece_count is not null and product_piece_count > 0 then
    new.price_per_piece := round(new.net_price_idr / product_piece_count, 2);
  end if;

  return new;
end;
$$;

notify pgrst, 'reload schema';

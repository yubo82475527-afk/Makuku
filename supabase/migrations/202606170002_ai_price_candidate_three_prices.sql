alter table public.ai_price_candidates
  add column if not exists list_price_idr numeric,
  add column if not exists package_price_idr numeric,
  add column if not exists net_price_idr numeric,
  add column if not exists promo_type text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'ai_price_candidates_list_price_idr_check'
      and conrelid = 'public.ai_price_candidates'::regclass
  ) then
    alter table public.ai_price_candidates
      add constraint ai_price_candidates_list_price_idr_check
      check (list_price_idr is null or list_price_idr >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'ai_price_candidates_package_price_idr_check'
      and conrelid = 'public.ai_price_candidates'::regclass
  ) then
    alter table public.ai_price_candidates
      add constraint ai_price_candidates_package_price_idr_check
      check (package_price_idr is null or package_price_idr >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'ai_price_candidates_net_price_idr_check'
      and conrelid = 'public.ai_price_candidates'::regclass
  ) then
    alter table public.ai_price_candidates
      add constraint ai_price_candidates_net_price_idr_check
      check (net_price_idr is null or net_price_idr >= 0);
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

  new.net_price_idr := coalesce(
    new.net_price_idr,
    greatest(coalesce(new.promo_price_idr, 0) - coalesce(new.voucher_value_idr, 0) - coalesce(new.shipping_subsidy_idr, 0), 0)
  );

  if product_piece_count is not null and product_piece_count > 0 then
    new.price_per_piece := round(new.net_price_idr / product_piece_count, 2);
  end if;

  return new;
end;
$$;

notify pgrst, 'reload schema';

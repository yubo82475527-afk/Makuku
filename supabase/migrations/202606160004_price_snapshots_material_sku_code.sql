alter table public.price_snapshots
  add column if not exists material_sku_code text;

create unique index if not exists idx_sku_master_material_sku_code_unique
  on public.sku_master(material_sku_code)
  where material_sku_code is not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'sku_master_material_sku_code_fkey'
  ) then
    alter table public.sku_master
      add constraint sku_master_material_sku_code_fkey
      foreign key (material_sku_code)
      references public.material_master(tenant_sku_code)
      on update cascade
      on delete restrict;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'price_snapshots_material_sku_code_fkey'
  ) then
    alter table public.price_snapshots
      add constraint price_snapshots_material_sku_code_fkey
      foreign key (material_sku_code)
      references public.material_master(tenant_sku_code)
      on update cascade
      on delete set null;
  end if;
end $$;

create index if not exists idx_price_snapshots_material_sku_code
  on public.price_snapshots(material_sku_code);

update public.price_snapshots snapshot
set material_sku_code = sku.material_sku_code
from public.sku_master sku
where snapshot.sku_master_id = sku.id
  and snapshot.material_sku_code is null
  and sku.material_sku_code is not null;

-- Verification helpers:
-- select count(*) as own_snapshots_missing_material_sku_code
-- from public.price_snapshots
-- where sku_master_id is not null
--   and competitor_product_id is null
--   and material_sku_code is null;
--
-- select count(*) as snapshots_with_missing_material_master
-- from public.price_snapshots snapshot
-- left join public.material_master material on material.tenant_sku_code = snapshot.material_sku_code
-- where snapshot.material_sku_code is not null
--   and material.tenant_sku_code is null;
--
-- select count(*) as parenty_own_price_snapshots
-- from public.price_snapshots snapshot
-- join public.material_master material on material.tenant_sku_code = snapshot.material_sku_code
-- where material.brand ilike 'parenty';
--
-- select count(*) as remaining_parenty_competitor_snapshots
-- from public.price_snapshots snapshot
-- join public.competitor_products product on product.id = snapshot.competitor_product_id
-- join public.brands brand on brand.id = product.brand_id
-- where brand.name ilike 'parenty';

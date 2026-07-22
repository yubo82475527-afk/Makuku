create index if not exists idx_price_snapshots_dashboard_makuku_period
  on public.price_snapshots(material_sku_code, captured_at desc, created_at desc, id asc)
  where competitor_product_id is null
    and material_sku_code is not null;

create index if not exists idx_price_snapshots_dashboard_competitor_period
  on public.price_snapshots(competitor_product_id, captured_at desc, created_at desc, id asc)
  where competitor_product_id is not null;

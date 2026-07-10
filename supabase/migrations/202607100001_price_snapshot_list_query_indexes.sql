create index if not exists idx_price_snapshots_list_order
  on public.price_snapshots(created_at desc, captured_at desc, id asc);

create index if not exists idx_price_snapshots_captured_list_order
  on public.price_snapshots(captured_at, created_at desc, id asc);

create index if not exists idx_price_snapshots_competitor_list_order
  on public.price_snapshots(created_at desc, captured_at desc, id asc)
  where competitor_product_id is not null;

create index if not exists idx_price_snapshots_makuku_list_order
  on public.price_snapshots(created_at desc, captured_at desc, id asc)
  where competitor_product_id is null
    and (sku_master_id is not null or material_sku_code is not null);

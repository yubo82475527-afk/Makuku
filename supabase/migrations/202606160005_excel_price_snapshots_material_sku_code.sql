with ranked_competitor_duplicates as (
  select
    id,
    row_number() over (
      partition by source, captured_at, offline_store_id, competitor_product_id
      order by created_at asc, id asc
    ) as rank
  from public.price_snapshots
  where source like 'excel_import:%'
    and competitor_product_id is not null
    and sku_master_id is null
    and material_sku_code is null
)
delete from public.price_snapshots snapshot
using ranked_competitor_duplicates
where snapshot.id = ranked_competitor_duplicates.id
  and ranked_competitor_duplicates.rank > 1;

with ranked_makuku_duplicates as (
  select
    id,
    row_number() over (
      partition by source, captured_at, offline_store_id, coalesce(material_sku_code, sku_master_id::text)
      order by created_at asc, id asc
    ) as rank
  from public.price_snapshots
  where source like 'excel_import:%'
    and competitor_product_id is null
    and (sku_master_id is not null or material_sku_code is not null)
)
delete from public.price_snapshots snapshot
using ranked_makuku_duplicates
where snapshot.id = ranked_makuku_duplicates.id
  and ranked_makuku_duplicates.rank > 1;

create unique index if not exists uniq_price_snapshots_excel_competitor
  on public.price_snapshots(source, captured_at, offline_store_id, competitor_product_id)
  where source like 'excel_import:%'
    and competitor_product_id is not null
    and sku_master_id is null
    and material_sku_code is null;

create unique index if not exists uniq_price_snapshots_excel_makuku
  on public.price_snapshots(source, captured_at, offline_store_id, coalesce(material_sku_code, sku_master_id::text))
  where source like 'excel_import:%'
    and competitor_product_id is null
    and (sku_master_id is not null or material_sku_code is not null);

create or replace function public.import_excel_price_snapshots(snapshots jsonb)
returns table(inserted_count integer, updated_count integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  competitor_inserted integer := 0;
  competitor_updated integer := 0;
  makuku_inserted integer := 0;
  makuku_updated integer := 0;
begin
  with payload as (
    select *
    from jsonb_to_recordset(snapshots) as item(
      offline_store_id uuid,
      competitor_product_id uuid,
      sku_master_id uuid,
      material_sku_code text,
      channel text,
      list_price_idr numeric,
      promo_price_idr numeric,
      voucher_value_idr numeric,
      shipping_subsidy_idr numeric,
      net_price_idr numeric,
      price_per_piece numeric,
      promo_type text,
      captured_at timestamptz,
      source text,
      evidence_url text
    )
  ),
  upserted as (
    insert into public.price_snapshots (
      offline_store_id,
      competitor_product_id,
      sku_master_id,
      material_sku_code,
      channel,
      list_price_idr,
      promo_price_idr,
      voucher_value_idr,
      shipping_subsidy_idr,
      net_price_idr,
      price_per_piece,
      promo_type,
      captured_at,
      source,
      evidence_url
    )
    select
      offline_store_id,
      competitor_product_id,
      null,
      null,
      channel,
      list_price_idr,
      promo_price_idr,
      coalesce(voucher_value_idr, 0),
      coalesce(shipping_subsidy_idr, 0),
      net_price_idr,
      price_per_piece,
      promo_type,
      captured_at,
      source,
      evidence_url
    from payload
    where source like 'excel_import:%'
      and competitor_product_id is not null
      and sku_master_id is null
      and material_sku_code is null
    on conflict (source, captured_at, offline_store_id, competitor_product_id)
      where source like 'excel_import:%'
        and competitor_product_id is not null
        and sku_master_id is null
        and material_sku_code is null
    do update set
      channel = excluded.channel,
      list_price_idr = excluded.list_price_idr,
      promo_price_idr = excluded.promo_price_idr,
      voucher_value_idr = excluded.voucher_value_idr,
      shipping_subsidy_idr = excluded.shipping_subsidy_idr,
      net_price_idr = excluded.net_price_idr,
      price_per_piece = excluded.price_per_piece,
      promo_type = excluded.promo_type,
      evidence_url = excluded.evidence_url
    returning xmax = 0 as inserted
  )
  select
    count(*) filter (where inserted),
    count(*) filter (where not inserted)
  into competitor_inserted, competitor_updated
  from upserted;

  with payload as (
    select *
    from jsonb_to_recordset(snapshots) as item(
      offline_store_id uuid,
      competitor_product_id uuid,
      sku_master_id uuid,
      material_sku_code text,
      channel text,
      list_price_idr numeric,
      promo_price_idr numeric,
      voucher_value_idr numeric,
      shipping_subsidy_idr numeric,
      net_price_idr numeric,
      price_per_piece numeric,
      promo_type text,
      captured_at timestamptz,
      source text,
      evidence_url text
    )
  ),
  upserted as (
    insert into public.price_snapshots (
      offline_store_id,
      competitor_product_id,
      sku_master_id,
      material_sku_code,
      channel,
      list_price_idr,
      promo_price_idr,
      voucher_value_idr,
      shipping_subsidy_idr,
      net_price_idr,
      price_per_piece,
      promo_type,
      captured_at,
      source,
      evidence_url
    )
    select
      offline_store_id,
      null,
      sku_master_id,
      material_sku_code,
      channel,
      list_price_idr,
      promo_price_idr,
      coalesce(voucher_value_idr, 0),
      coalesce(shipping_subsidy_idr, 0),
      net_price_idr,
      price_per_piece,
      promo_type,
      captured_at,
      source,
      evidence_url
    from payload
    where source like 'excel_import:%'
      and competitor_product_id is null
      and (sku_master_id is not null or material_sku_code is not null)
    on conflict (source, captured_at, offline_store_id, coalesce(material_sku_code, sku_master_id::text))
      where source like 'excel_import:%'
        and competitor_product_id is null
        and (sku_master_id is not null or material_sku_code is not null)
    do update set
      channel = excluded.channel,
      list_price_idr = excluded.list_price_idr,
      promo_price_idr = excluded.promo_price_idr,
      voucher_value_idr = excluded.voucher_value_idr,
      shipping_subsidy_idr = excluded.shipping_subsidy_idr,
      net_price_idr = excluded.net_price_idr,
      price_per_piece = excluded.price_per_piece,
      promo_type = excluded.promo_type,
      evidence_url = excluded.evidence_url
    returning xmax = 0 as inserted
  )
  select
    count(*) filter (where inserted),
    count(*) filter (where not inserted)
  into makuku_inserted, makuku_updated
  from upserted;

  inserted_count := coalesce(competitor_inserted, 0) + coalesce(makuku_inserted, 0);
  updated_count := coalesce(competitor_updated, 0) + coalesce(makuku_updated, 0);
  return next;
end;
$$;

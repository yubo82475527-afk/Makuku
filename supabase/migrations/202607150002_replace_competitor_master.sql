create or replace function public.replace_competitor_product_master(p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  disabled_count integer;
  inserted_count integer;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'Competitor master rows are required';
  end if;

  update public.competitor_products
  set status = 'disabled', updated_at = now()
  where status = 'active';
  get diagnostics disabled_count = row_count;

  insert into public.competitor_products (
    competitor_sku_code,
    brand_id,
    raw_title,
    normalized_name,
    channel,
    shop_name,
    product_url,
    image_url,
    pack_type,
    product_series,
    package_type,
    size,
    piece_count,
    segment,
    status,
    updated_at
  )
  select
    nullif(trim(row.competitor_sku_code), ''),
    row.brand_id,
    row.raw_title,
    row.normalized_name,
    row.channel,
    row.shop_name,
    row.product_url,
    row.image_url,
    row.pack_type,
    row.product_series,
    row.package_type,
    row.size,
    row.piece_count,
    row.segment,
    'active',
    now()
  from jsonb_to_recordset(p_rows) as row(
    competitor_sku_code text,
    brand_id uuid,
    raw_title text,
    normalized_name text,
    channel text,
    shop_name text,
    product_url text,
    image_url text,
    pack_type text,
    product_series text,
    package_type text,
    size text,
    piece_count integer,
    segment text
  );
  get diagnostics inserted_count = row_count;
  if inserted_count <> jsonb_array_length(p_rows) then
    raise exception 'Inserted competitor row count does not match validated input';
  end if;

  return jsonb_build_object(
    'disabled_count', disabled_count,
    'inserted_count', inserted_count
  );
end;
$$;

revoke all on function public.replace_competitor_product_master(jsonb) from public;
grant execute on function public.replace_competitor_product_master(jsonb) to service_role;

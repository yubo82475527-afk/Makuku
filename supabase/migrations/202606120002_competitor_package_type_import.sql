alter table public.competitor_products
  add column if not exists package_type text not null default 'unknown';

with source_brands(name) as (
  values
    ('BABY HAPPY'),
    ('CONFIDENCE CLASSIC DAY'),
    ('CONFIDENCE DAILY FRESH'),
    ('MAMY POKO EKSTRA KERING'),
    ('MAMY POKO TIDAK GEMBUNG'),
    ('PARENTY MEDIUM FLOW'),
    ('PARENTY TAPE'),
    ('SWEETY BRONZE'),
    ('SWEETY SILVER')
)
insert into public.brands (name, country, is_own_brand)
select source_brands.name, 'Indonesia', false
from source_brands
where not exists (
  select 1
  from public.brands brands
  where lower(brands.name) = lower(source_brands.name)
);

with source_products(brand_name, package_type, product_name, size, piece_count, pack_type) as (
  values
    ('SWEETY SILVER', 'SUPER JUMBO', 'SWEETY SILVER M60', 'M', 60, 'unknown'),
    ('SWEETY SILVER', 'SUPER JUMBO', 'SWEETY SILVER L54', 'L', 54, 'unknown'),
    ('SWEETY SILVER', 'SUPER JUMBO', 'SWEETY SILVER XL42', 'XL', 42, 'unknown'),
    ('SWEETY BRONZE', 'BIG PACK', 'BRONZE M32', 'M', 32, 'unknown'),
    ('SWEETY BRONZE', 'BIG PACK', 'BRONZE L28', 'L', 28, 'unknown'),
    ('SWEETY BRONZE', 'BIG PACK', 'BRONZE XL24', 'XL', 24, 'unknown'),
    ('SWEETY BRONZE', 'JUMBO', 'BRONZE M48', 'M', 48, 'unknown'),
    ('SWEETY BRONZE', 'JUMBO', 'BRONZE L44', 'L', 44, 'unknown'),
    ('SWEETY BRONZE', 'JUMBO', 'BRONZE XL38', 'XL', 38, 'unknown'),
    ('BABY HAPPY', 'JUMBO', 'BABY HAPPY M48', 'M', 48, 'unknown'),
    ('BABY HAPPY', 'JUMBO', 'BABY HAPPY L42', 'L', 42, 'unknown'),
    ('BABY HAPPY', 'JUMBO', 'BABY HAPPY XL38', 'XL', 38, 'unknown'),
    ('MAMY POKO TIDAK GEMBUNG', 'BIG PACK', 'MP TIDAK GEMBUNG M30', 'M', 30, 'unknown'),
    ('MAMY POKO TIDAK GEMBUNG', 'BIG PACK', 'MP TIDAK GEMBUNG L28', 'L', 28, 'unknown'),
    ('MAMY POKO TIDAK GEMBUNG', 'BIG PACK', 'MP TIDAK GEMBUNG XL23', 'XL', 23, 'unknown'),
    ('MAMY POKO EKSTRA KERING', 'JUMBO', 'MP EK M48', 'M', 48, 'unknown'),
    ('MAMY POKO EKSTRA KERING', 'JUMBO', 'MP EK  L42', 'L', 42, 'unknown'),
    ('MAMY POKO EKSTRA KERING', 'JUMBO', 'MP EK XL38', 'XL', 38, 'unknown'),
    ('PARENTY MEDIUM FLOW', 'BIG PACK', 'MF M10', 'M', 10, 'unknown'),
    ('PARENTY MEDIUM FLOW', 'BIG PACK', 'MF L8', 'L', 8, 'unknown'),
    ('PARENTY MEDIUM FLOW', 'BIG PACK', 'MF XL8', 'XL', 8, 'unknown'),
    ('CONFIDENCE DAILY FRESH', 'BIG PACK', 'DAILY FRESH M9', 'M', 9, 'unknown'),
    ('CONFIDENCE DAILY FRESH', 'BIG PACK', 'DAILY FRESH L8', 'L', 8, 'unknown'),
    ('CONFIDENCE DAILY FRESH', 'BIG PACK', 'DAILY FRESH XL6', 'XL', 6, 'unknown'),
    ('PARENTY TAPE', 'BIG PACK', 'TAPE M8', 'M', 8, 'tape'),
    ('PARENTY TAPE', 'BIG PACK', 'TAPE L7', 'L', 7, 'tape'),
    ('PARENTY TAPE', 'BIG PACK', 'TAPE XL6', 'XL', 6, 'tape'),
    ('CONFIDENCE CLASSIC DAY', 'BIG PACK', 'TAPE M8', 'M', 8, 'tape'),
    ('CONFIDENCE CLASSIC DAY', 'BIG PACK', 'TAPE L7', 'L', 7, 'tape'),
    ('CONFIDENCE CLASSIC DAY', 'BIG PACK', 'TAPE XL6', 'XL', 6, 'tape'),
    ('PARENTY MEDIUM FLOW', 'BIG PACK', 'MF M10+4', 'M', 14, 'unknown'),
    ('PARENTY MEDIUM FLOW', 'BIG PACK', 'MF L8+4', 'L', 12, 'unknown'),
    ('PARENTY MEDIUM FLOW', 'BIG PACK', 'MF XL8+4', 'XL', 12, 'unknown'),
    ('SWEETY BRONZE', 'JUMBO', 'BRONZE L42', 'L', 42, 'unknown'),
    ('BABY HAPPY', 'JUMBO', 'BABY HAPPY XL26', 'XL', 26, 'unknown'),
    ('PARENTY MEDIUM FLOW', 'BIG PACK', 'MF XL8+4', 'XL', 8, 'unknown'),
    ('SWEETY SILVER', 'SUPER JUMBO', 'SWEETY SILVER XL44', 'XL', 42, 'unknown'),
    ('MAMY POKO EKSTRA KERING', 'JUMBO', 'MP EK XL36', 'XL', 38, 'unknown'),
    ('MAMY POKO TIDAK GEMBUNG', 'BIG PACK', 'MP TIDAK GEMBUNG M54', 'M', 54, 'unknown'),
    ('MAMY POKO TIDAK GEMBUNG', 'BIG PACK', 'MP TIDAK GEMBUNG L48', 'L', 48, 'unknown'),
    ('MAMY POKO TIDAK GEMBUNG', 'BIG PACK', 'MP TIDAK GEMBUNG XL40', 'XL', 40, 'unknown'),
    ('PARENTY MEDIUM FLOW', 'BIG PACK', 'MF M20+10', 'M', 30, 'unknown'),
    ('PARENTY MEDIUM FLOW', 'BIG PACK', 'MF L16+8', 'L', 24, 'unknown'),
    ('PARENTY MEDIUM FLOW', 'BIG PACK', 'MF XL14+8', 'XL', 22, 'unknown'),
    ('CONFIDENCE CLASSIC DAY', 'BIG PACK', 'TAPE M15', 'M', 15, 'tape'),
    ('CONFIDENCE CLASSIC DAY', 'BIG PACK', 'TAPE L15', 'L', 15, 'tape'),
    ('CONFIDENCE CLASSIC DAY', 'BIG PACK', 'TAPE XL15', 'XL', 15, 'tape'),
    ('SWEETY BRONZE', 'JUMBO', 'BRONZE L44', 'L', 42, 'unknown'),
    ('BABY HAPPY', 'JUMBO', 'BABY HAPPY XL36', 'XL', 36, 'unknown'),
    ('PARENTY MEDIUM FLOW', 'BIG PACK', 'MF M10+4', 'M', 10, 'unknown'),
    ('BABY HAPPY', 'JUMBO', 'BABY HAPPY XL36', 'XL', 38, 'unknown'),
    ('CONFIDENCE DAILY FRESH', 'BIG PACK', 'DAILY FRESH L8', 'L', 7, 'unknown'),
    ('BABY HAPPY', 'BIG PACK', 'BABY HAPPY M', 'M', 32, 'unknown'),
    ('BABY HAPPY', 'BIG PACK', 'BABY HAPPY L', 'L', 28, 'unknown'),
    ('BABY HAPPY', 'BIG PACK', 'BABY HAPPY XL26', 'XL', 26, 'unknown'),
    ('CONFIDENCE DAILY FRESH', 'BIG PACK', 'DAILY FRESH XL6', 'XL', null, 'unknown'),
    ('BABY HAPPY', 'JUMBO', 'BABY HAPPY M48', 'M', 32, 'unknown'),
    ('BABY HAPPY', 'JUMBO', 'BABY HAPPY L42', 'L', 28, 'unknown'),
    ('BABY HAPPY', 'BIG PACK', 'BABY HAPPY M', 'M', 30, 'unknown'),
    ('CONFIDENCE CLASSIC DAY', 'BIG PACK', 'TAPE M8', 'M', 15, 'tape'),
    ('CONFIDENCE CLASSIC DAY', 'BIG PACK', 'TAPE L7', 'L', 15, 'tape'),
    ('CONFIDENCE CLASSIC DAY', 'BIG PACK', 'TAPE XL6', 'XL', 15, 'tape')
),
matched_products as (
  select
    product.id,
    source_products.package_type
  from source_products
  join public.brands brand on lower(brand.name) = lower(source_products.brand_name)
  join public.competitor_products product
    on product.brand_id = brand.id
   and product.channel = 'manual'
   and product.normalized_name = source_products.product_name
   and product.size is not distinct from source_products.size
   and product.piece_count is not distinct from source_products.piece_count
)
update public.competitor_products product
set package_type = matched_products.package_type
from matched_products
where product.id = matched_products.id
  and product.package_type = 'unknown';

with source_products(brand_name, package_type, product_name, size, piece_count, pack_type) as (
  values
    ('SWEETY SILVER', 'SUPER JUMBO', 'SWEETY SILVER M60', 'M', 60, 'unknown'),
    ('SWEETY SILVER', 'SUPER JUMBO', 'SWEETY SILVER L54', 'L', 54, 'unknown'),
    ('SWEETY SILVER', 'SUPER JUMBO', 'SWEETY SILVER XL42', 'XL', 42, 'unknown'),
    ('SWEETY BRONZE', 'BIG PACK', 'BRONZE M32', 'M', 32, 'unknown'),
    ('SWEETY BRONZE', 'BIG PACK', 'BRONZE L28', 'L', 28, 'unknown'),
    ('SWEETY BRONZE', 'BIG PACK', 'BRONZE XL24', 'XL', 24, 'unknown'),
    ('SWEETY BRONZE', 'JUMBO', 'BRONZE M48', 'M', 48, 'unknown'),
    ('SWEETY BRONZE', 'JUMBO', 'BRONZE L44', 'L', 44, 'unknown'),
    ('SWEETY BRONZE', 'JUMBO', 'BRONZE XL38', 'XL', 38, 'unknown'),
    ('BABY HAPPY', 'JUMBO', 'BABY HAPPY M48', 'M', 48, 'unknown'),
    ('BABY HAPPY', 'JUMBO', 'BABY HAPPY L42', 'L', 42, 'unknown'),
    ('BABY HAPPY', 'JUMBO', 'BABY HAPPY XL38', 'XL', 38, 'unknown'),
    ('MAMY POKO TIDAK GEMBUNG', 'BIG PACK', 'MP TIDAK GEMBUNG M30', 'M', 30, 'unknown'),
    ('MAMY POKO TIDAK GEMBUNG', 'BIG PACK', 'MP TIDAK GEMBUNG L28', 'L', 28, 'unknown'),
    ('MAMY POKO TIDAK GEMBUNG', 'BIG PACK', 'MP TIDAK GEMBUNG XL23', 'XL', 23, 'unknown'),
    ('MAMY POKO EKSTRA KERING', 'JUMBO', 'MP EK M48', 'M', 48, 'unknown'),
    ('MAMY POKO EKSTRA KERING', 'JUMBO', 'MP EK  L42', 'L', 42, 'unknown'),
    ('MAMY POKO EKSTRA KERING', 'JUMBO', 'MP EK XL38', 'XL', 38, 'unknown'),
    ('PARENTY MEDIUM FLOW', 'BIG PACK', 'MF M10', 'M', 10, 'unknown'),
    ('PARENTY MEDIUM FLOW', 'BIG PACK', 'MF L8', 'L', 8, 'unknown'),
    ('PARENTY MEDIUM FLOW', 'BIG PACK', 'MF XL8', 'XL', 8, 'unknown'),
    ('CONFIDENCE DAILY FRESH', 'BIG PACK', 'DAILY FRESH M9', 'M', 9, 'unknown'),
    ('CONFIDENCE DAILY FRESH', 'BIG PACK', 'DAILY FRESH L8', 'L', 8, 'unknown'),
    ('CONFIDENCE DAILY FRESH', 'BIG PACK', 'DAILY FRESH XL6', 'XL', 6, 'unknown'),
    ('PARENTY TAPE', 'BIG PACK', 'TAPE M8', 'M', 8, 'tape'),
    ('PARENTY TAPE', 'BIG PACK', 'TAPE L7', 'L', 7, 'tape'),
    ('PARENTY TAPE', 'BIG PACK', 'TAPE XL6', 'XL', 6, 'tape'),
    ('CONFIDENCE CLASSIC DAY', 'BIG PACK', 'TAPE M8', 'M', 8, 'tape'),
    ('CONFIDENCE CLASSIC DAY', 'BIG PACK', 'TAPE L7', 'L', 7, 'tape'),
    ('CONFIDENCE CLASSIC DAY', 'BIG PACK', 'TAPE XL6', 'XL', 6, 'tape'),
    ('PARENTY MEDIUM FLOW', 'BIG PACK', 'MF M10+4', 'M', 14, 'unknown'),
    ('PARENTY MEDIUM FLOW', 'BIG PACK', 'MF L8+4', 'L', 12, 'unknown'),
    ('PARENTY MEDIUM FLOW', 'BIG PACK', 'MF XL8+4', 'XL', 12, 'unknown'),
    ('SWEETY BRONZE', 'JUMBO', 'BRONZE L42', 'L', 42, 'unknown'),
    ('BABY HAPPY', 'JUMBO', 'BABY HAPPY XL26', 'XL', 26, 'unknown'),
    ('PARENTY MEDIUM FLOW', 'BIG PACK', 'MF XL8+4', 'XL', 8, 'unknown'),
    ('SWEETY SILVER', 'SUPER JUMBO', 'SWEETY SILVER XL44', 'XL', 42, 'unknown'),
    ('MAMY POKO EKSTRA KERING', 'JUMBO', 'MP EK XL36', 'XL', 38, 'unknown'),
    ('MAMY POKO TIDAK GEMBUNG', 'BIG PACK', 'MP TIDAK GEMBUNG M54', 'M', 54, 'unknown'),
    ('MAMY POKO TIDAK GEMBUNG', 'BIG PACK', 'MP TIDAK GEMBUNG L48', 'L', 48, 'unknown'),
    ('MAMY POKO TIDAK GEMBUNG', 'BIG PACK', 'MP TIDAK GEMBUNG XL40', 'XL', 40, 'unknown'),
    ('PARENTY MEDIUM FLOW', 'BIG PACK', 'MF M20+10', 'M', 30, 'unknown'),
    ('PARENTY MEDIUM FLOW', 'BIG PACK', 'MF L16+8', 'L', 24, 'unknown'),
    ('PARENTY MEDIUM FLOW', 'BIG PACK', 'MF XL14+8', 'XL', 22, 'unknown'),
    ('CONFIDENCE CLASSIC DAY', 'BIG PACK', 'TAPE M15', 'M', 15, 'tape'),
    ('CONFIDENCE CLASSIC DAY', 'BIG PACK', 'TAPE L15', 'L', 15, 'tape'),
    ('CONFIDENCE CLASSIC DAY', 'BIG PACK', 'TAPE XL15', 'XL', 15, 'tape'),
    ('SWEETY BRONZE', 'JUMBO', 'BRONZE L44', 'L', 42, 'unknown'),
    ('BABY HAPPY', 'JUMBO', 'BABY HAPPY XL36', 'XL', 36, 'unknown'),
    ('PARENTY MEDIUM FLOW', 'BIG PACK', 'MF M10+4', 'M', 10, 'unknown'),
    ('BABY HAPPY', 'JUMBO', 'BABY HAPPY XL36', 'XL', 38, 'unknown'),
    ('CONFIDENCE DAILY FRESH', 'BIG PACK', 'DAILY FRESH L8', 'L', 7, 'unknown'),
    ('BABY HAPPY', 'BIG PACK', 'BABY HAPPY M', 'M', 32, 'unknown'),
    ('BABY HAPPY', 'BIG PACK', 'BABY HAPPY L', 'L', 28, 'unknown'),
    ('BABY HAPPY', 'BIG PACK', 'BABY HAPPY XL26', 'XL', 26, 'unknown'),
    ('CONFIDENCE DAILY FRESH', 'BIG PACK', 'DAILY FRESH XL6', 'XL', null, 'unknown'),
    ('BABY HAPPY', 'JUMBO', 'BABY HAPPY M48', 'M', 32, 'unknown'),
    ('BABY HAPPY', 'JUMBO', 'BABY HAPPY L42', 'L', 28, 'unknown'),
    ('BABY HAPPY', 'BIG PACK', 'BABY HAPPY M', 'M', 30, 'unknown'),
    ('CONFIDENCE CLASSIC DAY', 'BIG PACK', 'TAPE M8', 'M', 15, 'tape'),
    ('CONFIDENCE CLASSIC DAY', 'BIG PACK', 'TAPE L7', 'L', 15, 'tape'),
    ('CONFIDENCE CLASSIC DAY', 'BIG PACK', 'TAPE XL6', 'XL', 15, 'tape')
)
insert into public.competitor_products (
  brand_id,
  raw_title,
  normalized_name,
  channel,
  shop_name,
  product_url,
  image_url,
  pack_type,
  size,
  piece_count,
  segment,
  package_type
)
select
  brand.id,
  source_products.product_name,
  source_products.product_name,
  'manual',
  null,
  null,
  null,
  source_products.pack_type,
  source_products.size,
  source_products.piece_count,
  'unknown',
  source_products.package_type
from source_products
join public.brands brand on lower(brand.name) = lower(source_products.brand_name)
where not exists (
  select 1
  from public.competitor_products product
  where product.brand_id = brand.id
    and product.channel = 'manual'
    and product.normalized_name = source_products.product_name
    and product.size is not distinct from source_products.size
    and product.piece_count is not distinct from source_products.piece_count
);

alter table public.competitor_products
  add column if not exists product_series text;

with parent_candidates as (
  select
    child.id as child_brand_id,
    parent.id as parent_brand_id,
    parent.name as parent_brand_name,
    row_number() over (
      partition by child.id
      order by length(parent.name) desc
    ) as rank
  from public.brands child
  join public.brands parent
    on child.id <> parent.id
   and lower(child.name) like lower(parent.name) || ' %'
),
resolved as (
  select
    product.id as product_id,
    product.brand_id as old_brand_id,
    candidate.parent_brand_id,
    nullif(trim(substring(old_brand.name from length(candidate.parent_brand_name) + 1)), '') as split_series
  from public.competitor_products product
  join public.brands old_brand on old_brand.id = product.brand_id
  join parent_candidates candidate
    on candidate.child_brand_id = old_brand.id
   and candidate.rank = 1
)
update public.competitor_products product
set
  brand_id = resolved.parent_brand_id,
  product_series = coalesce(nullif(product.product_series, ''), resolved.split_series)
from resolved
where product.id = resolved.product_id;

with unresolved as (
  select
    product.id as product_id,
    product.brand_id as old_brand_id,
    split_part(old_brand.name, ' ', 1) as parent_brand_name,
    nullif(trim(substring(old_brand.name from length(split_part(old_brand.name, ' ', 1)) + 1)), '') as split_series
  from public.competitor_products product
  join public.brands old_brand on old_brand.id = product.brand_id
  where old_brand.is_own_brand = false
    and old_brand.name like '% %'
    and product.id not in (
      select product_id from (
        select
          product.id as product_id
        from public.competitor_products product
        join public.brands old_brand on old_brand.id = product.brand_id
        join public.brands parent
          on old_brand.id <> parent.id
         and lower(old_brand.name) like lower(parent.name) || ' %'
      ) matched
    )
),
inserted_brands as (
  insert into public.brands (name, country, is_own_brand)
  select distinct parent_brand_name, 'Indonesia', false
  from unresolved
  where parent_brand_name <> ''
    and not exists (
      select 1
      from public.brands existing
      where lower(existing.name) = lower(unresolved.parent_brand_name)
    )
  returning id, name
),
all_parent_brands as (
  select id, name from public.brands
  union
  select id, name from inserted_brands
)
update public.competitor_products product
set
  brand_id = parent.id,
  product_series = coalesce(nullif(product.product_series, ''), unresolved.split_series)
from unresolved
join all_parent_brands parent
  on lower(parent.name) = lower(unresolved.parent_brand_name)
where product.id = unresolved.product_id;

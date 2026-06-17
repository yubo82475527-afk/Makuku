create unique index if not exists ux_competitor_products_competitor_sku_code
  on public.competitor_products(competitor_sku_code)
  where competitor_sku_code is not null;

create or replace function public.competitor_brand_code_prefix(input_brand_id uuid)
returns text
language sql
stable
as $$
  with current_brand as (
    select
      id,
      coalesce(nullif(regexp_replace(upper(name), '[^A-Z0-9]', '', 'g'), ''), 'CP') as clean_name
    from public.brands
    where id = input_brand_id
  ),
  duplicated as (
    select exists (
      select 1
      from public.brands brand
      cross join current_brand current
      where brand.id <> current.id
        and left(coalesce(nullif(regexp_replace(upper(brand.name), '[^A-Z0-9]', '', 'g'), ''), 'CP'), 2) = left(current.clean_name, 2)
    ) as has_duplicate
  )
  select
    case
      when (select has_duplicate from duplicated) then rpad(left(clean_name, 3), 3, 'X')
      else rpad(left(clean_name, 2), 2, 'X')
    end
  from current_brand;
$$;

with targets as (
  select
    product.id,
    public.competitor_brand_code_prefix(product.brand_id) as prefix,
    row_number() over (
      partition by public.competitor_brand_code_prefix(product.brand_id)
      order by product.created_at asc nulls last, product.id asc
    ) as rank
  from public.competitor_products product
  where nullif(trim(coalesce(product.competitor_sku_code, '')), '') is null
),
prefix_max as (
  select
    targets.prefix,
    coalesce(max(substring(product.competitor_sku_code from length(targets.prefix) + 1)::int), 0) as max_no
  from targets
  left join public.competitor_products product
    on product.competitor_sku_code ~ ('^' || targets.prefix || '[0-9]{5}$')
  group by targets.prefix
)
update public.competitor_products product
set competitor_sku_code = targets.prefix || lpad((prefix_max.max_no + targets.rank)::text, 5, '0')
from targets
join prefix_max on prefix_max.prefix = targets.prefix
where product.id = targets.id;

create or replace function public.assign_competitor_sku_code()
returns trigger
language plpgsql
as $$
declare
  prefix text;
  next_no integer;
begin
  if nullif(trim(coalesce(new.competitor_sku_code, '')), '') is not null then
    return new;
  end if;

  prefix := public.competitor_brand_code_prefix(new.brand_id);
  perform pg_advisory_xact_lock(hashtext('competitor_sku_code:' || prefix));

  select coalesce(max(substring(competitor_sku_code from length(prefix) + 1)::int), 0) + 1
  into next_no
  from public.competitor_products
  where competitor_sku_code ~ ('^' || prefix || '[0-9]{5}$');

  new.competitor_sku_code := prefix || lpad(next_no::text, 5, '0');
  return new;
end;
$$;

drop trigger if exists trg_assign_competitor_sku_code on public.competitor_products;

create trigger trg_assign_competitor_sku_code
before insert on public.competitor_products
for each row
execute function public.assign_competitor_sku_code();

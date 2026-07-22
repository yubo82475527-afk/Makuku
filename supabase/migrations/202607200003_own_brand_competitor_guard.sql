begin;

update public.brands
set is_own_brand = true
where lower(trim(name)) in (
  select distinct lower(trim(brand))
  from public.material_master
  where trim(brand) <> ''
);

create or replace function public.reject_own_brand_competitor_product()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' or new.brand_id is distinct from old.brand_id then
    if exists (
      select 1
      from public.brands
      where id = new.brand_id
        and is_own_brand = true
    ) then
      raise exception 'Own brand cannot be stored as a competitor product';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists reject_own_brand_competitor_product on public.competitor_products;
create trigger reject_own_brand_competitor_product
before insert or update of brand_id on public.competitor_products
for each row execute function public.reject_own_brand_competitor_product();

commit;

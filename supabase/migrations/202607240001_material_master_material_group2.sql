-- Sales-defined product classification (Material Group2 / 产品分类2).
-- Distinct from sub_brand, which is the brand-defined series.
alter table public.material_master
  add column if not exists material_group2 text;

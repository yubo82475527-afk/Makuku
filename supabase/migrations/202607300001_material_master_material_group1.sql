-- Sales-defined product classification (Material Group1 / 产品分类1).
-- Distinct from sub_brand (brand-defined) and sibling to material_group2.
alter table public.material_master
  add column if not exists material_group1 text;

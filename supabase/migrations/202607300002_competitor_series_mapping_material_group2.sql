-- Map competitor series to one or more sales-defined material_group2 values (GPL2).
-- Replaces brand-defined target_makuku_series (sub_brand). Existing rules are deactivated
-- because old values are sub_brand names and must be reconfigured against material_group2.

alter table public.competitor_series_mappings
  add column if not exists target_material_group2s text[];

update public.competitor_series_mappings
set target_material_group2s = array[target_makuku_series]
where target_material_group2s is null
  and target_makuku_series is not null
  and length(trim(target_makuku_series)) > 0;

update public.competitor_series_mappings
set target_material_group2s = '{}'::text[]
where target_material_group2s is null;

-- Old targets were sub_brand values; deactivate so business reconfigures against GPL2.
update public.competitor_series_mappings
set
  active = false,
  is_default_benchmark = false,
  updated_at = now();

alter table public.competitor_series_mappings
  alter column target_material_group2s set default '{}'::text[],
  alter column target_material_group2s set not null;

alter table public.competitor_series_mappings
  drop column if exists target_makuku_series;

-- Array element uniqueness for default benchmark cannot be enforced in a simple unique index.
drop index if exists public.uniq_competitor_series_mappings_default_benchmark;

alter table public.competitor_series_mappings
  add column if not exists is_default_benchmark boolean not null default false;

update public.competitor_series_mappings
set is_default_benchmark = false
where is_default_benchmark is null;

create unique index if not exists uniq_competitor_series_mappings_default_benchmark
  on public.competitor_series_mappings(lower(target_makuku_series))
  where active = true and is_default_benchmark = true;

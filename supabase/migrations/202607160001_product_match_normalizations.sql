create table if not exists public.product_match_normalizations (
  id uuid primary key default gen_random_uuid(),
  field text not null check (field in ('brand', 'series', 'size', 'piece_count')),
  brand_scope text,
  source_value text not null,
  canonical_value text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create unique index if not exists uniq_active_product_match_normalizations
  on public.product_match_normalizations (
    field,
    lower(coalesce(trim(brand_scope), '')),
    lower(regexp_replace(trim(source_value), '\\s+', ' ', 'g'))
  )
  where active = true;

create index if not exists idx_product_match_normalizations_active
  on public.product_match_normalizations(field, active);

alter table public.product_match_normalizations enable row level security;

drop policy if exists "authenticated read product_match_normalizations" on public.product_match_normalizations;
drop policy if exists "authenticated insert product_match_normalizations" on public.product_match_normalizations;
drop policy if exists "authenticated update product_match_normalizations" on public.product_match_normalizations;

create policy "authenticated read product_match_normalizations"
  on public.product_match_normalizations for select to authenticated using (true);
create policy "authenticated insert product_match_normalizations"
  on public.product_match_normalizations for insert to authenticated with check (true);
create policy "authenticated update product_match_normalizations"
  on public.product_match_normalizations for update to authenticated using (true) with check (true);

insert into public.product_match_normalizations (field, brand_scope, source_value, canonical_value)
values
  ('brand', null, 'MAMYPOKO', 'MAMY POKO'),
  ('brand', null, 'SWETY', 'SWEETY'),
  ('series', null, 'DRYCARE', 'Dry Care'),
  ('series', null, 'PROCARE', 'Pro Care'),
  ('series', null, 'COMFORTFIT', 'Comfort Fit'),
  ('series', null, 'COMFIT', 'Comfort Fit'),
  ('series', null, 'CF', 'Comfort Fit'),
  ('series', null, 'SKINHEALTH', 'Skin Health'),
  ('series', null, 'SH', 'Skin Health'),
  ('series', null, 'SLIMCARE', 'Slim Care'),
  ('series', null, 'MEDIUMFLOW', 'Middle Flow'),
  ('series', null, 'HEAVYFLOW', 'Heavy Flow'),
  ('series', null, 'ROYALSOFT', 'ROYAL SOFT'),
  ('series', null, 'GOLD SERIES', 'GOLD'),
  ('series', null, 'PREMIUM', 'ROYAL SOFT'),
  ('series', null, 'ANTIBOCOR', 'ANTI BOCOR'),
  ('series', null, 'DAUNSIRIH', 'DAUN SIRIH'),
  ('series', null, 'CLASSICNIGHT', 'CLASSIC NIGHT'),
  ('series', null, 'CLASSICDAY', 'CLASSIC DAY'),
  ('series', null, 'CLASICDAY', 'CLASSIC DAY'),
  ('size', null, 'MEDIUM', 'M'),
  ('size', null, 'LARGE', 'L'),
  ('size', null, 'EXTRA LARGE', 'XL'),
  ('size', null, '3XL', 'XXXL'),
  ('size', null, 'NBS', 'NB-S'),
  ('size', null, 'NB S', 'NB-S'),
  ('size', null, 'NB NB S', 'NB')
on conflict do nothing;

create table if not exists public.competitor_series_mappings (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  product_series text,
  target_makuku_series text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create unique index if not exists uniq_active_competitor_series_mappings
  on public.competitor_series_mappings(brand_id, lower(coalesce(product_series, '')))
  where active = true;

create index if not exists idx_competitor_series_mappings_brand
  on public.competitor_series_mappings(brand_id);

alter table public.competitor_series_mappings enable row level security;

drop policy if exists "authenticated read competitor_series_mappings" on public.competitor_series_mappings;
drop policy if exists "authenticated insert competitor_series_mappings" on public.competitor_series_mappings;
drop policy if exists "authenticated update competitor_series_mappings" on public.competitor_series_mappings;
drop policy if exists "authenticated delete competitor_series_mappings" on public.competitor_series_mappings;

create policy "authenticated read competitor_series_mappings"
  on public.competitor_series_mappings for select
  to authenticated
  using (true);

create policy "authenticated insert competitor_series_mappings"
  on public.competitor_series_mappings for insert
  to authenticated
  with check (true);

create policy "authenticated update competitor_series_mappings"
  on public.competitor_series_mappings for update
  to authenticated
  using (true)
  with check (true);

create policy "authenticated delete competitor_series_mappings"
  on public.competitor_series_mappings for delete
  to authenticated
  using (true);

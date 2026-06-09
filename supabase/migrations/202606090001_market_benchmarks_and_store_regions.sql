alter table public.offline_stores
  add column if not exists province text,
  add column if not exists city_name text,
  add column if not exists district text;

alter table public.offline_store_visits
  add column if not exists province text,
  add column if not exists city_name text,
  add column if not exists district text;

create index if not exists idx_offline_stores_region
  on public.offline_stores(province, city_name, district);

create index if not exists idx_offline_store_visits_region
  on public.offline_store_visits(province, city_name, district);

create table if not exists public.market_benchmarks (
  id uuid primary key default gen_random_uuid(),
  market text not null default 'Indonesia',
  province text,
  city_name text,
  district text,
  category text not null default 'Diapers',
  product_line text not null,
  price_band text not null,
  size text not null,
  benchmark_competitor_product_id uuid references public.competitor_products(id) on delete set null,
  benchmark_sku_name text not null,
  benchmark_price_per_piece numeric(14, 4) not null check (benchmark_price_per_piece > 0),
  currency text not null default 'IDR',
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create unique index if not exists uniq_market_benchmarks_active_segment
  on public.market_benchmarks(
    market,
    coalesce(province, ''),
    coalesce(city_name, ''),
    coalesce(district, ''),
    category,
    product_line,
    price_band,
    size
  )
  where active;

create index if not exists idx_market_benchmarks_segment
  on public.market_benchmarks(market, category, product_line, price_band, size);

alter table public.market_benchmarks enable row level security;

do $$
begin
  execute 'drop policy if exists "authenticated read market_benchmarks" on public.market_benchmarks';
  execute 'drop policy if exists "authenticated insert market_benchmarks" on public.market_benchmarks';
  execute 'drop policy if exists "authenticated update market_benchmarks" on public.market_benchmarks';

  execute 'create policy "authenticated read market_benchmarks" on public.market_benchmarks for select to authenticated using (true)';
  execute 'create policy "authenticated insert market_benchmarks" on public.market_benchmarks for insert to authenticated with check (true)';
  execute 'create policy "authenticated update market_benchmarks" on public.market_benchmarks for update to authenticated using (true) with check (true)';
end;
$$;

create table if not exists public.market_benchmark_rules (
  id uuid primary key default gen_random_uuid(),
  market text not null default 'Indonesia',
  province text not null,
  city_name text not null,
  district text,
  brand_id uuid not null references public.brands(id) on delete cascade,
  product_series text,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create unique index if not exists uniq_market_benchmark_rules_active_scope
  on public.market_benchmark_rules(
    market,
    lower(province),
    lower(city_name),
    lower(coalesce(district, '')),
    brand_id,
    lower(coalesce(product_series, ''))
  )
  where active;

create index if not exists idx_market_benchmark_rules_region
  on public.market_benchmark_rules(market, province, city_name, district);

create table if not exists public.market_benchmark_period_prices (
  id uuid primary key default gen_random_uuid(),
  benchmark_rule_id uuid not null references public.market_benchmark_rules(id) on delete cascade,
  period_type text not null check (period_type in ('week', 'month')),
  start_date date not null,
  end_date date not null,
  benchmark_price_per_piece numeric(14, 4) not null check (benchmark_price_per_piece > 0),
  sample_count integer not null default 0 check (sample_count >= 0),
  currency text not null default 'IDR',
  status text not null default 'calculated' check (status in ('calculated', 'carried_forward')),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  check (end_date >= start_date)
);

create unique index if not exists uniq_market_benchmark_period_prices_period
  on public.market_benchmark_period_prices(benchmark_rule_id, period_type, start_date, end_date);

create index if not exists idx_market_benchmark_period_prices_lookup
  on public.market_benchmark_period_prices(period_type, start_date, end_date, status);

truncate table public.market_benchmarks;

alter table public.market_benchmark_rules enable row level security;
alter table public.market_benchmark_period_prices enable row level security;

do $$
begin
  execute 'drop policy if exists "authenticated read market_benchmark_rules" on public.market_benchmark_rules';
  execute 'drop policy if exists "authenticated insert market_benchmark_rules" on public.market_benchmark_rules';
  execute 'drop policy if exists "authenticated update market_benchmark_rules" on public.market_benchmark_rules';
  execute 'drop policy if exists "authenticated read market_benchmark_period_prices" on public.market_benchmark_period_prices';
  execute 'drop policy if exists "authenticated insert market_benchmark_period_prices" on public.market_benchmark_period_prices';
  execute 'drop policy if exists "authenticated update market_benchmark_period_prices" on public.market_benchmark_period_prices';

  execute 'create policy "authenticated read market_benchmark_rules" on public.market_benchmark_rules for select to authenticated using (true)';
  execute 'create policy "authenticated insert market_benchmark_rules" on public.market_benchmark_rules for insert to authenticated with check (true)';
  execute 'create policy "authenticated update market_benchmark_rules" on public.market_benchmark_rules for update to authenticated using (true) with check (true)';
  execute 'create policy "authenticated read market_benchmark_period_prices" on public.market_benchmark_period_prices for select to authenticated using (true)';
  execute 'create policy "authenticated insert market_benchmark_period_prices" on public.market_benchmark_period_prices for insert to authenticated with check (true)';
  execute 'create policy "authenticated update market_benchmark_period_prices" on public.market_benchmark_period_prices for update to authenticated using (true) with check (true)';
end;
$$;

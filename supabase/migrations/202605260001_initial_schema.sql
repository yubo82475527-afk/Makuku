create extension if not exists pgcrypto;

create table if not exists public.brands (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  country text not null default 'Indonesia',
  is_own_brand boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.material_master (
  tenant_sku_code text primary key,
  tenant_sku_name text not null,
  category text not null,
  sub_category text not null,
  brand text not null,
  sub_brand text,
  type text,
  sub_type text,
  pack_count integer not null check (pack_count > 0),
  box_count integer not null check (box_count > 0),
  pcs_price numeric(14, 4) not null check (pcs_price >= 0),
  f_expiry_date timestamptz not null
);

create table if not exists public.competitor_products (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  raw_title text not null,
  normalized_name text not null,
  channel text not null check (channel in ('shopee','tiktok','offline','manual')),
  shop_name text,
  product_url text,
  image_url text,
  pack_type text not null default 'unknown' check (pack_type in ('pants','tape','unknown')),
  size text,
  piece_count integer check (piece_count > 0),
  segment text not null default 'unknown' check (segment in ('premium','mid','value','unknown')),
  created_at timestamptz not null default now()
);

create table if not exists public.sku_master (
  id uuid primary key default gen_random_uuid(),
  makuku_sku_name text not null,
  pack_type text not null check (pack_type in ('pants','tape','unknown')),
  size text not null,
  piece_count integer not null check (piece_count > 0),
  segment text not null check (segment in ('premium','mid','value','unknown')),
  target_price_per_piece numeric not null check (target_price_per_piece > 0),
  floor_price_per_piece numeric not null check (floor_price_per_piece > 0),
  gross_margin_rate numeric not null check (gross_margin_rate >= 0 and gross_margin_rate <= 1),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.sku_matches (
  id uuid primary key default gen_random_uuid(),
  competitor_product_id uuid not null references public.competitor_products(id) on delete cascade,
  sku_master_id uuid not null references public.sku_master(id) on delete cascade,
  match_score numeric not null default 0 check (match_score >= 0 and match_score <= 1),
  match_method text not null check (match_method in ('rule','ai','manual')),
  reviewed boolean not null default false,
  created_at timestamptz not null default now(),
  unique (competitor_product_id, sku_master_id)
);

create table if not exists public.price_snapshots (
  id uuid primary key default gen_random_uuid(),
  competitor_product_id uuid not null references public.competitor_products(id) on delete cascade,
  channel text not null check (channel in ('shopee','tiktok','offline','manual')),
  list_price_idr numeric not null check (list_price_idr >= 0),
  promo_price_idr numeric not null check (promo_price_idr >= 0),
  voucher_value_idr numeric not null default 0 check (voucher_value_idr >= 0),
  shipping_subsidy_idr numeric not null default 0 check (shipping_subsidy_idr >= 0),
  net_price_idr numeric check (net_price_idr >= 0),
  price_per_piece numeric check (price_per_piece >= 0),
  promo_type text,
  captured_at timestamptz not null default now(),
  source text,
  evidence_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.offline_uploads (
  id uuid primary key default gen_random_uuid(),
  uploader_name text not null,
  city text not null,
  store_name text not null,
  channel_type text not null,
  image_path text not null,
  image_url text,
  upload_status text not null default 'uploaded' check (upload_status in ('uploaded','ocr_processing','ocr_done','reviewed','rejected')),
  created_at timestamptz not null default now()
);

create table if not exists public.offline_ocr_results (
  id uuid primary key default gen_random_uuid(),
  upload_id uuid not null references public.offline_uploads(id) on delete cascade,
  detected_brand text,
  detected_product text,
  detected_price_idr numeric,
  detected_promo_text text,
  detected_piece_count integer,
  confidence_score numeric check (confidence_score >= 0 and confidence_score <= 1),
  reviewed boolean not null default false,
  corrected_brand text,
  corrected_product text,
  corrected_price_idr numeric,
  corrected_piece_count integer,
  created_at timestamptz not null default now()
);

create table if not exists public.promo_events (
  id uuid primary key default gen_random_uuid(),
  competitor_product_id uuid not null references public.competitor_products(id) on delete cascade,
  sku_master_id uuid references public.sku_master(id) on delete set null,
  channel text not null check (channel in ('shopee','tiktok','offline','manual')),
  event_type text not null check (event_type in ('price_drop','flash_sale','voucher','bundle','offline_display','buy_more_save','unknown')),
  event_title text not null,
  event_summary text,
  old_price_per_piece numeric,
  new_price_per_piece numeric,
  price_gap_vs_makuku_pct numeric,
  severity text not null check (severity in ('low','medium','high','critical')),
  city text,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  evidence_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.ai_strategy_recommendations (
  id uuid primary key default gen_random_uuid(),
  promo_event_id uuid not null references public.promo_events(id) on delete cascade,
  risk_level text not null check (risk_level in ('low','medium','high','critical')),
  impact_summary text not null,
  recommended_actions jsonb not null default '[]'::jsonb,
  suggested_price_per_piece numeric,
  margin_impact_summary text,
  confidence_score numeric check (confidence_score >= 0 and confidence_score <= 1),
  status text not null default 'draft' check (status in ('draft','accepted','rejected','edited')),
  reviewer_note text,
  created_at timestamptz not null default now()
);

create table if not exists public.alert_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  rule_type text not null check (rule_type in ('price_gap','price_drop','new_promo','offline_event')),
  threshold numeric,
  channel text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.alerts (
  id uuid primary key default gen_random_uuid(),
  promo_event_id uuid references public.promo_events(id) on delete cascade,
  alert_rule_id uuid references public.alert_rules(id) on delete set null,
  title text not null,
  message text not null,
  severity text not null check (severity in ('low','medium','high','critical')),
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_competitor_products_brand_channel on public.competitor_products(brand_id, channel);
create index if not exists idx_material_master_brand_category on public.material_master(brand, category, sub_category);
create index if not exists idx_material_master_name on public.material_master(tenant_sku_name);
create index if not exists idx_sku_matches_product on public.sku_matches(competitor_product_id);
create index if not exists idx_price_snapshots_product_time on public.price_snapshots(competitor_product_id, captured_at desc);
create index if not exists idx_promo_events_time_severity on public.promo_events(started_at desc, severity);
create index if not exists idx_alerts_read_created on public.alerts(read, created_at desc);

create or replace function public.normalize_price_snapshot()
returns trigger
language plpgsql
as $$
declare
  product_piece_count integer;
begin
  select piece_count into product_piece_count
  from public.competitor_products
  where id = new.competitor_product_id;

  new.net_price_idr := greatest(coalesce(new.promo_price_idr, 0) - coalesce(new.voucher_value_idr, 0) - coalesce(new.shipping_subsidy_idr, 0), 0);

  if product_piece_count is not null and product_piece_count > 0 then
    new.price_per_piece := round(new.net_price_idr / product_piece_count, 2);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_normalize_price_snapshot on public.price_snapshots;
create trigger trg_normalize_price_snapshot
before insert or update on public.price_snapshots
for each row execute function public.normalize_price_snapshot();

alter table public.brands enable row level security;
alter table public.material_master enable row level security;
alter table public.competitor_products enable row level security;
alter table public.sku_master enable row level security;
alter table public.sku_matches enable row level security;
alter table public.price_snapshots enable row level security;
alter table public.offline_uploads enable row level security;
alter table public.offline_ocr_results enable row level security;
alter table public.promo_events enable row level security;
alter table public.ai_strategy_recommendations enable row level security;
alter table public.alert_rules enable row level security;
alter table public.alerts enable row level security;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'brands',
    'material_master',
    'competitor_products',
    'sku_master',
    'sku_matches',
    'price_snapshots',
    'offline_uploads',
    'offline_ocr_results',
    'promo_events',
    'ai_strategy_recommendations',
    'alert_rules',
    'alerts'
  ]
  loop
    execute format('drop policy if exists "authenticated read %1$s" on public.%1$I', table_name);
    execute format('drop policy if exists "authenticated insert %1$s" on public.%1$I', table_name);
    execute format('drop policy if exists "authenticated update %1$s" on public.%1$I', table_name);

    execute format('create policy "authenticated read %1$s" on public.%1$I for select to authenticated using (true)', table_name);
    execute format('create policy "authenticated insert %1$s" on public.%1$I for insert to authenticated with check (true)', table_name);
    execute format('create policy "authenticated update %1$s" on public.%1$I for update to authenticated using (true) with check (true)', table_name);
  end loop;
end;
$$;

insert into storage.buckets (id, name, public)
values ('offline-uploads', 'offline-uploads', true)
on conflict (id) do nothing;

drop policy if exists "authenticated read offline uploads" on storage.objects;
drop policy if exists "authenticated upload offline uploads" on storage.objects;
drop policy if exists "authenticated update offline uploads" on storage.objects;

create policy "authenticated read offline uploads"
on storage.objects for select to authenticated
using (bucket_id = 'offline-uploads');

create policy "authenticated upload offline uploads"
on storage.objects for insert to authenticated
with check (bucket_id = 'offline-uploads');

create policy "authenticated update offline uploads"
on storage.objects for update to authenticated
using (bucket_id = 'offline-uploads')
with check (bucket_id = 'offline-uploads');

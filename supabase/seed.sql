insert into public.brands (id, name, country, is_own_brand) values
  ('00000000-0000-4000-8000-000000000001', 'Makuku', 'Indonesia', true),
  ('00000000-0000-4000-8000-000000000002', 'MamyPoko', 'Indonesia', false),
  ('00000000-0000-4000-8000-000000000003', 'Sweety', 'Indonesia', false),
  ('00000000-0000-4000-8000-000000000004', 'Merries', 'Indonesia', false),
  ('00000000-0000-4000-8000-000000000005', 'Goo.N', 'Indonesia', false),
  ('00000000-0000-4000-8000-000000000006', 'Pampers', 'Indonesia', false)
on conflict (id) do nothing;

insert into public.material_master (
  tenant_sku_code,
  tenant_sku_name,
  category,
  sub_category,
  brand,
  sub_brand,
  type,
  sub_type,
  pack_count,
  box_count,
  pcs_price,
  f_expiry_date
) values (
  '14013011601',
  'MAKUKU Air Diapers Comfort Fit Tape NB40',
  'BC',
  'Tape',
  'MAKUKU',
  'Comfort Fit',
  'Jumbo pack',
  'NB',
  40,
  6,
  1553.75,
  '2100-01-01T00:00:00'
)
on conflict (tenant_sku_code) do update set
  tenant_sku_name = excluded.tenant_sku_name,
  category = excluded.category,
  sub_category = excluded.sub_category,
  brand = excluded.brand,
  sub_brand = excluded.sub_brand,
  type = excluded.type,
  sub_type = excluded.sub_type,
  pack_count = excluded.pack_count,
  box_count = excluded.box_count,
  pcs_price = excluded.pcs_price,
  f_expiry_date = excluded.f_expiry_date;

insert into public.sku_master (id, makuku_sku_name, pack_type, size, piece_count, segment, target_price_per_piece, floor_price_per_piece, gross_margin_rate) values
  ('10000000-0000-4000-8000-000000000001','Makuku Slim Pants S34','pants','S',34,'premium',2450,2150,0.34),
  ('10000000-0000-4000-8000-000000000002','Makuku Slim Pants M32','pants','M',32,'premium',2550,2250,0.34),
  ('10000000-0000-4000-8000-000000000003','Makuku Slim Pants L30','pants','L',30,'premium',2650,2350,0.35),
  ('10000000-0000-4000-8000-000000000004','Makuku Slim Pants XL28','pants','XL',28,'premium',2800,2480,0.35),
  ('10000000-0000-4000-8000-000000000005','Makuku Slim Pants XXL24','pants','XXL',24,'premium',3050,2700,0.36),
  ('10000000-0000-4000-8000-000000000006','Makuku Comfort Pants M34','pants','M',34,'mid',2200,1980,0.31),
  ('10000000-0000-4000-8000-000000000007','Makuku Comfort Pants L32','pants','L',32,'mid',2300,2050,0.31),
  ('10000000-0000-4000-8000-000000000008','Makuku Comfort Pants XL30','pants','XL',30,'mid',2450,2180,0.32),
  ('10000000-0000-4000-8000-000000000009','Makuku Comfort Pants XXL26','pants','XXL',26,'mid',2700,2400,0.32),
  ('10000000-0000-4000-8000-000000000010','Makuku Value Pants M36','pants','M',36,'value',1950,1780,0.26),
  ('10000000-0000-4000-8000-000000000011','Makuku Value Pants L34','pants','L',34,'value',2050,1850,0.26),
  ('10000000-0000-4000-8000-000000000012','Makuku Value Pants XL32','pants','XL',32,'value',2150,1950,0.27),
  ('10000000-0000-4000-8000-000000000013','Makuku Tape NB44','tape','NB',44,'premium',2300,2050,0.33),
  ('10000000-0000-4000-8000-000000000014','Makuku Tape S40','tape','S',40,'premium',2350,2080,0.33),
  ('10000000-0000-4000-8000-000000000015','Makuku Tape M36','tape','M',36,'premium',2450,2180,0.34),
  ('10000000-0000-4000-8000-000000000016','Makuku Tape L32','tape','L',32,'premium',2600,2320,0.34),
  ('10000000-0000-4000-8000-000000000017','Makuku Tape XL28','tape','XL',28,'premium',2850,2540,0.35),
  ('10000000-0000-4000-8000-000000000018','Makuku Air Pants M30','pants','M',30,'premium',2750,2440,0.37),
  ('10000000-0000-4000-8000-000000000019','Makuku Air Pants L28','pants','L',28,'premium',2920,2600,0.37),
  ('10000000-0000-4000-8000-000000000020','Makuku Air Pants XL26','pants','XL',26,'premium',3150,2800,0.38)
on conflict (id) do nothing;

insert into public.competitor_products (id, brand_id, raw_title, normalized_name, channel, shop_name, product_url, image_url, pack_type, size, piece_count, segment) values
  ('20000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','MamyPoko Pants Royal Soft S34','Royal Soft Pants S34','shopee','MamyPoko Official','https://shopee.co.id/mamypoko-s34',null,'pants','S',34,'premium'),
  ('20000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002','MamyPoko Pants Royal Soft M32','Royal Soft Pants M32','shopee','MamyPoko Official','https://shopee.co.id/mamypoko-m32',null,'pants','M',32,'premium'),
  ('20000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000002','MamyPoko Extra Dry L30','Extra Dry Pants L30','shopee','MamyPoko Official','https://shopee.co.id/mamypoko-l30',null,'pants','L',30,'mid'),
  ('20000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000002','MamyPoko Extra Dry XL28','Extra Dry Pants XL28','offline','Hypermart Bekasi',null,null,'pants','XL',28,'mid'),
  ('20000000-0000-4000-8000-000000000005','00000000-0000-4000-8000-000000000003','Sweety Gold Pants M34','Gold Pants M34','shopee','Sweety Official','https://shopee.co.id/sweety-m34',null,'pants','M',34,'mid'),
  ('20000000-0000-4000-8000-000000000006','00000000-0000-4000-8000-000000000003','Sweety Gold Pants L32','Gold Pants L32','shopee','Sweety Official','https://shopee.co.id/sweety-l32',null,'pants','L',32,'mid'),
  ('20000000-0000-4000-8000-000000000007','00000000-0000-4000-8000-000000000003','Sweety Bronze Pants XL32','Bronze Pants XL32','offline','Alfamart Jakarta',null,null,'pants','XL',32,'value'),
  ('20000000-0000-4000-8000-000000000008','00000000-0000-4000-8000-000000000003','Sweety Silver Pants XXL26','Silver Pants XXL26','shopee','Sweety Official','https://shopee.co.id/sweety-xxl26',null,'pants','XXL',26,'value'),
  ('20000000-0000-4000-8000-000000000009','00000000-0000-4000-8000-000000000004','Merries Good Skin Pants S34','Good Skin Pants S34','shopee','Merries Official','https://shopee.co.id/merries-s34',null,'pants','S',34,'premium'),
  ('20000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000004','Merries Good Skin Pants M32','Good Skin Pants M32','shopee','Merries Official','https://shopee.co.id/merries-m32',null,'pants','M',32,'premium'),
  ('20000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000004','Merries Pants L30','Merries Pants L30','offline','Transmart Bandung',null,null,'pants','L',30,'premium'),
  ('20000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000004','Merries Tape NB44','Tape NB44','shopee','Merries Official','https://shopee.co.id/merries-nb44',null,'tape','NB',44,'premium'),
  ('20000000-0000-4000-8000-000000000013','00000000-0000-4000-8000-000000000005','Goo.N Premium Pants M32','Premium Pants M32','shopee','GooN Official','https://shopee.co.id/goon-m32',null,'pants','M',32,'premium'),
  ('20000000-0000-4000-8000-000000000014','00000000-0000-4000-8000-000000000005','Goo.N Smile Baby L30','Smile Baby Pants L30','shopee','GooN Official','https://shopee.co.id/goon-l30',null,'pants','L',30,'mid'),
  ('20000000-0000-4000-8000-000000000015','00000000-0000-4000-8000-000000000005','Goo.N Smile Baby XL28','Smile Baby Pants XL28','offline','Indomaret Surabaya',null,null,'pants','XL',28,'mid'),
  ('20000000-0000-4000-8000-000000000016','00000000-0000-4000-8000-000000000005','Goo.N Tape S40','Tape S40','shopee','GooN Official','https://shopee.co.id/goon-s40',null,'tape','S',40,'mid'),
  ('20000000-0000-4000-8000-000000000017','00000000-0000-4000-8000-000000000006','Pampers Premium Care Pants M32','Premium Care Pants M32','shopee','Pampers Official','https://shopee.co.id/pampers-m32',null,'pants','M',32,'premium'),
  ('20000000-0000-4000-8000-000000000018','00000000-0000-4000-8000-000000000006','Pampers Premium Care Pants L30','Premium Care Pants L30','shopee','Pampers Official','https://shopee.co.id/pampers-l30',null,'pants','L',30,'premium'),
  ('20000000-0000-4000-8000-000000000019','00000000-0000-4000-8000-000000000006','Pampers Baby Dry Pants XL30','Baby Dry Pants XL30','offline','Lottemart Jakarta',null,null,'pants','XL',30,'mid'),
  ('20000000-0000-4000-8000-000000000020','00000000-0000-4000-8000-000000000006','Pampers Tape M36','Tape M36','shopee','Pampers Official','https://shopee.co.id/pampers-tape-m36',null,'tape','M',36,'premium'),
  ('20000000-0000-4000-8000-000000000021','00000000-0000-4000-8000-000000000002','MamyPoko Tape L32','Tape L32','shopee','MamyPoko Official','https://shopee.co.id/mamypoko-tape-l32',null,'tape','L',32,'premium'),
  ('20000000-0000-4000-8000-000000000022','00000000-0000-4000-8000-000000000003','Sweety Tape XL28','Tape XL28','manual','Manual Entry',null,null,'tape','XL',28,'mid'),
  ('20000000-0000-4000-8000-000000000023','00000000-0000-4000-8000-000000000004','Merries Pants XL28','Merries Pants XL28','shopee','Merries Official','https://shopee.co.id/merries-xl28',null,'pants','XL',28,'premium'),
  ('20000000-0000-4000-8000-000000000024','00000000-0000-4000-8000-000000000005','Goo.N Pants XXL24','Premium Pants XXL24','tiktok','GooN TikTok Shop',null,null,'pants','XXL',24,'premium'),
  ('20000000-0000-4000-8000-000000000025','00000000-0000-4000-8000-000000000006','Pampers Pants S34','Premium Care Pants S34','tiktok','Pampers TikTok Shop',null,null,'pants','S',34,'premium')
on conflict (id) do nothing;

insert into public.sku_matches (competitor_product_id, sku_master_id, match_score, match_method, reviewed)
select p.id, s.id,
  case when p.segment = s.segment then 0.92 else 0.84 end,
  'rule',
  p.channel <> 'tiktok'
from public.competitor_products p
join public.sku_master s on s.pack_type = p.pack_type and s.size = p.size and abs(s.piece_count - p.piece_count) <= 2
on conflict (competitor_product_id, sku_master_id) do nothing;

insert into public.price_snapshots (competitor_product_id, channel, list_price_idr, promo_price_idr, voucher_value_idr, shipping_subsidy_idr, promo_type, captured_at, source, evidence_url)
select p.id, p.channel,
  p.piece_count * (case p.segment when 'premium' then 2850 when 'mid' then 2450 else 2150 end),
  p.piece_count * (case p.segment when 'premium' then 2600 when 'mid' then 2250 else 1980 end) - ((n % 3) * 2500),
  case when n in (2,5,7) then 12000 else 5000 end,
  case when n in (3,6) then 8000 else 0 end,
  case when n in (1,5) then 'flash_sale voucher' when n in (3,7) then 'bundle' else 'voucher' end,
  now() - (n || ' days')::interval,
  'seed',
  coalesce(p.product_url, 'offline-photo://seed')
from public.competitor_products p
cross join generate_series(1,7) as n
where p.id <= '20000000-0000-4000-8000-000000000012';

insert into public.promo_events (id, competitor_product_id, sku_master_id, channel, event_type, event_title, event_summary, old_price_per_piece, new_price_per_piece, price_gap_vs_makuku_pct, severity, city, started_at, evidence_url) values
  ('30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','shopee','flash_sale','MamyPoko M32 flash sale under Makuku floor','Shopee flash sale combined with voucher pushes price below Makuku floor price.',2780,2120,-16.9,'critical',null,now() - interval '2 hours','https://shopee.co.id/mamypoko-m32'),
  ('30000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000006','10000000-0000-4000-8000-000000000007','shopee','price_drop','Sweety L32 voucher stack price drop','Voucher stack created a 10% price-per-piece drop versus prior snapshot.',2380,2090,-9.1,'high',null,now() - interval '6 hours','https://shopee.co.id/sweety-l32'),
  ('30000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000011','10000000-0000-4000-8000-000000000003','offline','offline_display','Merries offline gondola display in Bandung','Field team observed front gondola display with discounted shelf price.',2680,2320,-12.5,'high','Bandung',now() - interval '8 hours','offline-photo://merries-bandung'),
  ('30000000-0000-4000-8000-000000000004','20000000-0000-4000-8000-000000000013','10000000-0000-4000-8000-000000000002','shopee','voucher','Goo.N M32 monthly voucher','Competitor voucher keeps price slightly below Makuku target.',2700,2360,-7.5,'medium',null,now() - interval '1 day','https://shopee.co.id/goon-m32'),
  ('30000000-0000-4000-8000-000000000005','20000000-0000-4000-8000-000000000019','10000000-0000-4000-8000-000000000008','offline','buy_more_save','Pampers XL30 buy more save in Jakarta','Offline chain offers multi-pack discount for XL size.',2500,2260,-7.8,'medium','Jakarta',now() - interval '2 days','offline-photo://pampers-jakarta'),
  ('30000000-0000-4000-8000-000000000006','20000000-0000-4000-8000-000000000009','10000000-0000-4000-8000-000000000001','shopee','bundle','Merries S34 bundle pack','Bundle discount is visible but remains above Makuku floor.',2520,2310,-5.7,'low',null,now() - interval '3 days','https://shopee.co.id/merries-s34'),
  ('30000000-0000-4000-8000-000000000007','20000000-0000-4000-8000-000000000017','10000000-0000-4000-8000-000000000002','shopee','price_drop','Pampers M32 rapid price drop','Premium Care price dropped more than 8% within 24 hours.',2860,2390,-6.3,'medium',null,now() - interval '4 days','https://shopee.co.id/pampers-m32')
on conflict (id) do nothing;

insert into public.ai_strategy_recommendations (promo_event_id, risk_level, impact_summary, recommended_actions, suggested_price_per_piece, margin_impact_summary, confidence_score, status) values
  ('30000000-0000-4000-8000-000000000001','critical','MamyPoko is below Makuku floor on a core M-size premium SKU, likely to pull high-intent Shopee traffic during the next 48 hours.','[{"channel":"Shopee","action":"Set a 48-hour limited voucher on matched M32 SKU","reason":"Close the perceived price gap without permanently changing list price","priority":"high"},{"channel":"TikTok","action":"Prepare live bundle for M-size trial packs","reason":"Intercept shoppers who compare across marketplaces","priority":"medium"},{"channel":"Offline","action":"Check display compliance in top Jakarta baby stores","reason":"Prevent online promo spillover perception from weakening offline shelf conversion","priority":"medium"}]'::jsonb,2180,'Suggested price stays near floor; monitor margin before extending beyond 48 hours.',0.78,'draft'),
  ('30000000-0000-4000-8000-000000000002','high','Sweety is using stacked vouchers against Makuku mid-tier L-size pants.','[{"channel":"Shopee","action":"Add L32 search booster and controlled voucher","reason":"Defend ranking while avoiding broad discounting","priority":"high"}]'::jsonb,2120,'Limited voucher should protect contribution margin.',0.72,'accepted'),
  ('30000000-0000-4000-8000-000000000003','high','Offline display pressure in Bandung could affect weekly sell-out for premium L-size SKUs.','[{"channel":"Offline","action":"Deploy display material and promoter brief to Bandung priority stores","reason":"The threat is location-specific and should be answered in-store","priority":"high"}]'::jsonb,2360,'No direct price cut required unless repeated in two more stores.',0.7,'draft');

insert into public.alert_rules (id, name, rule_type, threshold, channel, active) values
  ('40000000-0000-4000-8000-000000000001','Price gap below -8%','price_gap',-8,null,true),
  ('40000000-0000-4000-8000-000000000002','Price drop above 8%','price_drop',8,'shopee',true),
  ('40000000-0000-4000-8000-000000000003','Offline high-risk event','offline_event',null,'offline',true)
on conflict (id) do nothing;

insert into public.alerts (promo_event_id, alert_rule_id, title, message, severity, read) values
  ('30000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','Critical Shopee price gap','MamyPoko M32 is 16.9% cheaper than Makuku target and below floor price.','critical',false),
  ('30000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000002','Sweety L32 price drop','Sweety L32 price per piece dropped more than 8%.','high',false),
  ('30000000-0000-4000-8000-000000000003','40000000-0000-4000-8000-000000000003','Bandung offline display','Merries offline display event requires field follow-up.','high',true);

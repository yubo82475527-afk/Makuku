import type {
  AiStrategyRecommendation,
  Alert,
  Brand,
  ChannelMaster,
  CompetitorProduct,
  CompetitorSeriesMapping,
  MarketBenchmark,
  MarketBenchmarkRule,
  MaterialMaster,
  OfflineStore,
  OfflineStoreVisit,
  OfflineUpload,
  PriceSnapshot,
  PromoEvent,
  SkuMaster,
} from "@/lib/types";

const now = Date.now();
const iso = (hoursAgo: number) => new Date(now - hoursAgo * 60 * 60 * 1000).toISOString();

export const demoChannels: ChannelMaster[] = [
  ["ch-shopee", "shopee", "Shopee", "online", 10],
  ["ch-tiktok", "tiktok", "TikTok", "online", 20],
  ["ch-baby-shop", "BABY SHOP", "BABY SHOP", "offline", 30],
  ["ch-bs", "BS", "BS", "offline", 40],
  ["ch-lka", "LKA", "LKA", "offline", 50],
  ["ch-lka-bs", "LKA BS", "LKA BS", "offline", 60],
  ["ch-modern-trade", "MODERN TRADE", "MODERN TRADE", "offline", 70],
  ["ch-mt-lka-babyshop", "MT-LKA-BABYSHOP", "MT-LKA-BABYSHOP", "offline", 80],
  ["ch-mt-lka-supermarket", "MT-LKA-SUPERMARKET", "MT-LKA-SUPERMARKET", "offline", 90],
  ["ch-nka", "NKA", "NKA", "offline", 100],
].map(([id, code, name, type, sort_order]) => ({
  id,
  code,
  name,
  type,
  sort_order,
  active: true,
  created_at: iso(240),
}) as ChannelMaster);

export const demoBrands: Brand[] = [
  { id: "b1", name: "Makuku", country: "Indonesia", is_own_brand: true, created_at: iso(240) },
  { id: "b2", name: "MamyPoko", country: "Indonesia", is_own_brand: false, created_at: iso(240) },
  { id: "b3", name: "Sweety", country: "Indonesia", is_own_brand: false, created_at: iso(240) },
  { id: "b4", name: "Merries", country: "Indonesia", is_own_brand: false, created_at: iso(240) },
  { id: "b5", name: "Goo.N", country: "Indonesia", is_own_brand: false, created_at: iso(240) },
  { id: "b6", name: "Pampers", country: "Indonesia", is_own_brand: false, created_at: iso(240) },
];

export const demoSkuMaster: SkuMaster[] = [
  ["s1", "Makuku Slim Pants S34", "pants", "S", 34, "BD MID", 2450, 2150, 0.34],
  ["s2", "Makuku Slim Pants M32", "pants", "M", 32, "BD MID", 2550, 2250, 0.34],
  ["s3", "Makuku Slim Pants L30", "pants", "L", 30, "BD MID", 2650, 2350, 0.35],
  ["s4", "Makuku Slim Pants XL28", "pants", "XL", 28, "BD MID", 2800, 2480, 0.35],
  ["s5", "Makuku Slim Pants XXL24", "pants", "XXL", 24, "BD MID", 3050, 2700, 0.36],
  ["s6", "Makuku Comfort Pants M34", "pants", "M", 34, "BD MID", 2200, 1980, 0.31],
  ["s7", "Makuku Comfort Pants L32", "pants", "L", 32, "BD MID", 2300, 2050, 0.31],
  ["s8", "Makuku Comfort Pants XL30", "pants", "XL", 30, "BD MID", 2450, 2180, 0.32],
  ["s9", "Makuku Comfort Pants XXL26", "pants", "XXL", 26, "BD MID", 2700, 2400, 0.32],
  ["s10", "Makuku Value Pants M36", "pants", "M", 36, "BD Eco", 1950, 1780, 0.26],
  ["s11", "Makuku Value Pants L34", "pants", "L", 34, "BD Eco", 2050, 1850, 0.26],
  ["s12", "Makuku Value Pants XL32", "pants", "XL", 32, "BD Eco", 2150, 1950, 0.27],
  ["s13", "Makuku Tape NB44", "tape", "NB", 44, "BD MID", 2300, 2050, 0.33],
  ["s14", "Makuku Tape S40", "tape", "S", 40, "BD MID", 2350, 2080, 0.33],
  ["s15", "Makuku Tape M36", "tape", "M", 36, "BD MID", 2450, 2180, 0.34],
  ["s16", "Makuku Tape L32", "tape", "L", 32, "BD MID", 2600, 2320, 0.34],
  ["s17", "Makuku Tape XL28", "tape", "XL", 28, "BD MID", 2850, 2540, 0.35],
  ["s18", "Makuku Air Pants M30", "pants", "M", 30, "BD MID", 2750, 2440, 0.37],
  ["s19", "Makuku Air Pants L28", "pants", "L", 28, "BD MID", 2920, 2600, 0.37],
  ["s20", "Makuku Air Pants XL26", "pants", "XL", 26, "BD MID", 3150, 2800, 0.38],
].map(([id, makuku_sku_name, pack_type, size, piece_count, segment, target_price_per_piece, floor_price_per_piece, gross_margin_rate]) => ({
  id,
  makuku_sku_name,
  pack_type,
  size,
  piece_count,
  segment,
  target_price_per_piece,
  floor_price_per_piece,
  gross_margin_rate,
  active: true,
  created_at: iso(200),
}) as SkuMaster);

export const demoMaterialMaster: MaterialMaster[] = demoSkuMaster.map((sku, index) => {
  const skuName = sku.makuku_sku_name;
  const subBrand = skuName.includes("Comfort")
    ? "Comfort"
    : skuName.includes("Value")
      ? "Value"
      : skuName.includes("Air")
        ? "Air"
        : "Slim";
  return {
    tenant_sku_code: `DEMO-${String(index + 1).padStart(3, "0")}`,
    tenant_sku_name: skuName,
    category: "Diapers",
    sub_category: sku.pack_type === "tape" ? "Tape" : "Pants",
    brand: "Makuku",
    sub_brand: subBrand,
    material_group1: subBrand === "Comfort" || subBrand === "Slim" ? "Core" : "Value",
    material_group2: subBrand === "Comfort"
      ? "Comfort Pack"
      : subBrand === "Slim"
        ? "Slim Pack"
        : subBrand === "Value"
          ? "Value Pack"
          : "Air Pack",
    type: sku.pack_type,
    sub_type: sku.size,
    pack_count: sku.piece_count,
    box_count: 1,
    pcs_price: sku.target_price_per_piece,
    f_expiry_date: "2099-12-31",
  };
});

export const demoOfflineStores: OfflineStore[] = [
  {
    id: "demo-store-jakarta",
    name: "Jakarta Baby Care - Kelapa Gading",
    city: "DKI Jakarta / Jakarta / Kelapa Gading",
    province: "DKI Jakarta",
    city_name: "Jakarta",
    district: "Kelapa Gading",
    channel_type: "baby_store",
    channel_id: "ch-baby-store",
    address: "Kelapa Gading, Jakarta",
    created_at: iso(72),
    channels: demoChannels.find((channel) => channel.code === "baby_store") ?? null,
  },
  {
    id: "demo-store-surabaya",
    name: "Surabaya Modern Trade - Pakuwon",
    city: "Jawa Timur / Surabaya / Pakuwon",
    province: "Jawa Timur",
    city_name: "Surabaya",
    district: "Pakuwon",
    channel_type: "modern_trade",
    channel_id: "ch-modern-trade",
    address: "Pakuwon City, Surabaya",
    created_at: iso(72),
    channels: demoChannels.find((channel) => channel.code === "modern_trade") ?? null,
  },
];

export const demoCompetitors: CompetitorProduct[] = [
  ["c1", "b2", "Royal Soft", "MamyPoko Pants Royal Soft M32", "Royal Soft Pants M32", "shopee", "MamyPoko Official", "pants", "M", 32, "BD MID"],
  ["c2", "b3", "Gold", "Sweety Gold Pants L32", "Gold Pants L32", "shopee", "Sweety Official", "pants", "L", 32, "BD MID"],
  ["c3", "b4", null, "Merries Pants L30", "Merries Pants L30", "offline", "Transmart Bandung", "pants", "L", 30, "BD MID"],
  ["c4", "b5", "Premium", "Goo.N Premium Pants M32", "Premium Pants M32", "shopee", "GooN Official", "pants", "M", 32, "BD MID"],
  ["c5", "b6", "Baby Dry", "Pampers Baby Dry Pants XL30", "Baby Dry Pants XL30", "offline", "Lottemart Jakarta", "pants", "XL", 30, "BD MID"],
  ["c6", "b4", "Tape", "Merries Tape NB44", "Tape NB44", "shopee", "Merries Official", "tape", "NB", 44, "BD MID"],
  ["c7", "b2", "Tape", "MamyPoko Tape L32", "Tape L32", "shopee", "MamyPoko Official", "tape", "L", 32, "BD MID"],
  ["c8", "b6", "Premium Care", "Pampers Premium Care S34", "Premium Care Pants S34", "tiktok", "Pampers TikTok Shop", "pants", "S", 34, "BD MID"],
].map(([id, brand_id, product_series, raw_title, normalized_name, channel, shop_name, pack_type, size, piece_count, segment]) => ({
  id,
  brand_id,
  product_series,
  raw_title,
  normalized_name,
  channel,
  shop_name,
  product_url: channel === "shopee" ? `https://shopee.co.id/${id}` : null,
  image_url: null,
  pack_type,
  package_type: "unknown",
  size,
  piece_count,
  segment,
  created_at: iso(160),
  brands: demoBrands.find((brand) => brand.id === brand_id) ?? null,
}) as CompetitorProduct);

export const demoCompetitorSeriesMappings: CompetitorSeriesMapping[] = [
  {
    id: "series-map-1",
    brand_id: "b2",
    product_series: "Royal Soft",
    target_material_group2s: ["Slim Pack"],
    is_default_benchmark: true,
    active: true,
    created_at: iso(80),
    updated_at: null,
    brands: demoBrands.find((brand) => brand.id === "b2") ?? null,
  },
  {
    id: "series-map-2",
    brand_id: "b3",
    product_series: "Gold",
    target_material_group2s: ["Comfort Pack", "Air Pack"],
    is_default_benchmark: false,
    active: true,
    created_at: iso(78),
    updated_at: null,
    brands: demoBrands.find((brand) => brand.id === "b3") ?? null,
  },
];

export const demoPriceSnapshots: PriceSnapshot[] = [
  ["p1", "c1", "shopee", 93400, 80600, 8000, 4800, "flash_sale voucher", 2],
  ["p2", "c2", "shopee", 78000, 73000, 4500, 1600, "voucher", 6],
  ["p3", "c3", "offline", 80400, 73500, 3900, 0, "offline display", 8],
  ["p4", "c4", "shopee", 91000, 81500, 6000, 0, "monthly voucher", 16],
  ["p5", "c5", "offline", 75000, 70800, 3000, 0, "buy_more_save", 36],
  ["p6", "c6", "shopee", 106000, 99000, 5000, 0, "bundle", 42],
].map(([id, competitor_product_id, channel, list_price_idr, promo_price_idr, voucher_value_idr, shipping_subsidy_idr, promo_type, hoursAgo]) => {
  const product = demoCompetitors.find((item) => item.id === competitor_product_id) ?? null;
  const net = Number(promo_price_idr) - Number(voucher_value_idr) - Number(shipping_subsidy_idr);
  return {
    id,
    competitor_product_id,
    channel,
    list_price_idr,
    promo_price_idr,
    voucher_value_idr,
    shipping_subsidy_idr,
    net_price_idr: net,
    price_per_piece: product?.piece_count ? Math.round((net / product.piece_count) * 100) / 100 : net,
    promo_type,
    captured_at: iso(Number(hoursAgo)),
    source: "pilot-sample",
    evidence_url: product?.product_url,
    created_at: iso(Number(hoursAgo)),
    competitor_products: product,
  } as PriceSnapshot;
});

export const demoMarketBenchmarks: MarketBenchmark[] = [
];

export const demoMarketBenchmarkRules: MarketBenchmarkRule[] = [
  {
    id: "mbr1",
    market: "Indonesia",
    province: "DKI Jakarta",
    city_name: "Jakarta",
    district: "Kelapa Gading",
    brand_id: "b2",
    product_series: "Royal Soft",
    active: true,
    notes: "Demo regional benchmark",
    created_at: iso(120),
    updated_at: null,
    brands: demoBrands.find((brand) => brand.id === "b2") ?? null,
    market_benchmark_period_prices: [
      {
        id: "mbp1",
        benchmark_rule_id: "mbr1",
        period_type: "week",
        start_date: "2026-06-01",
        end_date: "2026-06-07",
        benchmark_price_per_piece: 2600,
        sample_count: 3,
        currency: "IDR",
        status: "calculated",
        created_at: iso(120),
        updated_at: null,
      },
    ],
  },
  {
    id: "mbr2",
    market: "Indonesia",
    province: "Jawa Timur",
    city_name: "Surabaya",
    district: null,
    brand_id: "b3",
    product_series: "Gold",
    active: true,
    notes: null,
    created_at: iso(100),
    updated_at: null,
    brands: demoBrands.find((brand) => brand.id === "b3") ?? null,
    market_benchmark_period_prices: [
      {
        id: "mbp2",
        benchmark_rule_id: "mbr2",
        period_type: "week",
        start_date: "2026-06-08",
        end_date: "2026-06-14",
        benchmark_price_per_piece: 2300,
        sample_count: 0,
        currency: "IDR",
        status: "carried_forward",
        created_at: iso(72),
        updated_at: null,
      },
    ],
  },
];

export const demoPromoEvents: PromoEvent[] = [
  ["e1", "c1", "s2", "shopee", "flash_sale", "MamyPoko M32 flash sale under floor", "Flash sale plus voucher pushes M32 below Makuku floor.", 2780, 2120, -16.9, "critical", null, 2],
  ["e2", "c2", "s7", "shopee", "price_drop", "Sweety L32 voucher stack price drop", "Voucher stack created a 10% drop versus prior snapshot.", 2380, 2090, -9.1, "high", null, 6],
  ["e3", "c3", "s3", "offline", "offline_display", "Merries offline gondola display in Bandung", "Field team observed front gondola display with discounted shelf price.", 2680, 2320, -12.5, "high", "Bandung", 8],
  ["e4", "c4", "s2", "shopee", "voucher", "Goo.N M32 monthly voucher", "Price is slightly below Makuku target but above floor.", 2700, 2360, -7.5, "medium", null, 24],
  ["e5", "c5", "s8", "offline", "buy_more_save", "Pampers XL30 buy more save in Jakarta", "Offline chain offers a multi-pack discount.", 2500, 2260, -7.8, "medium", "Jakarta", 48],
].map(([id, competitor_product_id, sku_master_id, channel, event_type, event_title, event_summary, old_price_per_piece, new_price_per_piece, price_gap_vs_makuku_pct, severity, city, hoursAgo]) => ({
  id,
  competitor_product_id,
  sku_master_id,
  channel,
  event_type,
  event_title,
  event_summary,
  old_price_per_piece,
  new_price_per_piece,
  price_gap_vs_makuku_pct,
  severity,
  city,
  started_at: iso(Number(hoursAgo)),
  ended_at: null,
  evidence_url: `pilot-evidence://${id}`,
  created_at: iso(Number(hoursAgo)),
  competitor_products: demoCompetitors.find((item) => item.id === competitor_product_id) ?? null,
  sku_master: demoSkuMaster.find((item) => item.id === sku_master_id) ?? null,
  ai_strategy_recommendations: [],
}) as PromoEvent);

export const demoAiRecommendations: AiStrategyRecommendation[] = [
  {
    id: "ai1",
    promo_event_id: "e1",
    risk_level: "critical",
    impact_summary: "MamyPoko is below Makuku floor on a core M-size premium SKU, likely to pull high-intent Shopee traffic for 48 hours.",
    recommended_actions: [
      { channel: "Shopee", action: "Set a 48-hour limited voucher", reason: "Close the perceived price gap without changing list price.", priority: "high" },
      { channel: "TikTok", action: "Prepare live bundle for M-size trial packs", reason: "Intercept shoppers comparing marketplaces.", priority: "medium" },
      { channel: "Offline", action: "Check display compliance in priority stores", reason: "Avoid online promo spillover weakening shelf conversion.", priority: "medium" },
    ],
    suggested_price_per_piece: 2180,
    margin_impact_summary: "Stay near floor and cap the campaign at 48 hours.",
    confidence_score: 0.78,
    status: "draft",
    reviewer_note: null,
    created_at: iso(1),
  },
  {
    id: "ai2",
    promo_event_id: "e2",
    risk_level: "high",
    impact_summary: "Sweety is using stacked vouchers against Makuku mid-tier L-size pants.",
    recommended_actions: [
      { channel: "Shopee", action: "Add L32 search booster and controlled voucher", reason: "Defend ranking without broad discounting.", priority: "high" },
    ],
    suggested_price_per_piece: 2120,
    margin_impact_summary: "Limited voucher should protect contribution margin.",
    confidence_score: 0.72,
    status: "accepted",
    reviewer_note: null,
    created_at: iso(4),
  },
];

demoPromoEvents.forEach((event) => {
  event.ai_strategy_recommendations = demoAiRecommendations.filter((item) => item.promo_event_id === event.id);
});

export const demoOfflineUploads: OfflineUpload[] = [
  {
    id: "u1",
    uploader_name: "Rina",
    city: "Jawa Barat / Bandung / Buah Batu",
    store_name: "Transmart Buah Batu",
    channel_type: "hypermarket",
    image_path: "demo/merries-bandung.jpg",
    image_url: null,
    upload_status: "ocr_done",
    created_at: iso(5),
    offline_ocr_results: [{
      id: "ocr1",
      upload_id: "u1",
      detected_brand: "Merries",
      detected_product: "Merries Pants L30",
      detected_price_idr: 69600,
      detected_promo_text: "Gondola discount",
      detected_piece_count: 30,
      confidence_score: 0.82,
      reviewed: false,
      corrected_brand: null,
      corrected_product: null,
      corrected_price_idr: null,
      corrected_piece_count: null,
      created_at: iso(5),
    }],
  },
  {
    id: "u2",
    uploader_name: "Dimas",
    city: "DKI Jakarta / Jakarta / Kelapa Gading",
    store_name: "Lottemart Kelapa Gading",
    channel_type: "modern_trade",
    image_path: "demo/pampers-jakarta.jpg",
    image_url: null,
    upload_status: "uploaded",
    created_at: iso(18),
    offline_ocr_results: [],
  },
];

export const demoOfflineStoreVisits: OfflineStoreVisit[] = [
  {
    id: "v1",
    store_name: "Transmart Buah Batu",
    city: "Jawa Barat / Bandung / Buah Batu",
    province: "Jawa Barat",
    city_name: "Bandung",
    district: "Buah Batu",
    channel_type: "modern_trade",
    store_id: "demo-store-surabaya",
    channel_id: "ch-modern-trade",
    uploader_name: "Rina",
    visit_date: new Date(now - 4 * 60 * 60 * 1000).toISOString().slice(0, 10),
    visit_status: "analyzed",
    summary_result: {
      detected_brand_count: 2,
      detected_product_count: 2,
      needs_human_review: true,
    },
    created_at: iso(4),
    offline_visit_images: [
      {
        id: "vi1",
        visit_id: "v1",
        image_type: "competitor_shelf",
        image_path: "demo/transmart/competitor.jpg",
        image_url: null,
        file_name: "competitor-shelf.jpg",
        content_type: "image/jpeg",
        file_size: 512000,
        analysis_status: "analyzed",
        uploaded_at: iso(4),
        created_at: iso(4),
        error_message: null,
        vision_result: {
          schema_version: "offline_image_vision_v1",
          image_type: "competitor_shelf",
          image_quality: "good",
          needs_human_review: true,
          review_reasons: ["Confirm piece count from shelf tag"],
          detected_products: [
            {
              brand_name: "Merries",
              product_name_raw: "Merries Pants L30",
              product_name_normalized: "Merries Pants L30",
              pack_type: "pants",
              size: "L",
              piece_count: 30,
              bundle_count: 1,
              total_piece_count: 30,
              list_price_idr: 78900,
              promo_price_idr: 69900,
              promo_mechanic: "offline_display",
              promo_text_raw: "Special price shelf promo",
              confidence: { brand: 0.92, product: 0.84, price: 0.9, piece_count: 0.7 },
            },
          ],
          overall_confidence: 0.82,
        },
      },
      {
        id: "vi2",
        visit_id: "v1",
        image_type: "own_shelf",
        image_path: "demo/transmart/own.jpg",
        image_url: null,
        file_name: "own-shelf.jpg",
        content_type: "image/jpeg",
        file_size: 428000,
        analysis_status: "pending",
        vision_result: null,
        error_message: null,
        uploaded_at: iso(3.8),
        created_at: iso(3.8),
      },
    ],
  },
];

export const demoAlerts: Alert[] = [
  {
    id: "a1",
    promo_event_id: "e1",
    alert_rule_id: "r1",
    title: "Critical Shopee price gap",
    message: "MamyPoko M32 is 16.9% cheaper than Makuku target and below floor price.",
    severity: "critical",
    read: false,
    created_at: iso(1),
    promo_events: demoPromoEvents[0],
  },
  {
    id: "a2",
    promo_event_id: "e2",
    alert_rule_id: "r2",
    title: "Sweety L32 price drop",
    message: "Sweety L32 price per piece dropped more than 8%.",
    severity: "high",
    read: false,
    created_at: iso(4),
    promo_events: demoPromoEvents[1],
  },
  {
    id: "a3",
    promo_event_id: "e3",
    alert_rule_id: "r3",
    title: "Bandung offline display",
    message: "Merries offline display event requires field follow-up.",
    severity: "high",
    read: true,
    created_at: iso(8),
    promo_events: demoPromoEvents[2],
  },
];

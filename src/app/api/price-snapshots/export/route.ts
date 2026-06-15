import { formatIdr, formatJakartaTime, formatPricePerPiece } from "@/lib/format";
import { createSupabaseServiceClient } from "@/lib/supabase";
import type { PriceSnapshot } from "@/lib/types";

const csvColumns = {
  zh: [
    "采集时间",
    "商品类型",
    "品牌",
    "商品",
    "渠道",
    "标价",
    "包装价",
    "券",
    "到手价",
    "单片价",
    "SKU ID",
    "门店名称",
    "省",
    "市",
    "区",
    "采集人",
    "创建时间",
  ],
  en: [
    "Captured",
    "Product Type",
    "Brand",
    "Product",
    "Channel",
    "List",
    "Package",
    "Voucher",
    "Net",
    "IDR/pc",
    "SKU ID",
    "Store",
    "Province",
    "City",
    "District",
    "Collector",
    "Create Time",
  ],
};

function csvEscape(value: string | number | null | undefined) {
  const text = value === null || value === undefined ? "" : String(value);
  if (!/[",\r\n]/.test(text)) return text;
  return `"${text.replaceAll('"', '""')}"`;
}

function downloadName() {
  const date = new Date().toISOString().slice(0, 10);
  return `price-snapshots-${date}.csv`;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const owner = normalizeOwner(searchParams.get("owner"));
    const brand = searchParams.get("brand");
    const sku = searchParams.get("sku");
    const line = searchParams.get("line");
    const priceBand = searchParams.get("priceBand");
    const size = searchParams.get("size");
    const province = searchParams.get("province");
    const cityName = searchParams.get("cityName");
    const district = searchParams.get("district");
    const store = searchParams.get("store");
    const locale = searchParams.get("locale") === "zh" ? "zh" : "en";
    const supabase = createSupabaseServiceClient();

    const { data, error } = await supabase
      .from("price_snapshots")
      .select("*, sku_master(*), offline_stores(id,name,city,province,city_name,district,channel_type), competitor_products(*, brands(id,name), sku_matches(*, sku_master(*))), ai_price_candidates(id, offline_store_visits(id,store_name,city,province,city_name,district,channel_type,visit_date,uploader_name,created_at))")
      .order("captured_at", { ascending: false })
      .limit(5000);
    if (error) return Response.json({ error: error.message }, { status: 500 });

    const snapshots = applyOwnerFilter((data ?? []) as PriceSnapshot[], owner).filter((snapshot) => {
      const product = snapshot.competitor_products;
      const skuMaster = snapshotMakukuSku(snapshot);
      const productSegment = product ? resolveProductSegment(product) : { line: "Unknown", size: "Unknown" };
      const productLine = skuMaster ? productLineLabel(skuMaster.pack_type) : productSegment.line;
      const productSize = skuMaster?.size ?? productSegment.size;
      const productPriceBand = skuMaster?.segment ?? product?.segment ?? "unknown";
      if (brand && product?.brand_id !== brand) return false;
      if (sku && !matchesText(snapshotMakukuMaterialCode(snapshot), sku)) return false;
      if (line && productLine !== line) return false;
      if (priceBand && productPriceBand !== priceBand) return false;
      if (size && productSize !== size) return false;
      const region = storeRegionForSnapshot(snapshot);
      if (province && !matchesText(region.province, province)) return false;
      if (cityName && !matchesText(region.cityName, cityName)) return false;
      if (district && !matchesText(region.district, district)) return false;
      if (store && !matchesText(storeNameForSnapshot(snapshot), store)) return false;
      return true;
    });

    const rows = snapshots.map((snapshot) => {
      const region = storeRegionForSnapshot(snapshot);
      return [
        formatSnapshotCapturedAt(snapshot),
        ownerTypeLabel(snapshotOwnerType(snapshot), locale),
        snapshotBrandName(snapshot),
        snapshotProductName(snapshot),
        channelLabel(snapshot.channel, locale),
        formatIdr(snapshot.list_price_idr),
        formatIdr(snapshot.promo_price_idr),
        formatIdr(snapshot.voucher_value_idr),
        formatIdr(snapshot.net_price_idr),
        formatPricePerPiece(snapshot.price_per_piece),
        snapshotMakukuMaterialCode(snapshot),
        storeNameForSnapshot(snapshot),
        region.province ?? "-",
        region.cityName ?? "-",
        region.district ?? "-",
        uploaderNameForSnapshot(snapshot),
        formatSnapshotCreatedAt(snapshot),
      ].map(csvEscape).join(",");
    });

    const csv = [csvColumns[locale].map(csvEscape).join(","), ...rows].join("\r\n");
    return new Response(`\uFEFF${csv}`, {
      headers: {
        "Content-Type": "text/csv;charset=utf-8",
        "Content-Disposition": `attachment; filename="${downloadName()}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Export failed" }, { status: 500 });
  }
}

function normalizeOwner(value: string | null) {
  if (value === "makuku" || value === "competitor") return value;
  return "all";
}

function applyOwnerFilter(snapshots: PriceSnapshot[], owner: string) {
  if (owner === "makuku") return snapshots.filter((snapshot) => snapshotOwnerType(snapshot) === "makuku");
  if (owner === "competitor") return snapshots.filter((snapshot) => snapshotOwnerType(snapshot) === "competitor");
  return snapshots;
}

type PriceSnapshotForStoreRegion = {
  captured_at?: string | null;
  created_at?: string | null;
  source?: string | null;
  offline_stores?: {
    name?: string | null;
    city?: string | null;
    province?: string | null;
    city_name?: string | null;
    district?: string | null;
    channel_type?: string | null;
  } | null;
  competitor_products?: { shop_name?: string | null; normalized_name?: string | null } | null;
  ai_price_candidates?: {
    offline_store_visits?: {
      store_name?: string | null;
      city?: string | null;
      province?: string | null;
      city_name?: string | null;
      district?: string | null;
      visit_date?: string | null;
      uploader_name?: string | null;
    } | null;
  }[];
};

function snapshotOwnerType(snapshot: PriceSnapshot) {
  return snapshot.sku_master_id && !snapshot.competitor_product_id ? "makuku" : "competitor";
}

function snapshotMakukuSku(snapshot: PriceSnapshot) {
  return snapshot.sku_master ?? snapshot.competitor_products?.sku_matches?.[0]?.sku_master ?? null;
}

function snapshotMakukuMaterialCode(snapshot: PriceSnapshot) {
  return cleanDisplayText(snapshot.sku_master?.material_sku_code)
    ?? cleanDisplayText(snapshot.competitor_products?.sku_matches?.[0]?.sku_master?.material_sku_code)
    ?? "-";
}

function snapshotBrandName(snapshot: PriceSnapshot) {
  return snapshotOwnerType(snapshot) === "makuku" ? "Makuku" : snapshot.competitor_products?.brands?.name ?? "-";
}

function snapshotProductName(snapshot: PriceSnapshot) {
  return snapshotOwnerType(snapshot) === "makuku"
    ? snapshot.sku_master?.makuku_sku_name ?? "-"
    : snapshot.competitor_products?.normalized_name ?? "-";
}

function ownerTypeLabel(ownerType: string, locale: string) {
  if (ownerType === "makuku") return "Makuku SKU";
  return locale === "zh" ? "竞品商品" : "Competitor SKU";
}

function storeVisitForSnapshot(snapshot: PriceSnapshotForStoreRegion) {
  return snapshot.ai_price_candidates?.find((candidate) => candidate.offline_store_visits)?.offline_store_visits ?? null;
}

function storeNameForSnapshot(snapshot: PriceSnapshotForStoreRegion) {
  return cleanDisplayText(storeVisitForSnapshot(snapshot)?.store_name)
    ?? cleanDisplayText(snapshot.offline_stores?.name)
    ?? cleanDisplayText(snapshot.competitor_products?.shop_name)
    ?? "-";
}

function uploaderNameForSnapshot(snapshot: PriceSnapshotForStoreRegion) {
  if (String(snapshot.source ?? "").startsWith("excel_import")) return "Excel";
  return cleanDisplayText(storeVisitForSnapshot(snapshot)?.uploader_name) ?? "-";
}

function formatSnapshotCapturedAt(snapshot: PriceSnapshotForStoreRegion) {
  const visitDate = cleanDisplayText(storeVisitForSnapshot(snapshot)?.visit_date);
  if (visitDate) return visitDate.slice(0, 10);
  return formatJakartaTime(snapshot.captured_at);
}

function formatSnapshotCreatedAt(snapshot: PriceSnapshotForStoreRegion) {
  return formatJakartaTime(snapshot.created_at);
}

function channelLabel(value: string, locale: string) {
  if (value === "offline") return locale === "zh" ? "线下" : "Offline";
  if (value === "manual") return locale === "zh" ? "手工" : "Manual";
  if (value === "shopee") return "Shopee";
  if (value === "tiktok") return "TikTok";
  return value;
}

function storeRegionForSnapshot(snapshot: PriceSnapshotForStoreRegion) {
  const visit = storeVisitForSnapshot(snapshot);
  const store = snapshot.offline_stores;
  const legacyRegion = splitLegacyRegion(visit?.city);
  return {
    province: cleanDisplayText(visit?.province) ?? cleanDisplayText(store?.province) ?? legacyRegion.province,
    cityName: cleanDisplayText(visit?.city_name) ?? cleanDisplayText(store?.city_name) ?? legacyRegion.cityName ?? cleanDisplayText(store?.city),
    district: cleanDisplayText(visit?.district) ?? cleanDisplayText(store?.district) ?? legacyRegion.district,
  };
}

function cleanDisplayText(value: string | null | undefined) {
  const text = String(value ?? "").trim();
  return text && text !== "-" ? text : null;
}

function splitLegacyRegion(value: string | null | undefined) {
  const parts = String(value ?? "")
    .replaceAll("，", ",")
    .split(/[/>|,]/)
    .map((part) => cleanDisplayText(part))
    .filter(Boolean) as string[];
  if (parts.length >= 3) return { province: parts[0], cityName: parts[1], district: parts[2] };
  if (parts.length === 2) return { province: null, cityName: parts[0], district: parts[1] };
  if (parts.length === 1) return { province: null, cityName: parts[0], district: null };
  return { province: null, cityName: null, district: null };
}

function matchesText(value: string | null | undefined, query: string) {
  return String(value ?? "").toLowerCase().includes(query.trim().toLowerCase());
}

function productLineLabel(value: string) {
  if (value === "pants") return "Pants";
  if (value === "tape") return "Tape";
  return "Unknown";
}

function resolveProductSegment(product: { pack_type: string; size: string | null; raw_title: string; normalized_name: string }) {
  const title = product.normalized_name || product.raw_title;
  return {
    line: product.pack_type === "unknown" ? inferProductLine(title) : productLineLabel(product.pack_type),
    size: product.size || inferProductSize(title),
  };
}

function inferProductLine(value: string | null | undefined) {
  const text = (value ?? "").toLowerCase();
  if (text.includes("tape")) return "Tape";
  if (text.includes("pants") || text.includes("pant")) return "Pants";
  return "Pants";
}

function inferProductSize(value: string | null | undefined) {
  const text = (value ?? "").toUpperCase();
  const match = text.match(/\b(NB\/NB-S|XXXXL|XXXL|XXL|XL|NB|L|M|S)\b/);
  return match?.[1] ?? "Unknown";
}

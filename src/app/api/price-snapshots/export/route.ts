import { priceBrandSeriesLabel } from "@/lib/brand-series";
import { formatIdr, formatJakartaDateTimeSeconds, formatPricePerPiece, formatShortImageId } from "@/lib/format";
import {
  priceSnapshotBenchmarkMaterial,
  priceSnapshotBenchmarkSku,
  priceSnapshotBusinessLine,
  priceSnapshotBusinessSegment,
  priceSnapshotBusinessSize,
  priceSnapshotMakukuMaterialCode,
} from "@/lib/price-snapshot-business";
import { createSupabaseServiceClient } from "@/lib/supabase";
import type { PriceSnapshot } from "@/lib/types";

const csvColumns = {
  zh: [
    "采集时间",
    "品牌",
    "商品",
    "SKU",
    "等级",
    "包装",
    "规格",
    "片数",
    "活动类型",
    "标价",
    "折扣金额",
    "到手价",
    "单片价",
    "门店名称",
    "省",
    "市",
    "区",
    "采集人",
    "创建时间",
  ],
  en: [
    "Captured",
    "Brand",
    "Product",
    "SKU",
    "Grade",
    "Package",
    "Spec",
    "Pcs",
    "Activity Type",
    "List",
    "Discount",
    "Net",
    "IDR/pc",
    "Store",
    "Province",
    "City",
    "District",
    "Collector",
    "Create Time",
    "Visit Code",
    "Image ID",
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
    const visitCode = searchParams.get("visitCode");
    const createdFrom = searchParams.get("createdFrom");
    const createdTo = searchParams.get("createdTo");
    const locale = searchParams.get("locale") === "zh" ? "zh" : "en";
    const supabase = createSupabaseServiceClient();

    const { data, error } = await supabase
      .from("price_snapshots")
      .select("*, sku_master(*, material_master(*)), material_master(*), offline_store_visits!source_visit_id(id,visit_code,store_name,city,province,city_name,district,channel_type,visit_date,uploader_name,created_at), offline_stores(id,name,city,province,city_name,district,channel_type), competitor_products(*, brands(id,name)), ai_price_candidates(id, offline_store_visits(id,visit_code,store_name,city,province,city_name,district,channel_type,visit_date,uploader_name,created_at))")
      .order("created_at", { ascending: false })
      .order("captured_at", { ascending: false })
      .limit(5000);
    if (error) return Response.json({ error: error.message }, { status: 500 });

    const snapshots = applyOwnerFilter((data ?? []) as PriceSnapshot[], owner).filter((snapshot) => {
      const productLine = priceSnapshotBusinessLine(snapshot);
      const productSize = priceSnapshotBusinessSize(snapshot);
      const productPriceBand = priceSnapshotBusinessSegment(snapshot);
      if (brand && priceBrandSeriesLabel(snapshot) !== brand) return false;
      if (sku && !matchesText(priceSnapshotMakukuMaterialCode(snapshot), sku)) return false;
      if (line && productLine !== line) return false;
      if (priceBand && productPriceBand !== priceBand) return false;
      if (size && productSize !== size) return false;
      const region = storeRegionForSnapshot(snapshot);
      if (province && !matchesText(region.province, province)) return false;
      if (cityName && !matchesText(region.cityName, cityName)) return false;
      if (district && !matchesText(region.district, district)) return false;
      if (store && !matchesText(storeNameForSnapshot(snapshot), store)) return false;
      if (visitCode && !matchesText(visitCodeForSnapshot(snapshot), visitCode)) return false;
      if (createdFrom && !matchesCreatedFrom(snapshot.created_at, createdFrom)) return false;
      if (createdTo && !matchesCreatedTo(snapshot.created_at, createdTo)) return false;
      return true;
    });

    const rows = snapshots.map((snapshot) => {
      const region = storeRegionForSnapshot(snapshot);
      return [
        formatSnapshotCapturedAt(snapshot),
        snapshotBrandName(snapshot),
        snapshotProductName(snapshot),
        snapshotSkuCode(snapshot),
        snapshotBusinessSegment(snapshot),
        snapshotPackageType(snapshot),
        snapshotSpec(snapshot),
        snapshotPieceCount(snapshot),
        snapshotPromoTypeLabel(snapshot, locale === "zh"),
        formatIdr(snapshotPackagePrice(snapshot)),
        formatIdr(snapshotDiscountAmount(snapshot)),
        formatIdr(snapshot.net_price_idr),
        formatPricePerPiece(snapshot.price_per_piece),
        storeNameForSnapshot(snapshot),
        region.province ?? "-",
        region.cityName ?? "-",
        region.district ?? "-",
        uploaderNameForSnapshot(snapshot),
        formatSnapshotCreatedAt(snapshot),
        visitCodeForSnapshot(snapshot),
        imageIdForSnapshot(snapshot),
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
  offline_store_visits?: {
    store_name?: string | null;
    visit_code?: string | null;
    city?: string | null;
    province?: string | null;
    city_name?: string | null;
    district?: string | null;
    visit_date?: string | null;
    uploader_name?: string | null;
  } | null;
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
      visit_code?: string | null;
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
  return (snapshot.sku_master_id || snapshot.material_sku_code) && !snapshot.competitor_product_id ? "makuku" : "competitor";
}

function snapshotBrandName(snapshot: PriceSnapshot) {
  return priceBrandSeriesLabel(snapshot) || "-";
}

function snapshotProductName(snapshot: PriceSnapshot) {
  return snapshotOwnerType(snapshot) === "makuku"
    ? priceSnapshotBenchmarkMaterial(snapshot)?.tenant_sku_name ?? priceSnapshotBenchmarkSku(snapshot)?.makuku_sku_name ?? "-"
    : snapshot.competitor_products?.normalized_name ?? "-";
}

function snapshotSkuCode(snapshot: PriceSnapshot) {
  if (snapshotOwnerType(snapshot) === "makuku") {
    return cleanDisplayText(priceSnapshotMakukuMaterialCode(snapshot)) ?? "-";
  }
  return cleanDisplayText(snapshot.competitor_products?.competitor_sku_code) ?? cleanDisplayText(snapshot.competitor_products?.id) ?? "-";
}

function snapshotBusinessSegment(snapshot: PriceSnapshot) {
  return priceSnapshotBusinessSegment(snapshot) || "-";
}

function snapshotPackageType(snapshot: PriceSnapshot) {
  if (snapshotOwnerType(snapshot) === "makuku") {
    return cleanDisplayText(priceSnapshotBenchmarkMaterial(snapshot)?.type) ?? cleanDisplayText(snapshot.sku_master?.pack_type) ?? "-";
  }
  return cleanDisplayText(snapshot.competitor_products?.package_type) ?? cleanDisplayText(snapshot.competitor_products?.pack_type) ?? "-";
}

function snapshotSpec(snapshot: PriceSnapshot) {
  if (snapshotOwnerType(snapshot) === "makuku") {
    return cleanDisplayText(priceSnapshotBenchmarkMaterial(snapshot)?.sub_type) ?? cleanDisplayText(snapshot.sku_master?.size) ?? "-";
  }
  return cleanDisplayText(snapshot.competitor_products?.size) ?? "-";
}

function snapshotPieceCount(snapshot: PriceSnapshot) {
  if (snapshotOwnerType(snapshot) === "makuku") {
    return priceSnapshotBenchmarkMaterial(snapshot)?.pack_count ?? snapshot.sku_master?.piece_count ?? "-";
  }
  return snapshot.competitor_products?.piece_count ?? "-";
}

function snapshotPackagePrice(snapshot: PriceSnapshot) {
  return snapshot.package_price_idr ?? null;
}

function snapshotDiscountAmount(snapshot: PriceSnapshot) {
  const netPrice = Number(snapshot.net_price_idr);
  const packagePrice = Number(snapshotPackagePrice(snapshot));
  if (!Number.isFinite(netPrice) || !Number.isFinite(packagePrice)) return null;
  return packagePrice - netPrice;
}

function snapshotPromoTypeLabel(snapshot: PriceSnapshot, isZh: boolean) {
  const text = cleanDisplayText(snapshot.promo_type);
  if (!text || text === "offline_ai_confirmed") return isZh ? "无活动" : "No Activity";
  return text;
}

function storeVisitForSnapshot(snapshot: PriceSnapshotForStoreRegion) {
  if (snapshot.offline_store_visits) return snapshot.offline_store_visits;
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

function visitCodeForSnapshot(snapshot: PriceSnapshotForStoreRegion) {
  return cleanDisplayText(storeVisitForSnapshot(snapshot)?.visit_code) ?? "-";
}

function imageIdForSnapshot(snapshot: PriceSnapshot) {
  return formatShortImageId(snapshot.source_image_id);
}

function formatSnapshotCapturedAt(snapshot: PriceSnapshotForStoreRegion) {
  const visitDate = cleanDisplayText(storeVisitForSnapshot(snapshot)?.visit_date);
  if (visitDate) return visitDate.slice(0, 10);
  return formatJakartaDateTimeSeconds(snapshot.captured_at);
}

function formatSnapshotCreatedAt(snapshot: PriceSnapshotForStoreRegion) {
  return formatJakartaDateTimeSeconds(snapshot.created_at);
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

function matchesCreatedFrom(value: string | null | undefined, dateText: string) {
  const createdAt = Date.parse(String(value ?? ""));
  const from = Date.parse(`${dateText}T00:00:00.000Z`);
  if (!Number.isFinite(createdAt) || !Number.isFinite(from)) return true;
  return createdAt >= from;
}

function matchesCreatedTo(value: string | null | undefined, dateText: string) {
  const createdAt = Date.parse(String(value ?? ""));
  const to = Date.parse(`${dateText}T23:59:59.999Z`);
  if (!Number.isFinite(createdAt) || !Number.isFinite(to)) return true;
  return createdAt <= to;
}

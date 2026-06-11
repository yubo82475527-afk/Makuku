import { AppShell } from "@/components/app-shell";
import { Download } from "lucide-react";
import { PriceSnapshotsTable } from "@/components/price-snapshots-table";
import { Button, Card, DataNotice, SelectInput, TextInput } from "@/components/ui";
import { getBrands, getCompetitorProducts, getPriceSnapshots } from "@/lib/data";
import { getPageI18n } from "@/lib/i18n/server";
import { translateEnum } from "@/lib/i18n/get-dictionary";

export default async function PricesPage({
  params: routeParams,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ brand?: string; channel?: string; sku?: string; line?: string; priceBand?: string; size?: string; province?: string; cityName?: string; district?: string; store?: string }>;
}) {
  const { locale, dict } = await getPageI18n(routeParams);
  const params = await searchParams;
  const currentParams = new URLSearchParams();
  if (params.brand) currentParams.set("brand", params.brand);
  if (params.channel) currentParams.set("channel", params.channel);
  if (params.sku) currentParams.set("sku", params.sku);
  if (params.line) currentParams.set("line", params.line);
  if (params.priceBand) currentParams.set("priceBand", params.priceBand);
  if (params.size) currentParams.set("size", params.size);
  if (params.province) currentParams.set("province", params.province);
  if (params.cityName) currentParams.set("cityName", params.cityName);
  if (params.district) currentParams.set("district", params.district);
  if (params.store) currentParams.set("store", params.store);
  currentParams.set("locale", locale);
  const queryString = currentParams.toString();
  const exportHref = `/api/price-snapshots/export${queryString ? `?${queryString}` : ""}`;
  const [pricesResult, productsResult, brandsResult] = await Promise.all([
    getPriceSnapshots(),
    getCompetitorProducts(),
    getBrands(),
  ]);
  const productSegments = productsResult.data.map((product) => resolveProductSegment(product));
  const productSizes = Array.from(new Set([...productSegments.map((segment) => segment.size), params.size].filter(Boolean) as string[])).sort();
  const prices = pricesResult.data.filter((snapshot) => {
    const product = snapshot.competitor_products;
    const match = product?.sku_matches?.[0];
    const sku = match?.sku_master;
    const productSegment = product ? resolveProductSegment(product) : { line: "Unknown", size: "Unknown" };
    const line = sku ? productLineLabel(sku.pack_type) : productSegment.line;
    const size = sku?.size ?? productSegment.size;
    const priceBand = sku?.segment ?? product?.segment ?? "unknown";
    if (params.brand && product?.brand_id !== params.brand) return false;
    if (params.channel && snapshot.channel !== params.channel) return false;
    if (params.sku && match?.sku_master_id !== params.sku) return false;
    if (params.line && line !== params.line) return false;
    if (params.priceBand && priceBand !== params.priceBand) return false;
    if (params.size && size !== params.size) return false;
    const region = storeRegionForSnapshot(snapshot);
    if (params.province && !matchesText(region.province, params.province)) return false;
    if (params.cityName && !matchesText(region.cityName, params.cityName)) return false;
    if (params.district && !matchesText(region.district, params.district)) return false;
    if (params.store && !matchesText(storeNameForSnapshot(snapshot), params.store)) return false;
    return true;
  });

  return (
    <AppShell locale={locale} dict={dict} title={dict.prices.title} currentPath="/prices" isDemo={pricesResult.isDemo}>
      <DataNotice dict={dict} error={pricesResult.error ?? productsResult.error ?? brandsResult.error} />
      <Card className="mb-4">
        <form className="grid gap-3 md:grid-cols-5 xl:grid-cols-9">
          <SelectInput name="brand" defaultValue={params.brand ?? ""}>
            <option value="">{dict.common.allBrands}</option>
            {brandsResult.data.filter((brand) => !brand.is_own_brand).map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}
          </SelectInput>
          <SelectInput name="channel" defaultValue={params.channel ?? ""}>
            <option value="">{dict.common.allChannels}</option>
            <option value="shopee">{translateEnum(dict, "channel", "shopee")}</option>
            <option value="offline">{translateEnum(dict, "channel", "offline")}</option>
            <option value="tiktok">{translateEnum(dict, "channel", "tiktok")}</option>
            <option value="manual">{translateEnum(dict, "channel", "manual")}</option>
          </SelectInput>
          <SelectInput name="priceBand" defaultValue={params.priceBand ?? ""}>
            <option value="">{locale === "zh" ? "全部系列" : "All series"}</option>
            <option value="premium">premium</option>
            <option value="mid">mid</option>
            <option value="value">value</option>
            <option value="unknown">unknown</option>
          </SelectInput>
          <SelectInput name="size" defaultValue={params.size ?? ""}>
            <option value="">{locale === "zh" ? "\u5168\u90e8\u5c3a\u7801" : "All sizes"}</option>
            {productSizes.map((size) => <option key={size} value={size}>{size}</option>)}
          </SelectInput>
          <TextInput name="province" placeholder={locale === "zh" ? "省/州" : "Province"} defaultValue={params.province ?? ""} />
          <TextInput name="cityName" placeholder={locale === "zh" ? "城市" : "City"} defaultValue={params.cityName ?? ""} />
          <TextInput name="district" placeholder={locale === "zh" ? "区/县" : "District"} defaultValue={params.district ?? ""} />
          <TextInput name="store" placeholder={locale === "zh" ? "门店" : "Store"} defaultValue={params.store ?? ""} />
          <TextInput name="sku" placeholder={dict.prices.skuId} defaultValue={params.sku ?? ""} />
          <Button type="submit">{dict.common.filter}</Button>
        </form>
      </Card>

      <Card>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold">{dict.prices.title}</h2>
          <a
            href={exportHref}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <Download className="h-4 w-4" />
            {locale === "zh" ? "导出 CSV" : "Export CSV"}
          </a>
        </div>
        <PriceSnapshotsTable snapshots={prices} locale={locale} />
      </Card>
    </AppShell>
  );
}

type PriceSnapshotForStoreRegion = {
  captured_at?: string | null;
  competitor_products?: { shop_name?: string | null } | null;
  ai_price_candidates?: {
    offline_store_visits?: {
      store_name?: string | null;
      city?: string | null;
      province?: string | null;
      city_name?: string | null;
      district?: string | null;
      visit_date?: string | null;
    } | null;
  }[];
};

function storeVisitForSnapshot(snapshot: PriceSnapshotForStoreRegion) {
  return snapshot.ai_price_candidates?.find((candidate) => candidate.offline_store_visits)?.offline_store_visits ?? null;
}

function storeNameForSnapshot(snapshot: PriceSnapshotForStoreRegion) {
  return cleanDisplayText(storeVisitForSnapshot(snapshot)?.store_name) ?? cleanDisplayText(snapshot.competitor_products?.shop_name) ?? "-";
}

function storeRegionForSnapshot(snapshot: PriceSnapshotForStoreRegion) {
  const visit = storeVisitForSnapshot(snapshot);
  const legacyRegion = splitLegacyRegion(visit?.city);
  return {
    province: cleanDisplayText(visit?.province) ?? legacyRegion.province,
    cityName: cleanDisplayText(visit?.city_name) ?? legacyRegion.cityName,
    district: cleanDisplayText(visit?.district) ?? legacyRegion.district,
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

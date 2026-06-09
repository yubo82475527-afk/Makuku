import { AppShell } from "@/components/app-shell";
import { PriceSnapshotActions } from "@/components/price-snapshot-actions";
import { Badge, Button, Card, DataNotice, SelectInput, TextInput } from "@/components/ui";
import { formatIdr, formatJakartaTime, formatPricePerPiece } from "@/lib/format";
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
  const queryString = currentParams.toString();
  const currentPath = `/${locale}/prices${queryString ? `?${queryString}` : ""}`;
  const exportHref = `/api/price-snapshots/export${queryString ? `?${queryString}` : ""}`;
  const [pricesResult, productsResult, brandsResult] = await Promise.all([
    getPriceSnapshots(),
    getCompetitorProducts(),
    getBrands(),
  ]);
  const productSegments = productsResult.data.map((product) => resolveProductSegment(product));
  const productLines = Array.from(new Set([...productSegments.map((segment) => segment.line), params.line].filter(Boolean) as string[])).sort();
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
    if (params.store && !product?.shop_name?.toLowerCase().includes(params.store.toLowerCase())) return false;
    return true;
  });

  return (
    <AppShell locale={locale} dict={dict} title={dict.prices.title} currentPath="/prices" isDemo={pricesResult.isDemo}>
      <DataNotice dict={dict} error={pricesResult.error ?? productsResult.error ?? brandsResult.error} />
      <Card className="mb-4">
        <form className="grid gap-3 md:grid-cols-6 xl:grid-cols-10">
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
          <SelectInput name="line" defaultValue={params.line ?? ""}>
            <option value="">{locale === "zh" ? "\u5168\u90e8\u4ea7\u54c1\u7ebf" : "All lines"}</option>
            {productLines.map((line) => <option key={line} value={line}>{line}</option>)}
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
          <PriceSnapshotActions products={productsResult.data} locale={locale} returnTo={currentPath} exportHref={exportHref} />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
              <tr>
                <th className="py-2 pr-3">{dict.prices.captured}</th>
                <th className="py-2 pr-3">{dict.common.brand}</th>
                <th className="py-2 pr-3">{dict.common.product}</th>
                <th className="py-2 pr-3">{dict.common.channel}</th>
                <th className="py-2 pr-3">{dict.prices.list}</th>
                <th className="py-2 pr-3">{dict.prices.promo}</th>
                <th className="py-2 pr-3">{dict.prices.voucher}</th>
                <th className="py-2 pr-3">{dict.prices.net}</th>
                <th className="py-2 pr-3">{dict.prices.idrPerPc}</th>
                <th className="py-2 pr-3">{dict.prices.promoType}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {prices.map((snapshot) => {
                const sku = snapshot.competitor_products?.sku_matches?.[0]?.sku_master;
                const underFloor = sku && snapshot.price_per_piece < sku.floor_price_per_piece;
                const underTarget = sku && snapshot.price_per_piece < sku.target_price_per_piece * 0.92;
                return (
                  <tr key={snapshot.id} className={underFloor ? "bg-red-50" : underTarget ? "bg-yellow-50" : undefined}>
                    <td className="py-3 pr-3">{formatJakartaTime(snapshot.captured_at)}</td>
                    <td className="py-3 pr-3 font-medium">{snapshot.competitor_products?.brands?.name}</td>
                    <td className="py-3 pr-3">{snapshot.competitor_products?.normalized_name}</td>
                    <td className="py-3 pr-3"><Badge>{translateEnum(dict, "channel", snapshot.channel)}</Badge></td>
                    <td className="py-3 pr-3">{formatIdr(snapshot.list_price_idr)}</td>
                    <td className="py-3 pr-3">{formatIdr(snapshot.promo_price_idr)}</td>
                    <td className="py-3 pr-3">{formatIdr(snapshot.voucher_value_idr)}</td>
                    <td className="py-3 pr-3">{formatIdr(snapshot.net_price_idr)}</td>
                    <td className="py-3 pr-3 font-semibold">{formatPricePerPiece(snapshot.price_per_piece)}</td>
                    <td className="py-3 pr-3">{snapshot.promo_type ?? "-"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </AppShell>
  );
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

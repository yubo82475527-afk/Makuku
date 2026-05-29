import { AppShell } from "@/components/app-shell";
import { Badge, Button, Card, DataNotice, SelectInput, TextInput } from "@/components/ui";
import { getBrands, getCompetitorProducts, getSkuMaster } from "@/lib/data";
import { getPageI18n } from "@/lib/i18n/server";
import { translateEnum } from "@/lib/i18n/get-dictionary";

export default async function CompetitorsPage({
  params: routeParams,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ brand?: string; channel?: string; size?: string }>;
}) {
  const { locale, dict } = await getPageI18n(routeParams);
  const params = await searchParams;
  const [productsResult, brandsResult, skuResult] = await Promise.all([
    getCompetitorProducts(),
    getBrands(),
    getSkuMaster(),
  ]);
  const products = productsResult.data.filter((product) => {
    if (params.brand && product.brand_id !== params.brand) return false;
    if (params.channel && product.channel !== params.channel) return false;
    if (params.size && product.size !== params.size) return false;
    return true;
  });

  return (
    <AppShell locale={locale} dict={dict} title={dict.competitors.title} currentPath="/competitors" isDemo={productsResult.isDemo}>
      <DataNotice dict={dict} error={productsResult.error ?? brandsResult.error ?? skuResult.error} />
      <Card className="mb-4">
        <form className="grid gap-3 md:grid-cols-4">
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
          <TextInput name="size" placeholder={dict.common.size} defaultValue={params.size ?? ""} />
          <Button type="submit">{dict.common.filter}</Button>
        </form>
      </Card>

      <Card className="mb-4">
        <h2 className="mb-3 font-semibold">{dict.competitors.addTitle}</h2>
        <form action="/api/competitors" method="post" className="grid gap-3 md:grid-cols-4 xl:grid-cols-8">
          <input type="hidden" name="return_to" value={`/${locale}/competitors`} />
          <SelectInput name="brand_id" required>
            {brandsResult.data.filter((brand) => !brand.is_own_brand).map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}
          </SelectInput>
          <TextInput name="raw_title" placeholder={dict.competitors.rawTitle} required className="md:col-span-2" />
          <TextInput name="normalized_name" placeholder={dict.competitors.normalizedName} required className="md:col-span-2" />
          <SelectInput name="channel" defaultValue="shopee">
            <option value="shopee">{translateEnum(dict, "channel", "shopee")}</option>
            <option value="offline">{translateEnum(dict, "channel", "offline")}</option>
            <option value="tiktok">{translateEnum(dict, "channel", "tiktok")}</option>
            <option value="manual">{translateEnum(dict, "channel", "manual")}</option>
          </SelectInput>
          <TextInput name="shop_name" placeholder={dict.competitors.shopStore} />
          <TextInput name="product_url" placeholder={dict.competitors.productUrl} />
          <SelectInput name="pack_type" defaultValue="pants">
            <option value="pants">{translateEnum(dict, "packType", "pants")}</option>
            <option value="tape">{translateEnum(dict, "packType", "tape")}</option>
            <option value="unknown">{translateEnum(dict, "packType", "unknown")}</option>
          </SelectInput>
          <TextInput name="size" placeholder={dict.common.size} />
          <TextInput name="piece_count" type="number" placeholder={dict.common.pcs} required />
          <SelectInput name="segment" defaultValue="premium">
            <option value="premium">{translateEnum(dict, "segment", "premium")}</option>
            <option value="mid">{translateEnum(dict, "segment", "mid")}</option>
            <option value="value">{translateEnum(dict, "segment", "value")}</option>
            <option value="unknown">{translateEnum(dict, "segment", "unknown")}</option>
          </SelectInput>
          <SelectInput name="sku_master_id">
            <option value="">{dict.competitors.matchSku}</option>
            {skuResult.data.map((sku) => <option key={sku.id} value={sku.id}>{sku.makuku_sku_name}</option>)}
          </SelectInput>
          <TextInput name="match_score" type="number" step="0.01" placeholder={dict.competitors.matchScore} />
          <Button type="submit">{dict.competitors.addButton}</Button>
        </form>
      </Card>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
              <tr>
                <th className="py-2 pr-3">{dict.common.brand}</th>
                <th className="py-2 pr-3">{dict.common.product}</th>
                <th className="py-2 pr-3">{dict.common.channel}</th>
                <th className="py-2 pr-3">{dict.common.size}</th>
                <th className="py-2 pr-3">{dict.common.pcs}</th>
                <th className="py-2 pr-3">{dict.common.segment}</th>
                <th className="py-2 pr-3">{dict.common.makukuSku}</th>
                <th className="py-2 pr-3">{dict.common.score}</th>
                <th className="py-2 pr-3">{dict.common.reviewed}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {products.map((product) => {
                const match = product.sku_matches?.[0];
                return (
                  <tr key={product.id}>
                    <td className="py-3 pr-3 font-medium">{product.brands?.name}</td>
                    <td className="py-3 pr-3">{product.normalized_name}</td>
                    <td className="py-3 pr-3"><Badge>{translateEnum(dict, "channel", product.channel)}</Badge></td>
                    <td className="py-3 pr-3">{product.size}</td>
                    <td className="py-3 pr-3">{product.piece_count}</td>
                    <td className="py-3 pr-3">{translateEnum(dict, "segment", product.segment)}</td>
                    <td className="py-3 pr-3">{match?.sku_master?.makuku_sku_name ?? "-"}</td>
                    <td className="py-3 pr-3">{match ? `${Math.round(match.match_score * 100)}%` : "-"}</td>
                    <td className="py-3 pr-3">{match?.reviewed ? dict.common.yes : dict.common.no}</td>
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

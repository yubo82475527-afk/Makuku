import { AppShell } from "@/components/app-shell";
import { Button, Card, DataNotice, SelectInput, TextInput } from "@/components/ui";
import { CompetitorMappingTable } from "@/components/competitor-mapping-table";
import { getBrands, getCompetitorProducts, getMaterialMaster } from "@/lib/data";
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
  const [productsResult, brandsResult, materialResult] = await Promise.all([
    getCompetitorProducts(),
    getBrands(),
    getMaterialMaster(),
  ]);
  const ownBrandIds = new Set(brandsResult.data.filter((brand) => brand.is_own_brand || isOwnBrandName(brand.name)).map((brand) => brand.id));
  const products = productsResult.data.filter((product) => {
    if (ownBrandIds.has(product.brand_id)) return false;
    if (isOwnBrandName(product.brands?.name)) return false;
    if (params.brand && product.brand_id !== params.brand) return false;
    if (params.channel && product.channel !== params.channel) return false;
    if (params.size && product.size !== params.size) return false;
    return true;
  });

  return (
    <AppShell locale={locale} dict={dict} title={dict.competitors.title} currentPath="/competitors" isDemo={productsResult.isDemo || materialResult.isDemo}>
      <DataNotice dict={dict} error={productsResult.error ?? brandsResult.error ?? materialResult.error} />
      <Card className="mb-4">
        <form className="grid gap-3 md:grid-cols-4">
          <SelectInput name="brand" defaultValue={params.brand ?? ""}>
            <option value="">{dict.common.allBrands}</option>
            {brandsResult.data.filter((brand) => !brand.is_own_brand && !isOwnBrandName(brand.name)).map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}
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

      <Card>
        <CompetitorMappingTable products={products} materials={materialResult.data} locale={locale} dict={dict} />
      </Card>
    </AppShell>
  );
}

function isOwnBrandName(value: string | null | undefined) {
  return value?.trim().toLowerCase() === "makuku";
}

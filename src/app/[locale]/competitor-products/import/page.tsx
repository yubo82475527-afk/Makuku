import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { CompetitorProductImportWorkbench } from "@/components/competitor-product-import-workbench";
import { Card } from "@/components/ui";
import { getPageI18n } from "@/lib/i18n/server";

export default async function CompetitorProductImportPage({
  params: routeParams,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale, dict } = await getPageI18n(routeParams);
  const isZh = locale === "zh";
  return (
    <AppShell locale={locale} dict={dict} title={isZh ? "竞品主数据导入" : "Competitor Product Import"} currentPath="/competitor-products/import">
      <Card className="mb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">{isZh ? "导入竞品主数据" : "Import competitor product master"}</h2>
            <p className="mt-1 text-sm text-slate-500">
              {isZh
                ? "只维护竞品商品和 SKU 映射，不写入真实市场价格。"
                : "Maintains competitor products and SKU mappings only. This does not write price snapshots."}
            </p>
          </div>
          <Link href={`/${locale}/competitor-products`} className="text-sm font-medium text-blue-700 hover:underline">
            {isZh ? "返回竞品主数据" : "Back to master"}
          </Link>
        </div>
      </Card>
      <CompetitorProductImportWorkbench locale={locale} />
    </AppShell>
  );
}

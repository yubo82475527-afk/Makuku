import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { ExcelPriceImportWorkbench } from "@/components/excel-price-import-workbench";
import { getPageI18n } from "@/lib/i18n/server";

export default async function ExcelPriceImportPage({
  params: routeParams,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale, dict } = await getPageI18n(routeParams);
  const isZh = locale === "zh";

  return (
    <AppShell locale={locale} dict={dict} title={isZh ? "线下价格 Excel 导入" : "Offline Price Excel Import"} currentPath="/competitor-products">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-950">{isZh ? "线下价格 Excel 导入" : "Offline Price Excel Import"}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {isZh
              ? "先预览，不写库；确认导入后会创建/复用门店和竞品商品，并生成门店价格快照。"
              : "Preview first without writing data; import creates or reuses stores and competitor products, then writes price snapshots."}
          </p>
        </div>
        <Link href={`/${locale}/competitor-products`} className="text-sm font-medium text-blue-700 hover:underline">
          {isZh ? "返回竞品主数据" : "Back to competitor master"}
        </Link>
      </div>
      <ExcelPriceImportWorkbench locale={locale} />
    </AppShell>
  );
}

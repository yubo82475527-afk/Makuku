import { AppShell } from "@/components/app-shell";
import { MaterialMasterTable } from "@/components/material-master-table";
import { MaterialImportForm } from "@/components/material-import-form";
import { SkuMasterSegmentTable } from "@/components/sku-master-segment-table";
import { Card, DataNotice } from "@/components/ui";
import { getMaterialMaster, getSkuMaster } from "@/lib/data";
import { getPageI18n } from "@/lib/i18n/server";
import { materialMasterColumns } from "@/lib/material-master";

export const dynamic = "force-dynamic";

export default async function SkuMasterPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale, dict } = await getPageI18n(params);
  const [result, skuResult] = await Promise.all([getMaterialMaster(), getSkuMaster()]);

  return (
    <AppShell locale={locale} dict={dict} title={dict.skuMaster.title} currentPath="/sku-master" isDemo={result.isDemo || skuResult.isDemo}>
      <DataNotice dict={dict} error={result.error ?? skuResult.error} />

      <Card className="mb-4">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold">{dict.skuMaster.importTitle}</h2>
            <p className="mt-1 text-sm text-slate-500">{dict.skuMaster.importHint}</p>
          </div>
          <div className="max-w-3xl text-xs leading-5 text-slate-500">
            {dict.skuMaster.importColumnsLabel}: {materialMasterColumns.join(", ")}
          </div>
        </div>
        <MaterialImportForm dict={dict} />
      </Card>

      <SkuMasterSegmentTable rows={skuResult.data} locale={locale} />
      <MaterialMasterTable dict={dict} rows={result.data} />
    </AppShell>
  );
}

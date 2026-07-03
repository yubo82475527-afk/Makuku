import Link from "next/link";
import { PageShellState } from "@/components/page-shell-state";
import { ReportTemplatePreviewActions } from "@/components/report-template-preview-actions";
import { ReportTemplatePreview } from "@/components/report-template-preview";
import { Card, DataNotice, EmptyState } from "@/components/ui";
import { getAgentReportById, listAgentReports } from "@/lib/agent-reports";
import { getPageI18n } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

function clean(value: string | string[] | undefined) {
  return Array.isArray(value) ? (value[0] ?? "").trim() : (value ?? "").trim();
}

export default async function ReportTemplatePreviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale, dict } = await getPageI18n(params);
  const query = await searchParams;
  const reportId = clean(query.report_id);
  const currentPath = `/report-center/template-preview${reportId ? `?report_id=${encodeURIComponent(reportId)}` : ""}`;
  const isZh = locale === "zh";

  const reportResult = reportId
    ? await getAgentReportById(reportId)
    : await listAgentReports({ reportDefinitionCode: "daily_price_country", limit: 1 }).then((result) => ({
      data: result.data[0] ?? null,
      error: result.error,
      isDemo: result.isDemo,
    }));

  return (
    <>
      <PageShellState locale={locale} dict={dict} title={isZh ? "模板预览" : "Template Preview"} currentPath={currentPath} isDemo={reportResult.isDemo} />
      <DataNotice dict={dict} error={reportResult.error} />

      <Card className="mb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{isZh ? "HTML 模板预览" : "HTML Template Preview"}</div>
            <h1 className="mt-1 text-xl font-semibold text-slate-900">
              {isZh ? "日报图片模板样稿" : "Daily report image template draft"}
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              {isZh ? "先确认视觉和信息层级，后面再接 HTML 转 PNG 和飞书图片发送。" : "Validate the visual hierarchy first. HTML-to-PNG rendering and Feishu image delivery will come after this."}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {reportResult.data ? <ReportTemplatePreviewActions reportId={reportResult.data.id} locale={locale} /> : null}
            <Link href={`/${locale}/report-center`} className="inline-flex h-9 items-center justify-center rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50">
              {isZh ? "返回报表" : "Back to Reports"}
            </Link>
          </div>
        </div>
      </Card>

      {reportResult.data ? (
        <ReportTemplatePreview report={reportResult.data} locale={locale} />
      ) : (
        <EmptyState text={isZh ? "当前没有可预览的报表，请先生成或重算一份日报。" : "There is no report available for preview yet. Generate or rerun a daily report first."} />
      )}
    </>
  );
}

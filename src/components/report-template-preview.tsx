import type { AgentReport, AgentReportMetricRow } from "@/lib/types";

export function ReportTemplatePreview({
  report,
}: {
  report: AgentReport;
  locale: string;
}) {
  const rows = resolveDisplayRows(report);

  return (
    <div className="mx-auto w-full max-w-[1080px] rounded-[24px] border border-slate-200 bg-[linear-gradient(180deg,#f8fafc_0%,#f3f6fb_100%)] p-9 text-slate-800 shadow-[0_24px_64px_rgba(15,23,42,0.08)]">
      <div className="sr-only">Key Metric Definitions Competitor Price Records</div>

      <div className="mb-7 flex items-start justify-between gap-8">
        <div className="grid gap-2">
          <div className="text-[12px] font-bold uppercase tracking-[0.18em] text-[#111111]">Makuku SFA</div>
          <h1 className="text-[28px] font-bold leading-[1.25] text-slate-950">SFA Execution Daily Report (HQ)</h1>
          <p className="text-[14px] leading-6 text-[#111111]">
            Prior-day store visit and price capture summary grouped by Google Maps province
          </p>
        </div>

        <div className="min-w-[208px] rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 text-right">
          <div className="text-[12px] font-bold uppercase tracking-[0.16em] text-slate-500">Date</div>
          <div className="mt-2 text-[22px] font-bold text-slate-950">{report.period_end}</div>
        </div>
      </div>

      <div className="overflow-hidden rounded-[18px] border border-slate-200 bg-white">
        <table className="w-full table-fixed border-collapse text-left">
          <thead className="bg-slate-50">
            <tr className="[&>th]:border-b [&>th]:border-slate-200 [&>th]:px-4 [&>th]:py-[18px] [&>th]:text-[14px] [&>th]:font-bold [&>th]:leading-[1.45] [&>th]:text-slate-700">
              <th className="w-[22%]">Province</th>
              <th className="w-[16%]">Visited Stores</th>
              <th className="w-[14%]">Visiting Employees</th>
              <th className="w-[24%]">Makuku Prices</th>
              <th className="w-[24%]">Competitor Prices</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr
                key={`${row.scope_name}-${index}`}
                className="[&>td]:align-top [&>td]:border-b [&>td]:border-slate-100 [&>td]:px-4 [&>td]:py-[18px] [&>td]:text-[15px] [&>td]:leading-[1.55] even:bg-slate-50/40 odd:bg-white last:[&>td]:border-b-0"
              >
                <td className="font-semibold text-slate-950">{row.scope_name}</td>
                <td className="font-semibold text-slate-900">{row.visited_store_count}</td>
                <td className="font-semibold text-slate-900">{row.visiting_employee_count}</td>
                <td className="font-semibold text-slate-900">{row.makuku_price_record_count}</td>
                <td className="font-semibold text-slate-900">{row.competitor_price_record_count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex justify-between gap-6 text-[13px] leading-5 text-slate-500">
        <div>
          <span className="font-semibold text-slate-700">Definition: </span>
          Stores and employees are deduplicated; price counts are based on captured records.
        </div>
        <div className="shrink-0">
          <span className="font-semibold text-slate-700">Scope: </span>
          {report.scope_name}
        </div>
      </div>
    </div>
  );
}

function resolveDisplayRows(report: AgentReport) {
  const provinceRows = report.metrics_json.table_rows.filter((row) => row.scope_name !== report.scope_name);
  if (provinceRows.length > 0) return provinceRows;
  return report.metrics_json.table_rows.length > 0
    ? report.metrics_json.table_rows
    : [buildFallbackRow(report)];
}

function buildFallbackRow(report: AgentReport): AgentReportMetricRow {
  return {
    scope_name: report.scope_name,
    visited_store_count: report.metrics_json.summary.visited_store_count,
    visiting_employee_count: report.metrics_json.summary.visiting_employee_count,
    makuku_price_record_count: report.metrics_json.summary.makuku_price_record_count,
    competitor_price_record_count: report.metrics_json.summary.competitor_price_record_count,
  };
}

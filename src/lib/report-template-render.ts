import type { AgentReport, AgentReportMetricRow } from "./types.ts";

export function renderReportTemplatePreviewHtml(report: AgentReport, _locale: string) {
  const title = "SFA Execution Daily Report (HQ)";
  const dateLabel = "Date";
  const scopeLabel = "Province";
  const visitedLabel = "Visited Stores";
  const employeeLabel = "Visiting Employees";
  const makukuLabel = "Makuku Prices";
  const competitorLabel = "Competitor Prices";
  const rows = resolveDisplayRows(report);

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(report.content_json.title)}</title>
    <style>
      * { box-sizing: border-box; }
      body {
        margin: 0;
        background: #f5f7fb;
        color: #1f2937;
        font-family: Inter, "Segoe UI", Arial, sans-serif;
      }
      .page {
        width: 1080px;
        min-height: 760px;
        padding: 36px;
        background:
          radial-gradient(circle at top right, rgba(59, 130, 246, 0.08), transparent 30%),
          linear-gradient(180deg, #f8fafc 0%, #f3f6fb 100%);
      }
      .sheet {
        min-height: 688px;
        padding: 42px 46px 36px;
        border: 1px solid #d8e0ea;
        border-radius: 24px;
        background: rgba(255, 255, 255, 0.96);
        box-shadow: 0 24px 64px rgba(15, 23, 42, 0.08);
      }
      .header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 32px;
        margin-bottom: 28px;
      }
      .title-wrap {
        display: grid;
        gap: 10px;
      }
      .eyebrow {
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        color: #111111;
      }
      .title {
        font-size: 28px;
        font-weight: 700;
        line-height: 1.25;
        color: #0f172a;
      }
      .subtitle {
        font-size: 14px;
        line-height: 1.5;
        color: #111111;
      }
      .date-card {
        min-width: 208px;
        padding: 14px 18px;
        border: 1px solid #dbe2ea;
        border-radius: 16px;
        background: #f8fafc;
        text-align: right;
      }
      .date-label {
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.16em;
        text-transform: uppercase;
        color: #64748b;
      }
      .date-value {
        margin-top: 8px;
        font-size: 22px;
        font-weight: 700;
        color: #0f172a;
      }
      .table-shell {
        border: 1px solid #d6dee8;
        border-radius: 18px;
        background: #ffffff;
        overflow: hidden;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        table-layout: fixed;
      }
      thead th {
        padding: 18px 16px;
        border-bottom: 1px solid #e7edf4;
        background: #f8fafc;
        text-align: left;
        font-size: 14px;
        font-weight: 700;
        line-height: 1.45;
        color: #334155;
      }
      tbody td {
        padding: 18px 16px;
        border-bottom: 1px solid #eef2f7;
        vertical-align: top;
        text-align: left;
        font-size: 15px;
        line-height: 1.55;
        color: #1f2937;
        word-break: break-word;
      }
      tbody tr:last-child td {
        border-bottom: none;
      }
      tbody tr:nth-child(even) td {
        background: #fcfdff;
      }
      .col-scope { width: 22%; }
      .col-visited { width: 16%; }
      .col-employee { width: 14%; }
      .col-makuku { width: 24%; }
      .col-competitor { width: 24%; }
      .scope-name {
        font-weight: 600;
        color: #0f172a;
      }
      .metric-value {
        font-weight: 600;
        color: #111827;
      }
      .footer {
        display: flex;
        justify-content: space-between;
        gap: 24px;
        margin-top: 18px;
        font-size: 13px;
        line-height: 1.5;
        color: #64748b;
      }
      .footer strong {
        color: #334155;
      }
    </style>
  </head>
  <body>
    <div class="page">
      <div class="sheet">
        <div class="header">
          <div class="title-wrap">
            <div class="eyebrow">Makuku SFA</div>
            <div class="title">${escapeHtml(title)}</div>
            <div class="subtitle">${escapeHtml("Prior-day store visit and price capture summary grouped by Google Maps province")}</div>
          </div>
          <div class="date-card">
            <div class="date-label">${escapeHtml(dateLabel)}</div>
            <div class="date-value">${escapeHtml(report.period_end)}</div>
          </div>
        </div>

        <div class="table-shell">
          <table>
            <thead>
              <tr>
                <th class="col-scope">${escapeHtml(scopeLabel)}</th>
                <th class="col-visited">${escapeHtml(visitedLabel)}</th>
                <th class="col-employee">${escapeHtml(employeeLabel)}</th>
                <th class="col-makuku">${escapeHtml(makukuLabel)}</th>
                <th class="col-competitor">${escapeHtml(competitorLabel)}</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map((row) => renderMetricRow(row)).join("")}
            </tbody>
          </table>
        </div>

        <div class="footer">
          <div><strong>${escapeHtml("Definition")}</strong> ${escapeHtml("Stores and employees are deduplicated; price counts are based on captured records.")}</div>
          <div><strong>${escapeHtml("Scope")}</strong> ${escapeHtml(report.scope_name)}</div>
        </div>
      </div>
    </div>
  </body>
</html>`;
}

export async function renderReportTemplatePreviewPng(report: AgentReport, locale: string) {
  const browser = await launchReportRenderBrowser();
  try {
    const context = await browser.newContext({
      viewport: { width: 1080, height: 760 },
      deviceScaleFactor: 2,
    });
    const page = await context.newPage();
    await page.setContent(renderReportTemplatePreviewHtml(report, locale), { waitUntil: "load" });
    return await page.screenshot({ type: "png", fullPage: true });
  } finally {
    await browser.close();
  }
}

async function launchReportRenderBrowser() {
  if (isServerlessRuntime()) {
    const [{ chromium }, chromiumPackage] = await Promise.all([
      import("playwright-core"),
      import("@sparticuz/chromium"),
    ]);
    const serverlessChromium = chromiumPackage.default;
    return chromium.launch({
      args: serverlessChromium.args,
      executablePath: await serverlessChromium.executablePath(),
      headless: true,
    });
  }

  const { chromium } = await import("playwright");
  return chromium.launch({ headless: true });
}

function isServerlessRuntime() {
  return process.env.VERCEL === "1" || Boolean(process.env.AWS_LAMBDA_FUNCTION_VERSION);
}

function renderMetricRow(row: AgentReportMetricRow) {
  return `<tr>
    <td class="col-scope"><span class="scope-name">${escapeHtml(row.scope_name)}</span></td>
    <td class="col-visited"><span class="metric-value">${row.visited_store_count}</span></td>
    <td class="col-employee"><span class="metric-value">${row.visiting_employee_count}</span></td>
    <td class="col-makuku"><span class="metric-value">${row.makuku_price_record_count}</span></td>
    <td class="col-competitor"><span class="metric-value">${row.competitor_price_record_count}</span></td>
  </tr>`;
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

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

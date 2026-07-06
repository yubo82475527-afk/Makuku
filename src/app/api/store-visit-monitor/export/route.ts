import * as XLSX from "xlsx";
import { formatJakartaDateTimeSeconds, formatJakartaTime, formatPercent } from "@/lib/format";
import { getStoreVisitMonitorExport } from "@/lib/data";

export const dynamic = "force-dynamic";

function readParam(searchParams: URLSearchParams, key: string) {
  return searchParams.get(key)?.trim() || undefined;
}

function formatDuration(value: number | null) {
  if (value === null) return "-";
  if (value < 1000) return `${value} ms`;
  const seconds = value / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)} s`;
  return `${(seconds / 60).toFixed(1)} min`;
}

function downloadName(dateFrom?: string, dateTo?: string) {
  const range = dateFrom && dateTo ? `${dateFrom}-${dateTo}` : new Date().toISOString().slice(0, 10);
  return `store-visit-monitor-${range}.xlsx`;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const locale = readParam(url.searchParams, "locale") ?? "zh";
  const result = await getStoreVisitMonitorExport({
    dateFrom: readParam(url.searchParams, "date_from"),
    dateTo: readParam(url.searchParams, "date_to"),
    visitCode: readParam(url.searchParams, "visit_code"),
    storeName: readParam(url.searchParams, "store_name"),
    promoter: readParam(url.searchParams, "promoter"),
    analysisStatus: readParam(url.searchParams, "analysis_status"),
  });

  if (result.error) {
    return Response.json({ error: result.error }, { status: 500 });
  }

  const rows = result.data.map((visit) => ({
    "Visit Code": visit.visitCode ?? visit.visitId,
    Store: visit.storeName,
    "Visit date": visit.visitDate,
    Promoter: visit.promoter,
    "Analysis status": visit.analysisStatus ?? visit.visitStatus,
    "Full analysis time": formatDuration(visit.fullAnalysisTimeMs),
    "Image count": visit.imageCount,
    Success: visit.successCount,
    Failure: visit.failureCount,
    Retake: visit.retakeRequiredCount,
    Accuracy: formatPercent(visit.accuracy !== null ? visit.accuracy * 100 : null),
    "Auto-approval rate": formatPercent(visit.autoApprovalRate !== null ? visit.autoApprovalRate * 100 : null),
    "Average price deviation": formatPercent(visit.avgPriceDeviationRate !== null ? visit.avgPriceDeviationRate * 100 : null),
    "Started at": visit.startedAt ? formatJakartaTime(visit.startedAt) : "-",
    "Completed at": visit.completedAt ? formatJakartaTime(visit.completedAt) : "-",
    "Create time": formatJakartaDateTimeSeconds(visit.createdAt),
    "Update time": formatJakartaDateTimeSeconds(visit.updatedAt),
    "Details URL": new URL(`/${locale}/mobile/offline-capture/${visit.visitId}`, url.origin).toString(),
  }));

  const worksheet = XLSX.utils.json_to_sheet(rows);
  worksheet["!cols"] = [
    { wch: 18 },
    { wch: 28 },
    { wch: 12 },
    { wch: 18 },
    { wch: 18 },
    { wch: 18 },
    { wch: 12 },
    { wch: 10 },
    { wch: 10 },
    { wch: 10 },
    { wch: 12 },
    { wch: 18 },
    { wch: 22 },
    { wch: 18 },
    { wch: 18 },
    { wch: 20 },
    { wch: 20 },
    { wch: 58 },
  ];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Visit analysis list");
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${downloadName(readParam(url.searchParams, "date_from"), readParam(url.searchParams, "date_to"))}"`,
      "Cache-Control": "no-store",
    },
  });
}

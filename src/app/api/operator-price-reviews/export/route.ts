import * as XLSX from "xlsx";
import { requireAdminSession } from "@/lib/auth-session";
import { formatJakartaDateTimeSeconds, formatIdr } from "@/lib/format";
import { getOperatorPriceReviewsExport } from "@/lib/operator-price-review";
import { normalizeOperatorPriceReviewReason } from "@/lib/operator-price-review-reasons";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireAdminSession(request);
  if (auth.response) return auth.response;

  const url = new URL(request.url);
  const locale = url.searchParams.get("locale") === "en" ? "en" : "zh";
  const state = url.searchParams.get("state") === "processed" ? "processed" : "pending";
  const result = await getOperatorPriceReviewsExport({
    state,
    dateFrom: cleanText(url.searchParams.get("date_from")),
    dateTo: cleanText(url.searchParams.get("date_to")),
    visitCode: cleanText(url.searchParams.get("visit_code")),
    reason: normalizeOperatorPriceReviewReason(url.searchParams.get("reason")),
    locale,
  });

  if (result.error) return Response.json({ error: result.error }, { status: 500 });

  const headers = [
    "Candidate ID",
    "Visit ID",
    "Visit Code",
    "Image ID",
    "Created Time",
    "Created By",
    "Product",
    "SKU",
    "Size",
    "Pieces",
    "AI Package Price",
    "Per-piece Price",
    "Reason",
    "Status",
  ];
  const rows = result.data.map((item) => [
    item.candidate_id,
    item.visit_id ?? "-",
    item.visit_code ?? "-",
    item.image_id ?? "-",
    formatJakartaDateTimeSeconds(item.created_at),
    item.created_by ?? "-",
    item.product_name,
    item.sku_label ?? "-",
    item.size ?? "-",
    item.ai_piece_count ?? "-",
    formatIdr(item.ai_package_price),
    formatIdr(item.ai_price_per_piece),
    item.operator_reason,
    item.status,
  ]);

  const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  worksheet["!cols"] = [
    { wch: 38 },
    { wch: 38 },
    { wch: 22 },
    { wch: 38 },
    { wch: 22 },
    { wch: 20 },
    { wch: 40 },
    { wch: 52 },
    { wch: 10 },
    { wch: 10 },
    { wch: 18 },
    { wch: 18 },
    { wch: 72 },
    { wch: 20 },
  ];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, locale === "zh" ? "价格异常审核" : "Price anomaly review");
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${downloadName(state)}"`,
      "Cache-Control": "no-store",
    },
  });
}

function cleanText(value: string | null) {
  const text = String(value ?? "").trim();
  return text || undefined;
}

function downloadName(state: "pending" | "processed") {
  const date = new Date().toISOString().slice(0, 10);
  return `operator-price-reviews-${state}-${date}.xlsx`;
}

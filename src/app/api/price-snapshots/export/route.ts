import { requireAdminSession } from "@/lib/auth-session";
import { buildPriceSnapshotExport } from "@/lib/price-snapshot-export";

const priceSnapshotExportFilterKeys = [
  "owner",
  "brand",
  "series",
  "ownSeries",
  "sku",
  "line",
  "priceBand",
  "size",
  "shape",
  "organization",
  "priceIndexDrill",
  "province",
  "cityName",
  "district",
  "store",
  "visitCode",
  "createdFrom",
  "createdTo",
] as const;

function downloadName() {
  const date = new Date().toISOString().slice(0, 10);
  return `price-snapshots-${date}.csv`;
}

function readExportFilters(searchParams: URLSearchParams) {
  return Object.fromEntries(priceSnapshotExportFilterKeys.map((key) => [key, searchParams.get(key)]));
}

export async function GET(request: Request) {
  const auth = await requireAdminSession(request);
  if (auth.response) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const locale = searchParams.get("locale") === "zh" ? "zh" : "en";
    const exportResult = await buildPriceSnapshotExport({
      filters: readExportFilters(searchParams),
      locale,
    });

    return new Response(exportResult.csv, {
      headers: {
        "Content-Type": "text/csv;charset=utf-8",
        "Content-Disposition": `attachment; filename="${downloadName()}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Export failed" }, { status: 500 });
  }
}

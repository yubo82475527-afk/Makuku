import { requireAdminSession } from "@/lib/auth-session";
import { buildPriceSnapshotExport } from "@/lib/price-snapshot-export";

function downloadName() {
  const date = new Date().toISOString().slice(0, 10);
  return `price-snapshots-${date}.csv`;
}

export async function GET(request: Request) {
  const auth = await requireAdminSession(request);
  if (auth.response) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const owner = searchParams.get("owner");
    const brand = searchParams.get("brand");
    const sku = searchParams.get("sku");
    const line = searchParams.get("line");
    const priceBand = searchParams.get("priceBand");
    const size = searchParams.get("size");
    const province = searchParams.get("province");
    const cityName = searchParams.get("cityName");
    const district = searchParams.get("district");
    const store = searchParams.get("store");
    const visitCode = searchParams.get("visitCode");
    const createdFrom = searchParams.get("createdFrom");
    const createdTo = searchParams.get("createdTo");
    const locale = searchParams.get("locale") === "zh" ? "zh" : "en";
    const exportResult = await buildPriceSnapshotExport({
      filters: { owner, brand, sku, line, priceBand, size, province, cityName, district, store, visitCode, createdFrom, createdTo },
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

import { requireAdminSession } from "@/lib/auth-session";
import { createSupabaseServiceClient } from "@/lib/supabase";
import type { Brand, CompetitorProduct } from "@/lib/types";

export const dynamic = "force-dynamic";

const columns = [
  "competitor_sku_code",
  "brand",
  "product_series",
  "product_name",
  "package_type",
  "size",
  "piece_count",
  "target_material_sku_code",
];

function csvEscape(value: string | number | null | undefined) {
  const text = value === null || value === undefined ? "" : String(value);
  if (!/[",\r\n]/.test(text)) return text;
  return `"${text.replaceAll('"', '""')}"`;
}

function downloadName() {
  const date = new Date().toISOString().slice(0, 10);
  return `competitor-products-${date}.csv`;
}

export async function GET(request: Request) {
  const auth = await requireAdminSession(request);
  if (auth.response) return auth.response;

  const url = new URL(request.url);
  const brand = url.searchParams.get("brand")?.trim() ?? "";
  const product = url.searchParams.get("product")?.trim() ?? "";
  const size = url.searchParams.get("size")?.trim() ?? "";
  const status = url.searchParams.get("status")?.trim() ?? "";

  const supabase = createSupabaseServiceClient();
  const [{ data: products, error: productsError }, { data: brands, error: brandsError }] = await Promise.all([
    supabase
      .from("competitor_products")
      .select("*, brands(id,name,is_own_brand), sku_matches(id, sku_master(material_sku_code))")
      .order("created_at", { ascending: false }),
    supabase.from("brands").select("id,name,is_own_brand"),
  ]);

  if (productsError) return Response.json({ error: productsError.message }, { status: 500 });
  if (brandsError) return Response.json({ error: brandsError.message }, { status: 500 });

  const ownBrandIds = new Set(((brands ?? []) as Brand[])
    .filter((item) => item.is_own_brand || isOwnBrandName(item.name))
    .map((item) => item.id));
  const rows = ((products ?? []) as CompetitorProduct[])
    .filter((item) => {
      if (ownBrandIds.has(item.brand_id)) return false;
      if (isOwnBrandName(item.brands?.name)) return false;
      if (looksLikeBrandSeries(item.brands?.name, item.product_series)) return false;
      if (brand && item.brand_id !== brand) return false;
      if (product && !productNameMatches(item, product)) return false;
      if (size && item.size !== size) return false;
      if (status === "active" && item.status === "disabled") return false;
      if (status === "disabled" && item.status !== "disabled") return false;
      return true;
    })
    .map((item) => [
      item.competitor_sku_code ?? "",
      item.brands?.name ?? "",
      item.product_series ?? "",
      item.normalized_name,
      item.package_type || "",
      item.size || "",
      item.piece_count ?? "",
      item.sku_matches?.[0]?.sku_master?.material_sku_code ?? "",
    ].map(csvEscape).join(","));

  const csv = [columns.map(csvEscape).join(","), ...rows].join("\r\n");
  return new Response(`\uFEFF${csv}`, {
    headers: {
      "Content-Type": "text/csv;charset=utf-8",
      "Content-Disposition": `attachment; filename="${downloadName()}"`,
      "Cache-Control": "no-store",
    },
  });
}

function isOwnBrandName(value: string | null | undefined) {
  return value?.trim().toLowerCase() === "makuku";
}

function looksLikeBrandSeries(brandName: string | null | undefined, productSeries: string | null | undefined) {
  const brand = brandName?.trim().toLowerCase();
  const series = productSeries?.trim().toLowerCase();
  return Boolean(brand && series && brand.endsWith(` ${series}`));
}

function productNameMatches(item: { raw_title: string; normalized_name: string }, keyword: string) {
  const normalizedKeyword = keyword.trim().toLowerCase();
  if (!normalizedKeyword) return true;
  return `${item.raw_title} ${item.normalized_name}`.toLowerCase().includes(normalizedKeyword);
}

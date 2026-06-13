import { revalidatePath } from "next/cache";
import { createSupabaseServiceClient } from "@/lib/supabase";
import { normalizePriceSnapshot } from "@/lib/business";
import { requireAdminSession } from "@/lib/auth-session";
import { ensureSkuMasterFromMaterial } from "@/lib/sku-master-bridge";
import {
  parseOfflinePriceExcel,
  productKey,
  storeKey,
  type OfflinePriceExcelPreview,
  type OfflinePriceExcelRow,
} from "@/lib/offline-price-excel-import";
import type { CompetitorProduct, MaterialMaster, SkuMaster } from "@/lib/types";

const maxFileSizeBytes = 15 * 1024 * 1024;

type Supabase = ReturnType<typeof createSupabaseServiceClient>;

export async function POST(request: Request) {
  try {
    const auth = await requireAdminSession(request);
    if (auth.response) return auth.response;

    const formData = await request.formData();
    const intent = String(formData.get("intent") ?? "preview");
    const file = formData.get("file");
    if (!(file instanceof File)) return Response.json({ error: "Missing Excel file" }, { status: 400 });
    if (file.size > maxFileSizeBytes) return Response.json({ error: "Import file must be 15MB or smaller" }, { status: 400 });
    if (!/\.(xlsx|xls|csv)$/i.test(file.name)) return Response.json({ error: "Only .xlsx, .xls, and .csv files are supported" }, { status: 400 });

    const preview = parseOfflinePriceExcel(await file.arrayBuffer(), file.name);
    if (intent !== "import") return Response.json({ preview: summarizePreview(preview) });

    const supabase = createSupabaseServiceClient();
    const result = await importPreview(supabase, preview);
    revalidatePath("/zh/prices");
    revalidatePath("/en/prices");
    revalidatePath("/zh/competitors");
    revalidatePath("/en/competitors");
    revalidatePath("/zh/competitor-products");
    revalidatePath("/en/competitor-products");
    revalidatePath("/zh/dashboard");
    revalidatePath("/en/dashboard");
    return Response.json({ preview: summarizePreview(preview), result });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Excel import failed" }, { status: 500 });
  }
}

function summarizePreview(preview: OfflinePriceExcelPreview) {
  return {
    ...preview,
    rows: preview.rows.slice(0, 50),
    errors: preview.errors.slice(0, 100),
  };
}

async function importPreview(supabase: Supabase, preview: OfflinePriceExcelPreview) {
  const validRows = preview.rows.filter((row) => row.errors.length === 0);
  const importRows = validRows.filter((row) => row.weeks.some((week) => week.package_price !== null));
  const stores = await ensureStores(supabase, importRows);
  const brands = await ensureBrands(supabase, importRows);
  const competitors = await ensureCompetitorProducts(supabase, importRows.filter((row) => !row.is_makuku), brands);
  const makukuSkuResolution = await resolveMakukuSkuMasters(supabase, importRows.filter((row) => row.is_makuku));
  const snapshots = [];
  const rowErrors: Array<{ row_number: number; errors: string[] }> = [];

  for (const row of importRows) {
    const offlineStoreId = stores.get(storeKey(row));
    if (!offlineStoreId) {
      rowErrors.push({ row_number: row.row_number, errors: ["Store was not created"] });
      continue;
    }

    const owner = row.is_makuku
      ? { sku_master_id: makukuSkuResolution.skuMasters.get(productKey(row)) ?? null, competitor_product_id: null }
      : { sku_master_id: null, competitor_product_id: competitors.get(productKey(row)) ?? null };
    if (!owner.sku_master_id && !owner.competitor_product_id) {
      const makukuError = makukuSkuResolution.ambiguousKeys.has(productKey(row)) ? "Makuku SKU ambiguous" : "Makuku SKU not matched";
      rowErrors.push({ row_number: row.row_number, errors: [row.is_makuku ? makukuError : "Competitor product was not created"] });
      continue;
    }

    for (const week of row.weeks) {
      if (!week.package_price || !row.piece_count) continue;
      const normalized = normalizePriceSnapshot({
        promo_price_idr: week.package_price,
        piece_count: row.piece_count,
      });
      snapshots.push({
        offline_store_id: offlineStoreId,
        competitor_product_id: owner.competitor_product_id,
        sku_master_id: owner.sku_master_id,
        channel: "offline",
        list_price_idr: week.package_price,
        promo_price_idr: week.package_price,
        voucher_value_idr: 0,
        shipping_subsidy_idr: 0,
        net_price_idr: normalized.net_price_idr,
        price_per_piece: normalized.price_per_piece,
        promo_type: null,
        captured_at: week.captured_at,
        source: week.source,
        evidence_url: null,
      });
    }
  }

  let insertedSnapshots = 0;
  let updatedSnapshots = 0;
  for (const chunk of chunks(snapshots, 500)) {
    const { data, error } = await supabase.rpc("import_excel_price_snapshots", { snapshots: chunk });
    if (error) throw new Error(error.message);
    const summary = Array.isArray(data) ? data[0] : data;
    insertedSnapshots += Number(summary?.inserted_count ?? 0);
    updatedSnapshots += Number(summary?.updated_count ?? 0);
  }

  return {
    stores: preview.store_count,
    competitor_products: uniqueBy(importRows.filter((row) => !row.is_makuku), productKey).length,
    makuku_skus: makukuSkuResolution.skuMasters.size,
    inserted_snapshots: insertedSnapshots,
    updated_snapshots: updatedSnapshots,
    skipped_snapshots: rowErrors.length,
    row_errors: rowErrors.slice(0, 100),
  };
}

async function ensureStores(supabase: Supabase, rows: OfflinePriceExcelRow[]) {
  const { data, error } = await supabase
    .from("offline_stores")
    .select("id,name,city,channel_type,province,city_name")
    .limit(10000);
  if (error) throw new Error(error.message);

  const stores = new Map<string, string>();
  for (const store of data ?? []) {
    stores.set(storeKey({
      area: store.province ?? "",
      city: store.city_name ?? store.city ?? "",
      store_name: store.name ?? "",
      store_type: store.channel_type ?? "",
    }), String(store.id));
  }

  const missingRows = uniqueBy(rows, storeKey).filter((row) => !stores.has(storeKey(row)));
  if (missingRows.length > 0) {
    const { data: inserted, error: insertError } = await supabase
      .from("offline_stores")
      .insert(missingRows.map((row) => ({
        name: row.store_name,
        city: row.city,
        channel_type: row.store_type,
        province: row.area,
        city_name: row.city,
        district: null,
        status: "enabled",
      })))
      .select("id,name,city,channel_type,province,city_name");
    if (insertError) throw new Error(insertError.message);
    for (const store of inserted ?? []) {
      stores.set(storeKey({
        area: store.province ?? "",
        city: store.city_name ?? store.city ?? "",
        store_name: store.name ?? "",
        store_type: store.channel_type ?? "",
      }), String(store.id));
    }
  }

  return stores;
}

async function ensureBrands(supabase: Supabase, rows: OfflinePriceExcelRow[]) {
  const brandNames = Array.from(new Set(rows.filter((row) => !row.is_makuku).map((row) => row.brand))).filter(Boolean);
  const { data, error } = await supabase.from("brands").select("id,name,is_own_brand").limit(10000);
  if (error) throw new Error(error.message);
  const brands = new Map((data ?? []).map((brand) => [normalizeKey(brand.name), String(brand.id)]));
  const missing = brandNames.filter((name) => !brands.has(normalizeKey(name)));
  if (missing.length > 0) {
    const { data: inserted, error: insertError } = await supabase
      .from("brands")
      .insert(missing.map((name) => ({ name, country: "Indonesia", is_own_brand: false })))
      .select("id,name");
    if (insertError) throw new Error(insertError.message);
    for (const brand of inserted ?? []) brands.set(normalizeKey(brand.name), String(brand.id));
  }
  return brands;
}

async function ensureCompetitorProducts(supabase: Supabase, rows: OfflinePriceExcelRow[], brands: Map<string, string>) {
  const { data, error } = await supabase
    .from("competitor_products")
    .select("*, brands(id,name)")
    .limit(10000);
  if (error) throw new Error(error.message);

  const products = new Map<string, string>();
  for (const product of (data ?? []) as CompetitorProduct[]) {
    const brandName = product.brands?.name ?? "";
    products.set(productKey({
      brand: brandName,
      package_type: product.package_type ?? "unknown",
      product_name: product.normalized_name,
      size: product.size ?? "",
      piece_count: product.piece_count ?? null,
    }), product.id);
  }

  const missingRows = uniqueBy(rows, productKey).filter((row) => !products.has(productKey(row)));
  if (missingRows.length > 0) {
    const { data: inserted, error: insertError } = await supabase
      .from("competitor_products")
      .insert(missingRows.map((row) => ({
        brand_id: brands.get(normalizeKey(row.brand)),
        raw_title: row.product_name,
        normalized_name: row.product_name,
        channel: "manual",
        shop_name: null,
        product_url: null,
        image_url: null,
        pack_type: inferPackType(row.product_name),
        package_type: row.package_type,
        size: row.size,
        piece_count: row.piece_count,
        segment: row.segment,
        status: "active",
      })))
      .select("*, brands(id,name)");
    if (insertError) throw new Error(insertError.message);
    for (const product of (inserted ?? []) as CompetitorProduct[]) {
      products.set(productKey({
        brand: product.brands?.name ?? "",
        package_type: product.package_type ?? "unknown",
        product_name: product.normalized_name,
        size: product.size ?? "",
        piece_count: product.piece_count ?? null,
      }), product.id);
    }
  }

  return products;
}

async function resolveMakukuSkuMasters(supabase: Supabase, rows: OfflinePriceExcelRow[]) {
  const { data: materials, error: materialError } = await supabase.from("material_master").select("*").limit(10000);
  if (materialError) throw new Error(materialError.message);
  const { data: skuMasters, error: skuError } = await supabase.from("sku_master").select("*").limit(10000);
  if (skuError) throw new Error(skuError.message);

  const resolved = new Map<string, string>();
  const ambiguousKeys = new Set<string>();
  for (const row of uniqueBy(rows, productKey)) {
    const materialMatch = findMatchingMaterial(row, (materials ?? []) as MaterialMaster[]);
    if (materialMatch.status === "ambiguous") {
      ambiguousKeys.add(productKey(row));
      continue;
    }
    if (materialMatch.material?.tenant_sku_code) {
      resolved.set(productKey(row), await ensureSkuMasterFromMaterial(supabase, materialMatch.material.tenant_sku_code));
      continue;
    }
    const sku = findMatchingSku(row, (skuMasters ?? []) as SkuMaster[]);
    if (sku?.id) resolved.set(productKey(row), sku.id);
  }
  return { skuMasters: resolved, ambiguousKeys };
}

function findMatchingMaterial(row: OfflinePriceExcelRow, materials: MaterialMaster[]) {
  const rowLine = inferMakukuProductLine(row);
  if (!rowLine) return { status: "not_matched" as const, material: null };

  const candidates = materials.filter((material) => {
    const materialLine = normalizeKey(material.sub_brand);
    if (normalizeKey(material.brand) !== "makuku" && !normalizeKey(material.brand).includes("makuku")) return false;
    if (rowLine !== materialLine) return false;
    if (!sizeMatches(material.sub_type, row.size)) return false;
    if (Number(material.pack_count) !== Number(row.piece_count)) return false;
    return true;
  });

  if (candidates.length <= 1) return { status: candidates[0] ? "matched" as const : "not_matched" as const, material: candidates[0] ?? null };
  candidates.sort((left, right) => scoreMaterialMatch(row, right) - scoreMaterialMatch(row, left));
  return scoreMaterialMatch(row, candidates[0]) > scoreMaterialMatch(row, candidates[1])
    ? { status: "matched" as const, material: candidates[0] }
    : { status: "ambiguous" as const, material: null };
}

function findMatchingSku(row: OfflinePriceExcelRow, skus: SkuMaster[]) {
  return skus.find((sku) => {
    if (normalizeKey(sku.size) !== normalizeKey(row.size)) return false;
    if (Number(sku.piece_count) !== Number(row.piece_count)) return false;
    return normalizeKey(sku.makuku_sku_name).includes(normalizeKey(row.product_name));
  });
}

function inferPackType(productName: string) {
  return productName.toLowerCase().includes("tape") ? "tape" : "pants";
}

function inferMakukuProductLine(row: Pick<OfflinePriceExcelRow, "brand" | "product_name">) {
  const value = normalizeKey(`${row.brand} ${row.product_name}`);
  if (value.includes("dry care")) return "dry care";
  if (value.includes("pro care")) return "pro care";
  if (value.includes("slim care")) return "slim care";
  if (value.includes("comfort fit") || value.includes("makuku fit")) return "comfort fit";
  if (value.includes("slim")) return "slim";
  return "";
}

function scoreMaterialMatch(row: OfflinePriceExcelRow, material: MaterialMaster) {
  const materialName = normalizeKey(material.tenant_sku_name);
  const rowSpec = extractSizePackSpec(row.product_name);
  let score = 0;
  if (rowSpec && materialName.replace(/\s+/g, "").includes(rowSpec.replace(/\s+/g, ""))) score += 100;
  if (row.product_name.includes("+") && materialName.includes("3 0")) score += 20;
  if (["super jumbo pack", "jumbo pack", "big pack"].includes(normalizeKey(material.type))) score += 5;
  return score;
}

function extractSizePackSpec(value: string) {
  const match = normalizeKey(value).match(/\b(nb|s|m|l|xl|xxl|xxxl|xxxxl)\s*(\d+\s*\+\s*\d+|\d+)\b/);
  return match ? match[0] : "";
}

function sizeMatches(materialSize: unknown, rowSize: string) {
  const normalizedRowSize = normalizeKey(rowSize);
  return normalizeKey(materialSize).split(/[^a-z0-9]+/).includes(normalizedRowSize);
}

function normalizeKey(value: unknown) {
  return String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9+]+/g, " ");
}

function uniqueBy<T>(items: T[], keyFn: (item: T) => string) {
  const map = new Map<string, T>();
  for (const item of items) {
    const key = keyFn(item);
    if (!map.has(key)) map.set(key, item);
  }
  return Array.from(map.values());
}

function chunks<T>(items: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}

import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

function loadEnv() {
  for (const envPath of [
    path.resolve(process.cwd(), ".env.local"),
    path.resolve(process.cwd(), "..", "..", ".env.local"),
  ]) {
    if (!existsSync(envPath)) continue;
    const env = readFileSync(envPath, "utf8");
    for (const line of env.split(/\r?\n/)) {
      const index = line.indexOf("=");
      if (index <= 0) continue;
      const key = line.slice(0, index).trim();
      const value = line.slice(index + 1).trim();
      if (key && !process.env[key]) process.env[key] = value;
    }
    return;
  }
}

function clean(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[^a-zA-Z0-9.]+/g, " ")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

function normalizeSize(value) {
  const raw = String(value ?? "").trim().toUpperCase();
  if (/^NB\s*\/\s*NB[-\s]?S$/.test(raw)) return "NB";
  const text = clean(value);
  if (!text) return null;
  if (text === "MEDIUM") return "M";
  if (text === "LARGE") return "L";
  if (text === "EXTRA LARGE") return "XL";
  if (text === "3XL") return "XXXL";
  if (text === "NB-S" || text === "NB S" || text === "NB NB S") return "NB";
  return text.replace(/^SIZE\s+/, "");
}

function parseVariant(text) {
  const rawVersion = String(text ?? "").match(/\b(\d+\.\d+)\b/)?.[1] ?? null;
  if (rawVersion) return rawVersion;
  const cleaned = clean(text);
  if (/\bLUXURY\b/.test(cleaned) && /\bSILKY\b/.test(cleaned)) return "LUXURY SILKY";
  if (/\bSLIM\b/.test(cleaned) && !/\bSILKY\b/.test(cleaned)) return "REGULAR";
  return null;
}

function ownMaterialSignature(item) {
  return {
    entityType: "material_master",
    id: item.tenant_sku_code,
    label: `${item.tenant_sku_code} ${item.tenant_sku_name}`,
    brand: clean(item.brand) || null,
    series: clean(item.sub_brand) || null,
    shape: /\bTAPE\b/.test(clean(`${item.tenant_sku_name} ${item.sub_category}`)) ? "TAPE"
      : /\bPANTS?\b/.test(clean(`${item.tenant_sku_name} ${item.sub_category}`)) ? "PANTS"
      : null,
    size: normalizeSize(item.sub_type),
    pieceCount: Number.isInteger(Number(item.pack_count)) ? Number(item.pack_count) : null,
    variant: parseVariant(item.tenant_sku_name),
    packageLevel: clean(item.type).includes("JUMBO") ? "JUMBO" : clean(item.type).includes("BIG") ? "REGULAR" : null,
  };
}

function competitorSignature(item) {
  return {
    entityType: "competitor_products",
    id: item.id,
    label: `${item.brands?.name ?? ""} ${item.normalized_name ?? item.raw_title ?? ""}`.trim(),
    brand: clean(item.brands?.name) || null,
    series: clean(item.product_series) || null,
    shape: /\bTAPE\b/.test(clean(`${item.raw_title} ${item.pack_type}`)) ? "TAPE"
      : /\bPANTS?\b/.test(clean(`${item.raw_title} ${item.pack_type}`)) ? "PANTS"
      : null,
    size: normalizeSize(item.size),
    pieceCount: Number.isInteger(Number(item.piece_count)) ? Number(item.piece_count) : null,
    variant: parseVariant(`${item.raw_title} ${item.normalized_name}`),
    packageLevel: clean(item.package_type) || null,
  };
}

function signatureKey(signature) {
  return [
    signature.entityType,
    signature.brand,
    signature.series,
    signature.shape,
    signature.size,
    signature.pieceCount,
    signature.variant,
  ].join("|");
}

loadEnv();

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing Supabase environment variables.");
}

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const [{ data: materials, error: materialError }, { data: competitors, error: competitorError }] = await Promise.all([
  supabase.from("material_master").select("*").limit(5000),
  supabase.from("competitor_products").select("*, brands(id,name)").limit(5000),
]);

if (materialError) throw new Error(materialError.message);
if (competitorError) throw new Error(competitorError.message);

const signatures = [
  ...(materials ?? []).map(ownMaterialSignature),
  ...(competitors ?? []).map(competitorSignature),
];

const grouped = new Map();
for (const signature of signatures) {
  const key = signatureKey(signature);
  const items = grouped.get(key) ?? [];
  items.push(signature);
  grouped.set(key, items);
}

const duplicateSignatures = Array.from(grouped.entries())
  .filter(([, items]) => items.length > 1)
  .map(([key, items]) => ({ key, count: items.length, items }));

const conflictSignatures = signatures.filter((signature) => {
  return !signature.brand || !signature.series || !signature.shape || !signature.size || !signature.pieceCount;
});

console.log(JSON.stringify({
  materialCount: materials?.length ?? 0,
  competitorCount: competitors?.length ?? 0,
  duplicateSignatures,
  conflictSignatures,
}, null, 2));

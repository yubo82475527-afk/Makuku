import { revalidatePath } from "next/cache";
import { formReturnRedirect, readRequestBody } from "@/lib/request";
import { getMarketBenchmarks } from "@/lib/data";
import { createSupabaseServiceClient, hasSupabaseServiceConfig } from "@/lib/supabase";
import type { CompetitorProduct, PriceSnapshot, SkuMaster } from "@/lib/types";

export const dynamic = "force-dynamic";

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function cleanNullable(value: unknown) {
  const text = clean(value);
  return text || null;
}

function cleanPrice(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function productLineLabel(value: SkuMaster["pack_type"] | undefined) {
  if (value === "pants") return "Pants";
  if (value === "tape") return "Tape";
  return "";
}

function revalidateMarketBenchmarkViews() {
  revalidatePath("/zh/dashboard");
  revalidatePath("/en/dashboard");
  revalidatePath("/zh/market-benchmarks");
  revalidatePath("/en/market-benchmarks");
  revalidatePath("/zh/prices");
  revalidatePath("/en/prices");
}

export async function GET() {
  const result = await getMarketBenchmarks();
  return Response.json({ benchmarks: result.data, demo: result.isDemo, error: result.error });
}

export async function POST(request: Request) {
  const { body, isForm } = await readRequestBody(request);
  const supabase = hasSupabaseServiceConfig() ? createSupabaseServiceClient() : null;
  const payload = await deriveBenchmarkPayload(body, supabase);

  if (!payload.product_line || !payload.price_band || !payload.size || !payload.benchmark_sku_name || !payload.benchmark_price_per_piece) {
    return Response.json({ error: "Missing required benchmark fields" }, { status: 400 });
  }

  if (!hasSupabaseServiceConfig()) {
    if (isForm) return formReturnRedirect(request, body, "/market-benchmarks");
    return Response.json({ benchmark: { id: `demo-benchmark-${Date.now()}`, ...payload, created_at: new Date().toISOString(), updated_at: null }, demo: true });
  }

  if (!supabase) return Response.json({ error: "Missing Supabase service client" }, { status: 500 });
  if (payload.active) await disableExistingActiveBenchmark(supabase, payload);
  const { data, error } = await supabase
    .from("market_benchmarks")
    .insert(payload)
    .select("*, competitor_products(*, brands(id,name), sku_matches(*, sku_master(*)))")
    .single();

  if (error) return Response.json({ error: error.message }, { status: 400 });
  revalidateMarketBenchmarkViews();
  if (isForm) return formReturnRedirect(request, body, "/market-benchmarks");
  return Response.json({ benchmark: data });
}

export async function PATCH(request: Request) {
  const { body } = await readRequestBody(request);
  const id = clean(body.id);
  if (!id) return Response.json({ error: "Missing benchmark id" }, { status: 400 });

  const payload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  for (const key of ["market", "province", "city_name", "district", "category", "product_line", "price_band", "size", "benchmark_competitor_product_id", "benchmark_sku_name", "currency", "notes"] as const) {
    if (body[key] !== undefined) payload[key] = cleanNullable(body[key]);
  }
  if (body.cityName !== undefined) payload.city_name = cleanNullable(body.cityName);
  if (body.benchmark_price_per_piece !== undefined) payload.benchmark_price_per_piece = cleanPrice(body.benchmark_price_per_piece);
  if (body.active !== undefined) payload.active = Boolean(body.active);

  if (!hasSupabaseServiceConfig()) return Response.json({ benchmark: { id, ...payload }, demo: true });

  const supabase = createSupabaseServiceClient();
  if (payload.active === true) {
    const current = await supabase
      .from("market_benchmarks")
      .select("market,province,city_name,district,category,product_line,price_band,size")
      .eq("id", id)
      .single();
    if (current.data) await disableExistingActiveBenchmark(supabase, { ...current.data, ...payload, id });
  }
  const { data, error } = await supabase
    .from("market_benchmarks")
    .update(payload)
    .eq("id", id)
    .select("id,active,updated_at")
    .single();

  if (error) return Response.json({ error: error.message }, { status: 400 });
  revalidateMarketBenchmarkViews();
  return Response.json({ benchmark: data });
}

async function deriveBenchmarkPayload(body: Record<string, unknown>, supabase: ReturnType<typeof createSupabaseServiceClient> | null) {
  const competitorProductId = cleanNullable(body.benchmark_competitor_product_id);
  const competitor = competitorProductId && supabase ? await getBenchmarkCompetitorProduct(supabase, competitorProductId) : null;
  const matchedSku = competitor?.sku_matches?.find((match) => match.sku_master)?.sku_master ?? null;
  const latestPrice = competitorProductId && supabase ? await getLatestCompetitorPrice(supabase, competitorProductId) : null;
  const benchmarkSkuName = clean(body.benchmark_sku_name)
    || [competitor?.brands?.name, competitor?.normalized_name].filter(Boolean).join(" ")
    || competitor?.normalized_name
    || competitor?.raw_title
    || "";

  return {
    market: clean(body.market) || "Indonesia",
    province: cleanNullable(body.province),
    city_name: cleanNullable(body.city_name ?? body.cityName),
    district: cleanNullable(body.district),
    category: clean(body.category) || "Diapers",
    product_line: clean(body.product_line) || productLineLabel(matchedSku?.pack_type),
    price_band: clean(body.price_band) || matchedSku?.segment || competitor?.segment || "",
    size: clean(body.size) || matchedSku?.size || competitor?.size || "",
    benchmark_competitor_product_id: competitorProductId,
    benchmark_sku_name: benchmarkSkuName,
    benchmark_price_per_piece: cleanPrice(body.benchmark_price_per_piece) ?? latestPrice,
    currency: clean(body.currency) || "IDR",
    active: body.active === undefined ? true : Boolean(body.active),
    notes: cleanNullable(body.notes),
  };
}

async function getBenchmarkCompetitorProduct(supabase: ReturnType<typeof createSupabaseServiceClient>, id: string) {
  const { data } = await supabase
    .from("competitor_products")
    .select("*, brands(id,name), sku_matches(*, sku_master(*))")
    .eq("id", id)
    .single();
  return data as CompetitorProduct | null;
}

async function getLatestCompetitorPrice(supabase: ReturnType<typeof createSupabaseServiceClient>, competitorProductId: string) {
  const { data } = await supabase
    .from("price_snapshots")
    .select("price_per_piece,captured_at")
    .eq("competitor_product_id", competitorProductId)
    .order("captured_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const snapshot = data as Pick<PriceSnapshot, "price_per_piece"> | null;
  return cleanPrice(snapshot?.price_per_piece);
}

async function disableExistingActiveBenchmark(
  supabase: ReturnType<typeof createSupabaseServiceClient>,
  payload: {
    id?: unknown;
    market?: unknown;
    province?: unknown;
    city_name?: unknown;
    district?: unknown;
    category?: unknown;
    product_line?: unknown;
    price_band?: unknown;
    size?: unknown;
  },
) {
  let query = supabase
    .from("market_benchmarks")
    .update({ active: false, updated_at: new Date().toISOString() })
    .eq("active", true)
    .eq("market", clean(payload.market) || "Indonesia")
    .eq("category", clean(payload.category) || "Diapers")
    .eq("product_line", clean(payload.product_line))
    .eq("price_band", clean(payload.price_band))
    .eq("size", clean(payload.size));

  for (const [column, value] of [
    ["province", payload.province],
    ["city_name", payload.city_name],
    ["district", payload.district],
  ] as const) {
    const text = cleanNullable(value);
    query = text ? query.eq(column, text) : query.is(column, null);
  }
  if (payload.id) query = query.neq("id", clean(payload.id));
  await query;
}

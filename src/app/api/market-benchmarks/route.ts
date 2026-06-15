import { revalidatePath } from "next/cache";
import { formReturnRedirect, readRequestBody } from "@/lib/request";
import { getMarketBenchmarkRules } from "@/lib/data";
import { calculateBenchmarkAverage, currentBenchmarkPeriod } from "@/lib/market-benchmark-rules";
import { createSupabaseServiceClient, hasSupabaseServiceConfig } from "@/lib/supabase";
import { requireAdminSession } from "@/lib/auth-session";
import type { MarketBenchmarkPeriodPrice, MarketBenchmarkRule, PriceSnapshot } from "@/lib/types";

export const dynamic = "force-dynamic";

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function cleanNullable(value: unknown) {
  const text = clean(value);
  return text || null;
}

function revalidateMarketBenchmarkViews() {
  revalidatePath("/zh/market-benchmarks");
  revalidatePath("/en/market-benchmarks");
}

export async function GET() {
  const result = await getMarketBenchmarkRules();
  return Response.json({ rules: result.data, demo: result.isDemo, error: result.error });
}

export async function POST(request: Request) {
  const auth = await requireAdminSession(request);
  if (auth.response) return auth.response;
  const { body, isForm } = await readRequestBody(request);
  if (clean(body.intent) === "backfill_period_prices") {
    const result = validateBackfillBody(body);
    if ("error" in result) return Response.json({ error: result.error }, { status: 400 });
    const backfillResult = await backfillPeriodPrices(result);
    if (isForm) return formReturnRedirect(request, body, "/market-benchmarks");
    return Response.json(backfillResult);
  }

  const payload = {
    market: clean(body.market) || "Indonesia",
    province: clean(body.province),
    city_name: clean(body.city_name ?? body.cityName),
    district: cleanNullable(body.district),
    brand_id: clean(body.brand_id),
    product_series: cleanNullable(body.product_series),
    notes: cleanNullable(body.notes),
    active: true,
  };

  if (!payload.province || !payload.city_name || !payload.brand_id) {
    return Response.json({ error: "Missing required fields: province, city_name, brand_id" }, { status: 400 });
  }

  if (!hasSupabaseServiceConfig()) {
    if (isForm) return formReturnRedirect(request, body, "/market-benchmarks");
    return Response.json({ rule: { id: `demo-market-benchmark-rule-${Date.now()}`, ...payload }, demo: true });
  }

  const supabase = createSupabaseServiceClient();
  const existing = await findActiveRule(supabase, payload);
  const rule = existing
    ? await updateRule(supabase, existing.id, payload.notes)
    : await insertRule(supabase, payload);
  const price = await refreshCurrentPeriodPrice(supabase, rule);

  revalidateMarketBenchmarkViews();
  if (isForm) return formReturnRedirect(request, body, "/market-benchmarks");
  return Response.json({ rule, period_price: price });
}

function validateBackfillBody(body: Record<string, unknown>) {
  const periodType: "week" | "month" = clean(body.period_type) === "month" ? "month" : "week";
  const startDate = clean(body.start_date);
  const endDate = clean(body.end_date);
  const scope = clean(body.scope) || "all";
  const ruleId = clean(body.rule_id);
  const overwrite = body.overwrite === "on" || body.overwrite === true;
  if (!startDate || !endDate || startDate > endDate) {
    return { error: "Missing or invalid start_date/end_date" };
  }
  if (scope === "current" && !ruleId) {
    return { error: "Missing rule_id for selected scope" };
  }
  return { periodType, startDate, endDate, scope, ruleId, overwrite };
}

async function backfillPeriodPrices(input: {
  periodType: "week" | "month";
  startDate: string;
  endDate: string;
  scope: string;
  ruleId: string;
  overwrite: boolean;
}) {
  if (!hasSupabaseServiceConfig()) {
    return { demo: true, inserted: 0, updated: 0, skipped: 0, no_sample: 0 };
  }

  const supabase = createSupabaseServiceClient();
  const rules = await getRulesForBackfill(supabase, input.scope === "current" ? input.ruleId : null);
  const snapshots = await getRuleSnapshots(supabase);
  const periods = buildPeriods(input.periodType, input.startDate, input.endDate);
  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  let noSample = 0;

  for (const rule of rules) {
    for (const period of periods) {
      const calculated = calculateBenchmarkAverage({ rule, snapshots, period });
      if (!calculated) {
        noSample += 1;
        continue;
      }
      const existing = await getExistingPeriodPrice(supabase, rule.id, period.periodType, period.startDate, period.endDate);
      if (existing && !input.overwrite) {
        skipped += 1;
        continue;
      }
      await upsertPeriodPrice(supabase, {
        benchmark_rule_id: rule.id,
        period_type: period.periodType,
        start_date: period.startDate,
        end_date: period.endDate,
        benchmark_price_per_piece: calculated.benchmark_price_per_piece,
        sample_count: calculated.sample_count,
        currency: "IDR",
        status: "calculated",
      });
      if (existing) updated += 1;
      else inserted += 1;
    }
  }

  revalidateMarketBenchmarkViews();
  return { inserted, updated, skipped, no_sample: noSample, rules: rules.length, periods: periods.length };
}

async function findActiveRule(
  supabase: ReturnType<typeof createSupabaseServiceClient>,
  payload: Pick<MarketBenchmarkRule, "market" | "province" | "city_name" | "district" | "brand_id" | "product_series">,
) {
  let query = supabase
    .from("market_benchmark_rules")
    .select("*")
    .eq("active", true)
    .eq("market", payload.market)
    .ilike("province", payload.province)
    .ilike("city_name", payload.city_name)
    .eq("brand_id", payload.brand_id);

  query = payload.district ? query.ilike("district", payload.district) : query.is("district", null);
  query = payload.product_series ? query.ilike("product_series", payload.product_series) : query.is("product_series", null);
  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(error.message);
  return data as MarketBenchmarkRule | null;
}

async function insertRule(
  supabase: ReturnType<typeof createSupabaseServiceClient>,
  payload: Pick<MarketBenchmarkRule, "market" | "province" | "city_name" | "district" | "brand_id" | "product_series" | "notes" | "active">,
) {
  const { data, error } = await supabase
    .from("market_benchmark_rules")
    .insert(payload)
    .select("*, brands(id,name), market_benchmark_period_prices(*)")
    .single();
  if (error) throw new Error(error.message);
  return data as MarketBenchmarkRule;
}

async function updateRule(
  supabase: ReturnType<typeof createSupabaseServiceClient>,
  id: string,
  notes: string | null,
) {
  const { data, error } = await supabase
    .from("market_benchmark_rules")
    .update({ notes, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*, brands(id,name), market_benchmark_period_prices(*)")
    .single();
  if (error) throw new Error(error.message);
  return data as MarketBenchmarkRule;
}

async function refreshCurrentPeriodPrice(
  supabase: ReturnType<typeof createSupabaseServiceClient>,
  rule: MarketBenchmarkRule,
) {
  const period = currentBenchmarkPeriod("week");
  const snapshots = await getRuleSnapshots(supabase);
  const calculated = calculateBenchmarkAverage({ rule, snapshots, period });
  if (calculated) {
    return upsertPeriodPrice(supabase, {
      benchmark_rule_id: rule.id,
      period_type: period.periodType,
      start_date: period.startDate,
      end_date: period.endDate,
      benchmark_price_per_piece: calculated.benchmark_price_per_piece,
      sample_count: calculated.sample_count,
      currency: "IDR",
      status: "calculated",
    });
  }

  const carriedForward = await getLatestPriorPeriodPrice(supabase, rule.id, period.startDate);
  if (!carriedForward) return null;
  return upsertPeriodPrice(supabase, {
    benchmark_rule_id: rule.id,
    period_type: period.periodType,
    start_date: period.startDate,
    end_date: period.endDate,
    benchmark_price_per_piece: carriedForward.benchmark_price_per_piece,
    sample_count: 0,
    currency: carriedForward.currency,
    status: "carried_forward",
  });
}

async function getRuleSnapshots(supabase: ReturnType<typeof createSupabaseServiceClient>) {
  const { data, error } = await supabase
    .from("price_snapshots")
    .select("*, offline_stores(id,name,city,province,city_name,district,channel_type), competitor_products(*, brands(id,name)), ai_price_candidates(id, offline_store_visits(id,store_name,city,province,city_name,district,channel_type,visit_date,uploader_name,created_at))")
    .not("competitor_product_id", "is", null)
    .limit(5000);
  if (error) throw new Error(error.message);
  return (data ?? []) as PriceSnapshot[];
}

async function getRulesForBackfill(
  supabase: ReturnType<typeof createSupabaseServiceClient>,
  ruleId: string | null,
) {
  let query = supabase
    .from("market_benchmark_rules")
    .select("*, brands(id,name), market_benchmark_period_prices(*)")
    .eq("active", true);
  if (ruleId) query = query.eq("id", ruleId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as MarketBenchmarkRule[];
}

async function getExistingPeriodPrice(
  supabase: ReturnType<typeof createSupabaseServiceClient>,
  ruleId: string,
  periodType: string,
  startDate: string,
  endDate: string,
) {
  const { data, error } = await supabase
    .from("market_benchmark_period_prices")
    .select("id")
    .eq("benchmark_rule_id", ruleId)
    .eq("period_type", periodType)
    .eq("start_date", startDate)
    .eq("end_date", endDate)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as { id: string } | null;
}

async function getLatestPriorPeriodPrice(
  supabase: ReturnType<typeof createSupabaseServiceClient>,
  ruleId: string,
  beforeStartDate: string,
) {
  const { data, error } = await supabase
    .from("market_benchmark_period_prices")
    .select("*")
    .eq("benchmark_rule_id", ruleId)
    .eq("period_type", "week")
    .lt("start_date", beforeStartDate)
    .order("start_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as MarketBenchmarkPeriodPrice | null;
}

async function upsertPeriodPrice(
  supabase: ReturnType<typeof createSupabaseServiceClient>,
  payload: Omit<MarketBenchmarkPeriodPrice, "id" | "created_at" | "updated_at">,
) {
  const { data, error } = await supabase
    .from("market_benchmark_period_prices")
    .upsert({ ...payload, updated_at: new Date().toISOString() }, { onConflict: "benchmark_rule_id,period_type,start_date,end_date" })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as MarketBenchmarkPeriodPrice;
}

function buildPeriods(periodType: "week" | "month", startDate: string, endDate: string) {
  const periods = [];
  let cursor = parseLocalDate(startDate);
  const end = parseLocalDate(endDate);
  while (cursor <= end) {
    const period = currentBenchmarkPeriod(periodType, cursor);
    const boundedStart = period.startDate < startDate ? startDate : period.startDate;
    const boundedEnd = period.endDate > endDate ? endDate : period.endDate;
    periods.push({ ...period, startDate: boundedStart, endDate: boundedEnd });
    cursor = parseLocalDate(period.endDate);
    cursor.setDate(cursor.getDate() + 1);
  }
  return periods;
}

function parseLocalDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1);
}

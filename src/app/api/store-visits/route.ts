import { demoOfflineStoreVisits } from "@/lib/demo-data";
import { createSupabaseServiceClient, hasSupabaseServiceConfig } from "@/lib/supabase";
import { loadActiveAiJobsForVisits } from "@/lib/store-visit-ai-jobs";
import type { OfflineStoreVisit, StoreVisitAiResult, StoreVisitAiJobSummary } from "@/lib/types";

const defaultPageSize = 20;
const maxPageSize = 50;

function readPositiveInt(value: string | null, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.floor(parsed));
}

function todayRange() {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

function todayVisitDateValue(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function isVisitOnToday(visit: OfflineStoreVisit, todayVisitDate: string, start: string, end: string) {
  if (visit.visit_date) return visit.visit_date === todayVisitDate;
  return visit.created_at >= start && visit.created_at < end;
}

function storeDedupKey(visit: Pick<OfflineStoreVisit, "store_id" | "store_name" | "region" | "channel" | "city" | "channel_type">) {
  if (visit.store_id) return `store:${visit.store_id}`;
  return [
    "fallback",
    visit.store_name?.trim().toLowerCase() ?? "",
    visit.region?.trim().toLowerCase() ?? "",
    visit.channel?.trim().toLowerCase() ?? "",
    visit.city?.trim().toLowerCase() ?? "",
    visit.channel_type?.trim().toLowerCase() ?? "",
  ].join("|");
}

async function loadTodayRowsWithVisitDate(params: {
  supabase: ReturnType<typeof createSupabaseServiceClient>;
  userId: string;
  todayVisitDate: string;
}) {
  const uploaderResult = await params.supabase
    .from("offline_store_visits")
    .select("store_id,store_name,region,channel,city,channel_type")
    .eq("uploader_user_id", params.userId)
    .eq("visit_date", params.todayVisitDate);

  const legacyUserResult = await params.supabase
    .from("offline_store_visits")
    .select("store_id,store_name,region,channel,city,channel_type")
    .eq("user_id", params.userId)
    .is("uploader_user_id", null)
    .eq("visit_date", params.todayVisitDate);

  return {
    uploaderResult,
    legacyUserResult,
    rows: [
      ...((uploaderResult.data ?? []) as OfflineStoreVisit[]),
      ...(legacyUserResult.error ? [] : ((legacyUserResult.data ?? []) as OfflineStoreVisit[])),
    ],
  };
}

async function loadLegacyTodayRowsWithoutVisitDate(params: {
  supabase: ReturnType<typeof createSupabaseServiceClient>;
  userId: string;
  start: string;
  end: string;
}) {
  const uploaderResult = await params.supabase
    .from("offline_store_visits")
    .select("store_id,store_name,region,channel,city,channel_type")
    .eq("uploader_user_id", params.userId)
    .is("visit_date", null)
    .gte("created_at", params.start)
    .lt("created_at", params.end);

  const legacyUserResult = await params.supabase
    .from("offline_store_visits")
    .select("store_id,store_name,region,channel,city,channel_type")
    .eq("user_id", params.userId)
    .is("uploader_user_id", null)
    .is("visit_date", null)
    .gte("created_at", params.start)
    .lt("created_at", params.end);

  return {
    uploaderResult,
    legacyUserResult,
    rows: [
      ...((uploaderResult.data ?? []) as OfflineStoreVisit[]),
      ...(legacyUserResult.error ? [] : ((legacyUserResult.data ?? []) as OfflineStoreVisit[])),
    ],
  };
}

function photoCount(visit: OfflineStoreVisit) {
  const legacyCount = Array.isArray(visit.image_urls) ? visit.image_urls.length : 0;
  const rowCount = visit.offline_visit_images?.length ?? 0;
  return Math.max(legacyCount, rowCount);
}

function formatVisitRegion(visit: OfflineStoreVisit) {
  const structured = [visit.province, visit.city_name, visit.district].map((value) => value?.trim()).filter(Boolean).join(" / ");
  return visit.region ?? structured ?? visit.city ?? null;
}

function serializeVisit(visit: OfflineStoreVisit, activeAiJob?: StoreVisitAiJobSummary | null) {
  const storeSummary = typeof visit.ai_result?.store_summary === "string" ? visit.ai_result.store_summary : null;
  const keySkuPrices = Array.isArray(visit.ai_result?.price_insights?.key_sku_prices)
    ? visit.ai_result.price_insights.key_sku_prices.map((row) => ({
        brand: row.brand,
        product: row.product,
        price: row.price,
        piece_count: row.piece_count,
        tag: row.tag,
        confidence: row.confidence,
      }))
    : [];
  const aiResult = (storeSummary || keySkuPrices.length > 0)
    ? ({
        store_summary: storeSummary ?? "",
        price_insights: {
          brand_price_range: [],
          key_sku_prices: keySkuPrices,
        },
      } as unknown as StoreVisitAiResult)
    : null;
  return {
    id: visit.id,
    store_name: visit.store_name,
    region: formatVisitRegion(visit),
    channel: visit.channel ?? visit.channel_type ?? null,
    city: formatVisitRegion(visit),
    channel_type: visit.channel_type,
    visit_date: visit.visit_date,
    visit_status: visit.visit_status,
    analysis_status: visit.analysis_status ?? "pending",
    analysis_error: visit.analysis_error ?? null,
    ai_result: aiResult,
    image_urls: visit.image_urls ?? [],
    photo_count: photoCount(visit),
    created_at: visit.created_at,
    active_ai_job: activeAiJob ?? null,
  };
}

function filterDemoVisits(userId: string) {
  return demoOfflineStoreVisits
    .filter((visit) => visit.user_id === userId || visit.uploader_user_id === userId)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("user_id")?.trim() || "";
    const page = readPositiveInt(searchParams.get("page"), 1);
    const pageSize = Math.min(readPositiveInt(searchParams.get("page_size"), defaultPageSize), maxPageSize);
    const from = (page - 1) * pageSize;
    const fetchTo = from + pageSize;

    if (!userId) {
      return Response.json({ error: "user_id is required" }, { status: 400 });
    }

    if (!hasSupabaseServiceConfig()) {
      const visits = filterDemoVisits(userId);
      const paged = visits.slice(from, from + pageSize);
      const todayVisitDate = todayVisitDateValue();
      const { start, end } = todayRange();
      const todayRows = visits.filter((visit) => isVisitOnToday(visit, todayVisitDate, start, end));
      return Response.json({
        visits: paged.map((visit) => serializeVisit(visit)),
        pagination: {
          page,
          page_size: pageSize,
          total: visits.length,
          has_next: from + pageSize < visits.length,
        },
        today_count: new Set(todayRows.map(storeDedupKey)).size,
        demo: true,
      });
    }

    const supabase = createSupabaseServiceClient();
    let visitsResult = await supabase
      .from("offline_store_visits")
      .select("id,store_id,store_name,region,channel,city,province,city_name,district,channel_type,visit_date,visit_status,analysis_status,analysis_error,ai_result,created_at,image_urls,offline_visit_images(id)", { count: "exact" })
      .or(`user_id.eq.${userId},uploader_user_id.eq.${userId}`)
      .order("created_at", { ascending: false })
      .range(from, fetchTo);

    if (visitsResult.error?.message.includes("user_id")) {
      visitsResult = await supabase
        .from("offline_store_visits")
        .select("id,store_id,store_name,region,channel,city,province,city_name,district,channel_type,visit_date,visit_status,analysis_status,analysis_error,ai_result,created_at,image_urls,offline_visit_images(id)", { count: "exact" })
        .eq("uploader_user_id", userId)
        .order("created_at", { ascending: false })
        .range(from, fetchTo);
    }

    if (visitsResult.error) {
      return Response.json({ error: visitsResult.error.message }, { status: 400 });
    }

    const todayVisitDate = todayVisitDateValue();
    const { start, end } = todayRange();
    const visitDateRowsResult = await loadTodayRowsWithVisitDate({
      supabase,
      userId,
      todayVisitDate,
    });
    const legacyRowsResult = await loadLegacyTodayRowsWithoutVisitDate({
      supabase,
      userId,
      start,
      end,
    });
    const todayRows = [...visitDateRowsResult.rows, ...legacyRowsResult.rows];

    const rows = (visitsResult.data ?? []) as OfflineStoreVisit[];
    const hasNext = rows.length > pageSize;
    const pagedRows = hasNext ? rows.slice(0, pageSize) : rows;
    const activeJobsByVisitId = await loadActiveAiJobsForVisits({
      supabase,
      visitIds: pagedRows.map((visit) => visit.id),
    });

    return Response.json({
      visits: pagedRows.map((visit) => serializeVisit(visit, activeJobsByVisitId.get(visit.id) ?? null)),
      pagination: {
        page,
        page_size: pageSize,
        total: visitsResult.count ?? from + pagedRows.length,
        has_next: hasNext,
      },
      today_count: new Set(todayRows.map(storeDedupKey)).size,
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}

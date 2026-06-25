import { demoOfflineStoreVisits } from "@/lib/demo-data";
import { createSupabaseServiceClient, hasSupabaseServiceConfig } from "@/lib/supabase";
import type { OfflineStoreVisit } from "@/lib/types";

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

function photoCount(visit: OfflineStoreVisit) {
  const legacyCount = Array.isArray(visit.image_urls) ? visit.image_urls.length : 0;
  const rowCount = visit.offline_visit_images?.length ?? 0;
  return Math.max(legacyCount, rowCount);
}

function formatVisitRegion(visit: OfflineStoreVisit) {
  const structured = [visit.province, visit.city_name, visit.district].map((value) => value?.trim()).filter(Boolean).join(" / ");
  return visit.region ?? structured ?? visit.city ?? null;
}

function serializeVisit(visit: OfflineStoreVisit) {
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
    ai_result: visit.ai_result ?? null,
    image_urls: visit.image_urls ?? [],
    photo_count: photoCount(visit),
    created_at: visit.created_at,
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
    const to = from + pageSize - 1;

    if (!userId) {
      return Response.json({ error: "user_id is required" }, { status: 400 });
    }

    if (!hasSupabaseServiceConfig()) {
      const visits = filterDemoVisits(userId);
      const paged = visits.slice(from, from + pageSize);
      const { start, end } = todayRange();
      const todayCount = visits.filter((visit) => visit.created_at >= start && visit.created_at < end).length;
      return Response.json({
        visits: paged.map(serializeVisit),
        pagination: {
          page,
          page_size: pageSize,
          total: visits.length,
          has_next: from + pageSize < visits.length,
        },
        today_count: todayCount,
        demo: true,
      });
    }

    const supabase = createSupabaseServiceClient();
    let visitsResult = await supabase
      .from("offline_store_visits")
      .select("*, offline_visit_images(id)", { count: "exact" })
      .or(`user_id.eq.${userId},uploader_user_id.eq.${userId}`)
      .order("created_at", { ascending: false })
      .range(from, to);

    if (visitsResult.error?.message.includes("user_id")) {
      visitsResult = await supabase
        .from("offline_store_visits")
        .select("*, offline_visit_images(id)", { count: "exact" })
        .eq("uploader_user_id", userId)
        .order("created_at", { ascending: false })
        .range(from, to);
    }

    if (visitsResult.error) {
      return Response.json({ error: visitsResult.error.message }, { status: 400 });
    }

    const { start, end } = todayRange();
    let countResult = await supabase
      .from("offline_store_visits")
      .select("id", { count: "exact", head: true })
      .or(`user_id.eq.${userId},uploader_user_id.eq.${userId}`)
      .gte("created_at", start)
      .lt("created_at", end);

    if (countResult.error?.message.includes("user_id")) {
      countResult = await supabase
        .from("offline_store_visits")
        .select("id", { count: "exact", head: true })
        .eq("uploader_user_id", userId)
        .gte("created_at", start)
        .lt("created_at", end);
    }

    return Response.json({
      visits: ((visitsResult.data ?? []) as OfflineStoreVisit[]).map(serializeVisit),
      pagination: {
        page,
        page_size: pageSize,
        total: visitsResult.count ?? 0,
        has_next: from + pageSize < (visitsResult.count ?? 0),
      },
      today_count: countResult.count ?? 0,
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}

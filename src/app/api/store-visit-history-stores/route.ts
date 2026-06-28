import { demoOfflineStoreVisits, demoOfflineStores } from "@/lib/demo-data";
import { createSupabaseServiceClient, hasSupabaseServiceConfig } from "@/lib/supabase";
import type { OfflineStore } from "@/lib/types";

type HistoryStoreItem = {
  store_id: string;
  name: string;
  city: string;
  province?: string | null;
  city_name?: string | null;
  district?: string | null;
  channel_type: string;
  channel_id?: string | null;
  address?: string | null;
  last_visit_at: string;
  visit_count: number;
  channels?: { id: string; code: string; name: string; type: string } | null;
};

type QueryError = { message?: string } | null;

type VisitAggregate = {
  last_visit_at: string;
  visit_count: number;
};

type HistoryVisitRow = {
  store_id?: string | null;
  created_at?: string | null;
  visit_date?: string | null;
};

type StoreRow = Record<string, unknown>;

const maxRecentVisitRows = 800;

const fullStoreSelect = "id,name,city,province,city_name,district,channel_type,channel_id,address,latitude,longitude,location_accuracy_m,location_captured_at,status,disabled_at,deleted_at,created_by,created_by_user_id,created_by_name,created_at,channels(id,code,name,type)";
const noChannelStoreSelect = "id,name,city,province,city_name,district,channel_type,channel_id,address,latitude,longitude,location_accuracy_m,location_captured_at,status,disabled_at,deleted_at,created_by,created_by_user_id,created_by_name,created_at";
const noStatusStoreSelect = "id,name,city,province,city_name,district,channel_type,channel_id,address,latitude,longitude,location_accuracy_m,location_captured_at,created_at,channels(id,code,name,type)";
const legacyRegionStoreSelect = "id,name,city,channel_type,channel_id,address,latitude,longitude,location_accuracy_m,location_captured_at,status,disabled_at,deleted_at,created_by,created_by_user_id,created_by_name,created_at";

function cleanText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function cleanLimit(value: string | null) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 20;
  return Math.max(1, Math.min(50, Math.floor(parsed)));
}

function formatStoreRegion(store: {
  city?: string | null;
  province?: string | null;
  city_name?: string | null;
  district?: string | null;
}) {
  const parts = [store.province, store.city_name, store.district].map(cleanText).filter(Boolean);
  if (parts.length > 0) return parts.join(" / ");
  return cleanText(store.city);
}

function matchesKeyword(store: Pick<HistoryStoreItem, "name" | "city" | "province" | "city_name" | "district">, keyword: string) {
  if (!keyword) return true;
  const lower = keyword.toLowerCase();
  return [store.name, store.city, store.province, store.city_name, store.district]
    .some((value) => cleanText(value).toLowerCase().includes(lower));
}

function isDisabledStore(store: Pick<OfflineStore, "status" | "disabled_at" | "deleted_at">) {
  return store.status === "disabled" || Boolean(store.disabled_at || store.deleted_at);
}

function isStoreStatusColumnError(error: QueryError) {
  const message = error?.message ?? "";
  return message.includes("status") || message.includes("disabled_at") || message.includes("schema cache");
}

function isStoreRegionColumnError(error: QueryError) {
  const message = error?.message ?? "";
  return message.includes("province") || message.includes("city_name") || message.includes("district") || message.includes("schema cache");
}

function isChannelRelationError(error: QueryError) {
  const message = error?.message ?? "";
  return message.includes("channels") || message.includes("schema cache");
}

function normalizeVisitTime(visit: { created_at?: string | null; visit_date?: string | null }) {
  return cleanText(visit.created_at) || cleanText(visit.visit_date) || "1970-01-01T00:00:00.000Z";
}

function normalizeChannel(value: unknown) {
  if (Array.isArray(value)) {
    const first = value[0];
    if (!first || typeof first !== "object") return null;
    const channel = first as Record<string, unknown>;
    const id = cleanText(channel.id);
    const code = cleanText(channel.code);
    const name = cleanText(channel.name);
    const type = cleanText(channel.type);
    if (!id || !code || !name || !type) return null;
    return { id, code, name, type };
  }

  if (!value || typeof value !== "object") return null;
  const channel = value as Record<string, unknown>;
  const id = cleanText(channel.id);
  const code = cleanText(channel.code);
  const name = cleanText(channel.name);
  const type = cleanText(channel.type);
  if (!id || !code || !name || !type) return null;
  return { id, code, name, type };
}

function normalizeHistoryStore(store: StoreRow, aggregates: Map<string, VisitAggregate>): HistoryStoreItem | null {
  const storeId = cleanText(store.id);
  const name = cleanText(store.name);
  const province = cleanText(store.province) || null;
  const cityName = cleanText(store.city_name) || null;
  const district = cleanText(store.district) || null;
  const city = formatStoreRegion({
    city: cleanText(store.city) || null,
    province,
    city_name: cityName,
    district,
  });
  const channelType = cleanText(store.channel_type);
  if (!storeId || !name || !city || !channelType) return null;

  const status: OfflineStore["status"] = cleanText(store.status) === "disabled" ? "disabled" : "enabled";
  const disabledAt = cleanText(store.disabled_at) || null;
  const deletedAt = cleanText(store.deleted_at) || null;
  if (isDisabledStore({ status, disabled_at: disabledAt, deleted_at: deletedAt })) return null;

  const aggregate = aggregates.get(storeId);
  return {
    store_id: storeId,
    name,
    city,
    province,
    city_name: cityName,
    district,
    channel_type: channelType,
    channel_id: cleanText(store.channel_id) || null,
    address: cleanText(store.address) || null,
    last_visit_at: aggregate?.last_visit_at ?? "1970-01-01T00:00:00.000Z",
    visit_count: aggregate?.visit_count ?? 0,
    channels: normalizeChannel(store.channels),
  };
}

function buildDemoHistoryStores(userId: string, q: string, limit: number) {
  const visitMap = new Map<string, VisitAggregate>();
  for (const visit of demoOfflineStoreVisits) {
    if ((visit.user_id ?? visit.uploader_user_id) !== userId) continue;
    const storeId = cleanText(visit.store_id);
    if (!storeId) continue;
    const time = normalizeVisitTime(visit);
    const current = visitMap.get(storeId);
    if (!current) {
      visitMap.set(storeId, { last_visit_at: time, visit_count: 1 });
      continue;
    }
    visitMap.set(storeId, {
      last_visit_at: current.last_visit_at > time ? current.last_visit_at : time,
      visit_count: current.visit_count + 1,
    });
  }

  return demoOfflineStores
    .filter((store) => !isDisabledStore(store))
    .filter((store) => visitMap.has(store.id))
    .map((store) => ({
      store_id: store.id,
      name: store.name,
      city: formatStoreRegion(store),
      province: store.province ?? null,
      city_name: store.city_name ?? null,
      district: store.district ?? null,
      channel_type: store.channel_type,
      channel_id: store.channel_id ?? null,
      address: store.address ?? null,
      last_visit_at: visitMap.get(store.id)?.last_visit_at ?? "1970-01-01T00:00:00.000Z",
      visit_count: visitMap.get(store.id)?.visit_count ?? 0,
      channels: store.channels ?? null,
    }))
    .filter((store) => matchesKeyword(store, q))
    .sort((a, b) => b.last_visit_at.localeCompare(a.last_visit_at))
    .slice(0, limit);
}

async function readVisitRows(userId: string): Promise<{ rows: HistoryVisitRow[]; error: QueryError }> {
  const supabase = createSupabaseServiceClient();

  let data: unknown[] | null = null;
  let error: QueryError = null;

  const primary = await supabase
    .from("offline_store_visits")
    .select("store_id,created_at,visit_date,user_id,uploader_user_id")
    .eq("user_id", userId)
    .not("store_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(maxRecentVisitRows);

  data = primary.data;
  error = primary.error;

  if (error?.message?.includes("user_id")) {
    const legacy = await supabase
      .from("offline_store_visits")
      .select("store_id,created_at,visit_date,uploader_user_id")
      .eq("uploader_user_id", userId)
      .not("store_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(maxRecentVisitRows);
    data = legacy.data;
    error = legacy.error;
  }

  if (error) {
    return { rows: [], error };
  }

  const rows = (data ?? []).map((row) => {
    const item = row as Record<string, unknown>;
    return {
      store_id: cleanText(item.store_id) || null,
      created_at: cleanText(item.created_at) || null,
      visit_date: cleanText(item.visit_date) || null,
    };
  });

  return { rows, error: null };
}

async function readStoreDetailsByIds(storeIds: string[]): Promise<{ rows: StoreRow[]; error: QueryError }> {
  const supabase = createSupabaseServiceClient();
  let data: unknown[] | null = null;
  let error: QueryError = null;

  const full = await supabase
    .from("offline_stores")
    .select(fullStoreSelect)
    .in("id", storeIds);
  data = full.data;
  error = full.error;

  if (isChannelRelationError(error)) {
    const noChannels = await supabase
      .from("offline_stores")
      .select(noChannelStoreSelect)
      .in("id", storeIds);
    data = noChannels.data;
    error = noChannels.error;
  }

  if (isStoreStatusColumnError(error)) {
    const noStatus = await supabase
      .from("offline_stores")
      .select(noStatusStoreSelect)
      .in("id", storeIds);
    data = noStatus.data;
    error = noStatus.error;
  }

  if (isStoreRegionColumnError(error)) {
    const legacyRegion = await supabase
      .from("offline_stores")
      .select(legacyRegionStoreSelect)
      .in("id", storeIds);
    data = legacyRegion.data;
    error = legacyRegion.error;
  }

  return { rows: ((data ?? []) as StoreRow[]), error };
}

function buildVisitAggregates(visits: HistoryVisitRow[]) {
  const aggregates = new Map<string, VisitAggregate>();

  for (const visit of visits) {
    const storeId = cleanText(visit.store_id);
    if (!storeId) continue;
    const time = normalizeVisitTime(visit);
    const current = aggregates.get(storeId);
    if (!current) {
      aggregates.set(storeId, { last_visit_at: time, visit_count: 1 });
      continue;
    }
    aggregates.set(storeId, {
      last_visit_at: current.last_visit_at > time ? current.last_visit_at : time,
      visit_count: current.visit_count + 1,
    });
  }

  return aggregates;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = cleanText(searchParams.get("user_id"));
    const q = cleanText(searchParams.get("q")).toLowerCase();
    const limit = cleanLimit(searchParams.get("limit"));

    if (!userId) {
      return Response.json({ error: "user_id is required" }, { status: 400 });
    }

    if (!hasSupabaseServiceConfig()) {
      return Response.json({ stores: buildDemoHistoryStores(userId, q, limit), demo: true });
    }

    const visitsResult = await readVisitRows(userId);
    if (visitsResult.error) {
      return Response.json({ error: visitsResult.error.message }, { status: 400 });
    }

    const aggregates = buildVisitAggregates(visitsResult.rows);
    const storeIds = Array.from(aggregates.keys());
    if (storeIds.length === 0) {
      return Response.json({ stores: [], demo: false });
    }

    const storeDetails = await readStoreDetailsByIds(storeIds);
    if (storeDetails.error) {
      return Response.json({ error: storeDetails.error.message }, { status: 400 });
    }

    const stores = storeDetails.rows
      .map((store) => normalizeHistoryStore(store, aggregates))
      .filter((store): store is HistoryStoreItem => Boolean(store))
      .filter((store) => matchesKeyword(store, q))
      .sort((a, b) => b.last_visit_at.localeCompare(a.last_visit_at))
      .slice(0, limit);

    return Response.json({ stores, demo: false });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}

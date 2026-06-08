import {
  demoAiRecommendations,
  demoAlerts,
  demoBrands,
  demoChannels,
  demoCompetitors,
  demoMaterialMaster,
  demoOfflineStores,
  demoOfflineStoreVisits,
  demoOfflineUploads,
  demoPriceSnapshots,
  demoPromoEvents,
  demoSkuMaster,
} from "@/lib/demo-data";
import { createSupabaseAnonClient, createSupabaseServiceClient, hasSupabaseConfig, hasSupabaseServiceConfig } from "@/lib/supabase";
import type {
  Alert,
  AiPriceCandidate,
  AppUser,
  Brand,
  ChannelMaster,
  CompetitorProduct,
  DashboardCategoryChannelMatrix,
  DashboardCollectionEfficiency,
  DashboardInsight,
  MaterialMaster,
  OfflineStore,
  OfflineUpload,
  OfflineStoreVisit,
  OpportunityAction,
  OpportunityActionStatus,
  OpportunityActionType,
  PriceSnapshot,
  ProductSegmentBattle,
  ProductSegmentBattleSummary,
  PromoEvent,
  PromoEventFeedItem,
  Severity,
  SkuMaster,
  VisionDetectedProduct,
} from "@/lib/types";

type QueryResult<T> = { data: T; error: string | null; isDemo: boolean };

export type OfflineStoreVisitFilters = {
  q?: string;
  city?: string;
  status?: string;
  uploaderName?: string;
  uploaderUserId?: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
};

export type AiPriceCandidateFilters = {
  dateFrom?: string;
  dateTo?: string;
  status?: "pending" | "approved" | "rejected";
  limit?: number;
};

async function fromSupabase<T>(query: PromiseLike<{ data: unknown; error: { message: string } | null }>, fallback: T): Promise<QueryResult<T>> {
  if (!hasSupabaseConfig()) return { data: fallback, error: null, isDemo: true };
  const { data, error } = await query;
  if (error) return { data: fallback, error: error.message, isDemo: true };
  return { data: (data ?? fallback) as T, error: null, isDemo: false };
}

function isMissingSchemaError(error: { message?: string } | null) {
  const message = error?.message ?? "";
  return message.includes("Could not find the table") || message.includes("schema cache");
}

export async function getBrands(): Promise<QueryResult<Brand[]>> {
  if (!hasSupabaseConfig()) return { data: demoBrands, error: null, isDemo: true };
  const supabase = createSupabaseServiceClient();
  return fromSupabase<Brand[]>(supabase.from("brands").select("*").order("name"), demoBrands);
}

export async function getSkuMaster(): Promise<QueryResult<SkuMaster[]>> {
  if (!hasSupabaseConfig()) return { data: demoSkuMaster, error: null, isDemo: true };
  const supabase = createSupabaseAnonClient();
  return fromSupabase<SkuMaster[]>(supabase.from("sku_master").select("*").order("size"), demoSkuMaster);
}

export async function getMaterialMaster(): Promise<QueryResult<MaterialMaster[]>> {
  if (!hasSupabaseServiceConfig()) {
    return {
      data: demoMaterialMaster,
      error: "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
      isDemo: true,
    };
  }

  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("material_master")
    .select("*")
    .order("tenant_sku_code");

  if (error) return { data: [], error: error.message, isDemo: false };
  return { data: (data ?? []) as MaterialMaster[], error: null, isDemo: false };
}

export async function getChannels(): Promise<QueryResult<ChannelMaster[]>> {
  if (!hasSupabaseServiceConfig()) return { data: demoChannels, error: null, isDemo: true };

  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("channels")
    .select("*")
    .order("sort_order")
    .order("name");

  if (isMissingSchemaError(error)) return { data: demoChannels, error: null, isDemo: false };
  if (error) return { data: demoChannels, error: error.message, isDemo: true };
  return { data: (data ?? []) as ChannelMaster[], error: null, isDemo: false };
}

export async function getAppUsers(): Promise<QueryResult<AppUser[]>> {
  if (!hasSupabaseServiceConfig()) {
    return {
      data: [],
      error: "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
      isDemo: true,
    };
  }

  const supabase = createSupabaseServiceClient();
  let { data, error } = await supabase
    .from("app_users")
    .select("id,username,display_name,role,status,disabled_at,updated_at,created_at")
    .order("created_at", { ascending: false });

  if (error?.message.includes("status") || error?.message.includes("disabled_at") || error?.message.includes("updated_at")) {
    const legacy = await supabase
      .from("app_users")
      .select("id,username,display_name,role,created_at")
      .order("created_at", { ascending: false });
    data = (legacy.data ?? []).map((user) => ({
      ...user,
      status: "enabled",
      disabled_at: null,
      updated_at: null,
    }));
    error = legacy.error;
  }

  if (isMissingSchemaError(error)) return { data: [], error: "Run migration 202606080004_app_user_management.sql", isDemo: false };
  if (error) return { data: [], error: error.message, isDemo: false };
  return { data: (data ?? []) as AppUser[], error: null, isDemo: false };
}

type OfflineStoreStatusFilter = "enabled" | "disabled" | "all";

export async function getOfflineStores({ status = "enabled" }: { status?: OfflineStoreStatusFilter } = {}): Promise<QueryResult<OfflineStore[]>> {
  if (!hasSupabaseServiceConfig()) {
    return {
      data: filterOfflineStoresByStatus(demoOfflineStores, status),
      error: null,
      isDemo: true,
    };
  }

  const supabase = createSupabaseServiceClient();
  let { data, error } = await supabase
    .from("offline_stores")
    .select("*, channels(id,code,name,type)")
    .order("name");

  if (error?.message.includes("channels") || error?.message.includes("schema cache")) {
    const legacy = await supabase
      .from("offline_stores")
      .select("*")
      .order("name");
    data = legacy.data;
    error = legacy.error;
  }

  const storeError = error;
  const masterStores = storeError && !isMissingSchemaError(storeError) ? [] : ((data ?? []) as OfflineStore[]);
  const disabledStoreIds = new Set(masterStores.filter(isDisabledOfflineStore).map((store) => store.id));
  const disabledStoreKeys = new Set(masterStores.filter(isDisabledOfflineStore).map(storeKey).filter(Boolean) as string[]);
  const activeMasterStores = filterDisabledOfflineStores(masterStores, disabledStoreIds, disabledStoreKeys);

  const visitsResult = await readVisitStoresForStoreList(supabase);
  const uploadsResult = await readUploadStoresForStoreList(supabase);
  const stores = mergeOfflineStores(status === "disabled"
    ? masterStores.filter(isDisabledOfflineStore)
    : [
        ...(status === "all" ? masterStores : activeMasterStores),
        ...filterDisabledOfflineStores(visitsResult.stores, disabledStoreIds, disabledStoreKeys),
        ...filterDisabledOfflineStores(uploadsResult.stores, disabledStoreIds, disabledStoreKeys),
      ]);

  if (stores.length > 0) {
    return {
      data: stores,
      error: visitsResult.error ?? uploadsResult.error ?? null,
      isDemo: false,
    };
  }

  if (storeError) return { data: demoOfflineStores, error: storeError.message, isDemo: true };
  return { data: stores, error: visitsResult.error ?? uploadsResult.error ?? null, isDemo: false };
}

type StoreListReadResult = {
  stores: OfflineStore[];
  error: string | null;
};

type StoreListVisitRow = Pick<OfflineStoreVisit, "id" | "store_name" | "city" | "channel_type" | "created_at" | "visit_date"> & {
  channel_id?: string | null;
  store_id?: string | null;
};

type StoreListUploadRow = Pick<OfflineUpload, "id" | "store_name" | "city" | "channel_type" | "created_at">;

async function readVisitStoresForStoreList(supabase: ReturnType<typeof createSupabaseServiceClient>): Promise<StoreListReadResult> {
  const initial = await supabase
    .from("offline_store_visits")
    .select("id,store_name,city,channel_type,channel_id,store_id,created_at,visit_date")
    .order("created_at", { ascending: false })
    .limit(1000);
  let data = initial.data as unknown[] | null;
  let error = initial.error;

  if (error?.message.includes("channel_id") || error?.message.includes("store_id")) {
    const legacy = await supabase
      .from("offline_store_visits")
      .select("id,store_name,city,channel_type,created_at,visit_date")
      .order("created_at", { ascending: false })
      .limit(1000);
    data = legacy.data;
    error = legacy.error;
  }

  if (isMissingSchemaError(error)) return { stores: [], error: null };
  if (error) return { stores: [], error: error.message };

  const stores = ((data ?? []) as StoreListVisitRow[])
    .filter((visit) => cleanText(visit.store_name) && cleanText(visit.city))
    .map((visit) => storeFromRegistration({
      id: visit.store_id || `visit-store-${visit.id}`,
      name: visit.store_name,
      city: visit.city,
      channelType: visit.channel_type,
      channelId: visit.channel_id ?? null,
      createdAt: visit.created_at ?? visit.visit_date,
    }));

  return { stores, error: null };
}

async function readUploadStoresForStoreList(supabase: ReturnType<typeof createSupabaseServiceClient>): Promise<StoreListReadResult> {
  const { data, error } = await supabase
    .from("offline_uploads")
    .select("id,store_name,city,channel_type,created_at")
    .order("created_at", { ascending: false })
    .limit(1000);

  if (isMissingSchemaError(error)) return { stores: [], error: null };
  if (error) return { stores: [], error: error.message };

  const stores = ((data ?? []) as StoreListUploadRow[])
    .filter((upload) => cleanText(upload.store_name) && cleanText(upload.city))
    .map((upload) => storeFromRegistration({
      id: `upload-store-${upload.id}`,
      name: upload.store_name,
      city: upload.city,
      channelType: upload.channel_type,
      channelId: null,
      createdAt: upload.created_at,
    }));

  return { stores, error: null };
}

function storeFromRegistration(input: {
  id: string;
  name: string;
  city: string;
  channelType: string | null | undefined;
  channelId: string | null;
  createdAt: string | null | undefined;
}): OfflineStore {
  const channelType = cleanText(input.channelType) ?? "other";
  const channel = demoChannels.find((item) => item.id === input.channelId || item.code === channelType) ?? null;
  return {
    id: input.id,
    name: input.name,
    city: input.city,
    channel_type: channelType,
    channel_id: input.channelId ?? channel?.id ?? null,
    address: null,
    status: "enabled",
    disabled_at: null,
    deleted_at: null,
    created_at: input.createdAt ?? "1970-01-01T00:00:00.000Z",
    channels: channel,
  };
}

function storeKey(store: Pick<OfflineStore, "name" | "city">) {
  const name = cleanText(store.name);
  const city = cleanText(store.city);
  if (!name || !city) return null;
  return `${city.toLowerCase()}::${name.toLowerCase()}`;
}

function isDisabledOfflineStore(store: OfflineStore) {
  return store.status === "disabled" || Boolean(store.disabled_at || store.deleted_at);
}

function filterOfflineStoresByStatus(stores: OfflineStore[], status: OfflineStoreStatusFilter) {
  if (status === "all") return stores;
  return stores.filter((store) => status === "disabled" ? isDisabledOfflineStore(store) : !isDisabledOfflineStore(store));
}

function filterDisabledOfflineStores(stores: OfflineStore[], disabledStoreIds: Set<string>, disabledStoreKeys: Set<string>) {
  return stores.filter((store) => {
    if (isDisabledOfflineStore(store)) return false;
    if (disabledStoreIds.has(store.id)) return false;
    const key = storeKey(store);
    return !key || !disabledStoreKeys.has(key);
  });
}

function mergeOfflineStores(stores: OfflineStore[]) {
  const merged = new Map<string, OfflineStore>();

  for (const store of stores) {
    const name = cleanText(store.name);
    const city = cleanText(store.city);
    if (!name || !city) continue;

    const key = storeKey({ name, city });
    if (!key) continue;
    const channelType = cleanText(store.channel_type) ?? "other";
    const channel = store.channels ?? demoChannels.find((item) => item.id === store.channel_id || item.code === channelType) ?? null;
    const normalizedStore: OfflineStore = {
      ...store,
      name,
      city,
      channel_type: channelType,
      channel_id: store.channel_id ?? channel?.id ?? null,
      address: store.address ?? null,
      status: store.status ?? (isDisabledOfflineStore(store) ? "disabled" : "enabled"),
      disabled_at: store.disabled_at ?? null,
      deleted_at: store.deleted_at ?? null,
      channels: channel,
    };

    const current = merged.get(key);
    if (!current) {
      merged.set(key, normalizedStore);
      continue;
    }

    merged.set(key, {
      ...current,
      channel_type: current.channel_type || normalizedStore.channel_type,
      channel_id: current.channel_id ?? normalizedStore.channel_id,
      address: current.address ?? normalizedStore.address,
      status: current.status ?? normalizedStore.status,
      disabled_at: current.disabled_at ?? normalizedStore.disabled_at,
      deleted_at: current.deleted_at ?? normalizedStore.deleted_at,
      channels: current.channels ?? normalizedStore.channels,
      created_at: current.created_at <= normalizedStore.created_at ? current.created_at : normalizedStore.created_at,
    });
  }

  return Array.from(merged.values()).sort((a, b) => {
    const cityCompare = a.city.localeCompare(b.city);
    return cityCompare || a.name.localeCompare(b.name);
  });
}

export async function getAiPriceCandidates(filters: AiPriceCandidateFilters = {}): Promise<QueryResult<AiPriceCandidate[]>> {
  if (!hasSupabaseServiceConfig()) {
    return {
      data: [],
      error: "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
      isDemo: true,
    };
  }

  const supabase = createSupabaseServiceClient();
  const shouldFilterVisitDate = Boolean(filters.dateFrom || filters.dateTo);
  const visitSelect = shouldFilterVisitDate
    ? "offline_store_visits!inner(id,store_name,city,channel_type,visit_date,created_at)"
    : "offline_store_visits(id,store_name,city,channel_type,visit_date,created_at)";
  let query = supabase
    .from("ai_price_candidates")
    .select(`*, ${visitSelect}`)
    .limit(filters.limit ?? 200);

  if (filters.dateFrom) query = query.gte("offline_store_visits.visit_date", filters.dateFrom);
  if (filters.dateTo) query = query.lte("offline_store_visits.visit_date", filters.dateTo);
  if (filters.status) query = query.eq("status", filters.status);

  if (filters.status === "approved") {
    query = query.order("reviewed_at", { ascending: false }).order("created_at", { ascending: false });
  } else {
    query = query.order("created_at", { ascending: false });
  }

  const { data, error } = await query;

  if (error?.message.includes("ai_price_candidates")) {
    return { data: [], error: "Run migration 202605280005_ai_price_candidates.sql", isDemo: false };
  }
  if (error) return { data: [], error: error.message, isDemo: false };
  const rows = (data ?? []) as AiPriceCandidate[];
  if (!filters.status) {
    const statusRank: Record<string, number> = { pending: 0, approved: 1, rejected: 2 };
    rows.sort((a, b) => {
      const rankCompare = (statusRank[a.status] ?? 3) - (statusRank[b.status] ?? 3);
      if (rankCompare !== 0) return rankCompare;
      const aTime = a.status === "approved" ? a.reviewed_at ?? a.created_at : a.created_at;
      const bTime = b.status === "approved" ? b.reviewed_at ?? b.created_at : b.created_at;
      return new Date(bTime).getTime() - new Date(aTime).getTime();
    });
  }
  return { data: rows, error: null, isDemo: false };
}

export async function getCompetitorProducts(): Promise<QueryResult<CompetitorProduct[]>> {
  if (!hasSupabaseConfig()) return { data: demoCompetitors, error: null, isDemo: true };
  const supabase = createSupabaseServiceClient();
  return fromSupabase<CompetitorProduct[]>(
    supabase
      .from("competitor_products")
      .select("*, brands(id,name), sku_matches(*, sku_master(*))")
      .order("created_at", { ascending: false }),
    demoCompetitors,
  );
}

export async function getPriceSnapshots(): Promise<QueryResult<PriceSnapshot[]>> {
  if (!hasSupabaseConfig()) return { data: demoPriceSnapshots, error: null, isDemo: true };
  const supabase = createSupabaseServiceClient();
  return fromSupabase<PriceSnapshot[]>(
    supabase
      .from("price_snapshots")
      .select("*, competitor_products(*, brands(id,name), sku_matches(*, sku_master(*)))")
      .order("captured_at", { ascending: false })
      .limit(100),
    demoPriceSnapshots,
  );
}

export async function getPromoEvents(): Promise<QueryResult<PromoEvent[]>> {
  if (!hasSupabaseConfig()) return { data: demoPromoEvents, error: null, isDemo: true };
  const supabase = createSupabaseAnonClient();
  return fromSupabase<PromoEvent[]>(
    supabase
      .from("promo_events")
      .select("*, competitor_products(*, brands(id,name)), sku_master(*), ai_strategy_recommendations(*)")
      .order("started_at", { ascending: false }),
    demoPromoEvents,
  );
}

export async function getPromoEvent(id: string): Promise<QueryResult<PromoEvent | null>> {
  if (!hasSupabaseConfig()) {
    return {
      data: demoPromoEvents.find((event) => event.id === id) ?? demoPromoEvents[0] ?? null,
      error: null,
      isDemo: true,
    };
  }
  const supabase = createSupabaseAnonClient();
  const { data, error } = await supabase
    .from("promo_events")
    .select("*, competitor_products(*, brands(id,name)), sku_master(*), ai_strategy_recommendations(*)")
    .eq("id", id)
    .single();
  if (error) {
    return {
      data: demoPromoEvents.find((event) => event.id === id) ?? null,
      error: error.message,
      isDemo: true,
    };
  }
  return { data: data as PromoEvent, error: null, isDemo: false };
}

export async function getPromoEventFeed(): Promise<QueryResult<PromoEventFeedItem[]>> {
  if (!hasSupabaseServiceConfig()) {
    return { data: buildPromoEventFeed(demoPromoEvents, demoOfflineStoreVisits, demoOfflineUploads, demoMaterialMaster), error: null, isDemo: true };
  }

  const supabase = createSupabaseServiceClient();
  const [eventsResult, visitsResult, uploadsResult, materialResult] = await Promise.all([
    supabase
      .from("promo_events")
      .select("*, competitor_products(*, brands(id,name)), sku_master(*), ai_strategy_recommendations(*)")
      .order("started_at", { ascending: false })
      .limit(300),
    supabase
      .from("offline_store_visits")
      .select("*, offline_visit_images(*)")
      .order("created_at", { ascending: false })
      .limit(300),
    supabase
      .from("offline_uploads")
      .select("*, offline_ocr_results(*)")
      .order("created_at", { ascending: false })
      .limit(300),
    supabase
      .from("material_master")
      .select("*")
      .limit(5000),
  ]);

  const error = eventsResult.error ?? visitsResult.error ?? uploadsResult.error ?? materialResult.error;
  if (error) {
    return {
      data: buildPromoEventFeed(demoPromoEvents, demoOfflineStoreVisits, demoOfflineUploads, demoMaterialMaster),
      error: error.message,
      isDemo: true,
    };
  }

  const visits = await attachVisitImageUrls((visitsResult.data ?? []) as OfflineStoreVisit[]);
  return {
    data: buildPromoEventFeed(
      (eventsResult.data ?? []) as PromoEvent[],
      visits,
      (uploadsResult.data ?? []) as OfflineUpload[],
      (materialResult.data ?? []) as MaterialMaster[],
    ),
    error: null,
    isDemo: false,
  };
}

export async function getDashboardCategoryChannelMatrix(locale = "zh"): Promise<QueryResult<DashboardCategoryChannelMatrix>> {
  const [feedResult, channelsResult, storesResult, materialResult, visitsResult, candidatesResult] = await Promise.all([
    getPromoEventFeed(),
    getChannels(),
    getOfflineStores(),
    getMaterialMaster(),
    getOfflineStoreVisits({ limit: 1000 }),
    getAiPriceCandidates({ limit: 5000 }),
  ]);
  const activeChannels = channelsResult.data.filter((channel) => channel.active && channel.type === "offline");
  const activeChannelCodes = new Set(activeChannels.map((channel) => channel.code));
  const dashboardFeed = feedResult.data.filter((item) => activeChannelCodes.has(normalizeChannelCode(item.channelCode)));
  const since = new Date();
  since.setHours(since.getHours() - 24);
  const baseCategories = Array.from(
    new Set(materialResult.data.map((item) => cleanText(item.sub_brand)).filter(Boolean) as string[]),
  ).sort((a, b) => a.localeCompare(b));
  const feedCategories = Array.from(new Set(dashboardFeed.map((item) => item.category || "Unassigned")));
  const categories = Array.from(new Set([...baseCategories, ...feedCategories])).sort((a, b) => {
    if (a === "Unassigned") return 1;
    if (b === "Unassigned") return -1;
    return a.localeCompare(b);
  });

  const rows = categories.map((category) => {
    const cells = activeChannels.map((channel) => {
      const events = dashboardFeed.filter((item) => item.category === category && normalizeChannelCode(item.channelCode) === channel.code);
      const metrics = buildMatrixCellMetrics(events, since);
      return {
        category,
        channelCode: channel.code,
        ...metrics,
        signalType: metrics.promoCount > 0 ? "risk" as const : "neutral" as const,
        href: `/${locale}/promo-events?category=${encodeURIComponent(category)}&channel=${encodeURIComponent(channel.code)}`,
      };
    });
    const totalPromoCount = cells.reduce((sum, cell) => sum + cell.promoCount, 0);

    return {
      category,
      totalPromoCount,
      cells: cells.map((cell) => ({
        ...cell,
        signalType: cell.promoCount > 0 ? "risk" as const : totalPromoCount > 0 ? "opportunity" as const : "neutral" as const,
      })),
    };
  });

  const cities = Array.from(new Set([
    ...storesResult.data.map((store) => cleanText(store.city)).filter(Boolean),
    ...visitsResult.data.map((visit) => cleanText(visit.city)).filter(Boolean),
    ...dashboardFeed.map((item) => cleanText(item.city)).filter(Boolean),
  ] as string[])).sort((a, b) => a.localeCompare(b));

  const cityRows = cities.map((city) => {
    const storeCount = storesResult.data.filter((store) => store.city === city).length;
    const cells = activeChannels.map((channel) => {
      const events = dashboardFeed.filter((item) => item.city === city && normalizeChannelCode(item.channelCode) === channel.code);
      const metrics = buildMatrixCellMetrics(events, since);
      return {
        city,
        channelCode: channel.code,
        ...metrics,
        signalType: metrics.promoCount > 0 ? "risk" as const : storeCount > 0 ? "opportunity" as const : "neutral" as const,
        href: `/${locale}/promo-events?city=${encodeURIComponent(city)}&channel=${encodeURIComponent(channel.code)}`,
      };
    });

    return {
      city,
      storeCount,
      totalPromoCount: cells.reduce((sum, cell) => sum + cell.promoCount, 0),
      cells,
    };
  });

  const recentPromoCount = dashboardFeed.filter((item) => new Date(item.date) >= since).length;
  const collection = buildCollectionEfficiency(visitsResult.data, candidatesResult.data);
  const battleMapCities = buildBattleMapCities({
    cityRows,
    feed: dashboardFeed,
    visits: visitsResult.data,
    locale,
    since,
  });
  const insights = buildDashboardInsights({
    rows,
    cityRows,
    battleMapCities,
    channels: activeChannels,
    recentPromoCount,
    locale,
  });

  return {
    data: {
      categories,
      channels: activeChannels,
      rows,
      cityRows,
      battleMapCities,
      collection,
      insights,
      totals: {
        categoryCount: categories.length,
        channelCount: activeChannels.length,
        cityCount: cities.length,
        storeCount: storesResult.data.length,
        recentPromoCount,
      },
    },
    error: feedResult.error ?? channelsResult.error ?? storesResult.error ?? materialResult.error ?? visitsResult.error ?? candidatesResult.error,
    isDemo: feedResult.isDemo || channelsResult.isDemo || storesResult.isDemo || materialResult.isDemo || visitsResult.isDemo || candidatesResult.isDemo,
  };
}

export async function getOpportunityActions(locale = "zh"): Promise<QueryResult<OpportunityAction[]>> {
  const [matrixResult, feedResult, candidatesResult] = await Promise.all([
    getDashboardCategoryChannelMatrix(locale),
    getPromoEventFeed(),
    getAiPriceCandidates({ limit: 5000 }),
  ]);

  const actions = buildOpportunityActions({
    locale,
    matrix: matrixResult.data,
    feed: feedResult.data,
    candidates: candidatesResult.data,
  });

  return {
    data: actions,
    error: matrixResult.error ?? feedResult.error ?? candidatesResult.error,
    isDemo: matrixResult.isDemo || feedResult.isDemo || candidatesResult.isDemo,
  };
}

export async function getProductSegmentBattles(locale = "zh"): Promise<QueryResult<{ summary: ProductSegmentBattleSummary; battles: ProductSegmentBattle[] }>> {
  const [skuResult, materialResult, competitorsResult, snapshotsResult, promosResult, candidatesResult] = await Promise.all([
    getSkuMaster(),
    getMaterialMaster(),
    getCompetitorProducts(),
    getPriceSnapshots(),
    getPromoEvents(),
    getAiPriceCandidates({ limit: 5000 }),
  ]);

  let battles = buildProductSegmentBattles({
    locale,
    skuMaster: skuResult.data,
    materialMaster: materialResult.data,
    competitors: competitorsResult.data,
    snapshots: snapshotsResult.data,
    promos: promosResult.data,
    candidates: candidatesResult.data,
  });
  if (battles.every((battle) => battle.evidenceCount === 0)) {
    battles = buildProductSegmentBattles({
      locale,
      skuMaster: skuResult.data,
      materialMaster: materialResult.data,
      competitors: demoCompetitors,
      snapshots: demoPriceSnapshots,
      promos: demoPromoEvents,
      candidates: [],
    });
  }

  return {
    data: {
      summary: {
        segmentCount: battles.length,
        pressuredSegmentCount: battles.filter((battle) => battle.lowestCompetitorPricePerPiece !== null).length,
        belowFloorSegmentCount: battles.filter((battle) => battle.floorGapPct !== null && battle.floorGapPct < 0).length,
        evidenceCount: battles.reduce((sum, battle) => sum + battle.evidenceCount, 0),
        competitorProductCount: battles.reduce((sum, battle) => sum + battle.competitorProductCount, 0),
      },
      battles,
    },
    error: skuResult.error ?? materialResult.error ?? competitorsResult.error ?? snapshotsResult.error ?? promosResult.error ?? candidatesResult.error,
    isDemo: skuResult.isDemo || materialResult.isDemo || competitorsResult.isDemo || snapshotsResult.isDemo || promosResult.isDemo || candidatesResult.isDemo,
  };
}

function buildCollectionEfficiency(
  visits: OfflineStoreVisit[],
  candidates: AiPriceCandidate[],
): DashboardCollectionEfficiency {
  const todayStart = startOfLocalDay(new Date());
  const weekStart = new Date(todayStart);
  weekStart.setDate(weekStart.getDate() - 6);
  const weekVisits = visits.filter((visit) => {
    const date = visit.visit_date ? new Date(`${visit.visit_date}T00:00:00`) : new Date(visit.created_at);
    return date >= weekStart;
  });
  const todayVisitCount = visits.filter((visit) => {
    const date = visit.visit_date ? new Date(`${visit.visit_date}T00:00:00`) : new Date(visit.created_at);
    return date >= todayStart;
  }).length;
  const weekStoreKeys = new Set(weekVisits.map((visit) => `${cleanText(visit.city) ?? ""}|${cleanText(visit.store_name) ?? ""}`));
  const approvedCandidates = candidates.filter((candidate) => candidate.status === "approved");
  const accuracies = approvedCandidates
    .map((candidate) => ({ candidate, accuracy: candidatePriceAccuracy(candidate) }))
    .filter((item): item is { candidate: AiPriceCandidate; accuracy: number } => item.accuracy !== null);

  return {
    todayVisitCount,
    weekVisitCount: weekVisits.length,
    weekStoreCount: weekStoreKeys.size,
    aiCandidateCount: candidates.length,
    pendingCandidateCount: candidates.filter((candidate) => candidate.status === "pending").length,
    approvedCandidateCount: approvedCandidates.length,
    approvedAccuracy: accuracies.length
      ? accuracies.reduce((sum, item) => sum + item.accuracy, 0) / accuracies.length
      : null,
    lowAccuracyItems: accuracies
      .sort((a, b) => a.accuracy - b.accuracy)
      .slice(0, 5)
      .map(({ candidate, accuracy }) => ({
        id: candidate.id,
        brand: candidate.raw_brand || "-",
        product: candidate.raw_product || "-",
        accuracy,
        aiPricePerPiece: candidate.price_per_piece as number,
        reviewedPricePerPiece: candidate.reviewed_price_per_piece as number,
        reviewedAt: candidate.reviewed_at,
      })),
  };
}

function startOfLocalDay(value: Date) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function candidatePriceAccuracy(candidate: AiPriceCandidate) {
  if (!candidate.price_per_piece || !candidate.reviewed_price_per_piece || candidate.reviewed_price_per_piece <= 0) return null;
  return Math.max(0, 1 - Math.abs(candidate.price_per_piece - candidate.reviewed_price_per_piece) / candidate.reviewed_price_per_piece);
}

function buildProductSegmentBattles(input: {
  locale: string;
  skuMaster: SkuMaster[];
  materialMaster: MaterialMaster[];
  competitors: CompetitorProduct[];
  snapshots: PriceSnapshot[];
  promos: PromoEvent[];
  candidates: AiPriceCandidate[];
}): ProductSegmentBattle[] {
  const groups = new Map<string, { line: string; size: string; skus: SkuMaster[]; materialItems: MaterialMaster[] }>();

  for (const sku of input.skuMaster.filter((item) => item.active)) {
    const line = productLineLabel(sku.pack_type);
    const size = cleanText(sku.size) ?? "Unknown";
    const key = productSegmentKey(line, size);
    const group = groups.get(key) ?? { line, size, skus: [], materialItems: [] };
    group.skus.push(sku);
    groups.set(key, group);
  }

  for (const item of input.materialMaster) {
    const line = cleanText(item.sub_category) ?? cleanText(item.type) ?? "Unknown";
    const size = cleanText(item.sub_type) ?? "Unknown";
    const key = productSegmentKey(line, size);
    const group = groups.get(key) ?? { line, size, skus: [], materialItems: [] };
    group.materialItems.push(item);
    groups.set(key, group);
  }

  const skuSegment = new Map<string, string>();
  for (const [key, group] of groups) {
    for (const sku of group.skus) skuSegment.set(sku.id, key);
  }
  const competitorSegment = new Map<string, string>();
  for (const product of input.competitors) {
    const segment = competitorProductSegment(product);
    competitorSegment.set(product.id, productSegmentKey(segment.line, segment.size));
  }
  const candidateSegment = new Map<string, string>();
  for (const candidate of input.candidates.filter((item) => !isMakukuBrandName(item.raw_brand))) {
    const line = inferProductLine(candidate.raw_product || candidate.matched_label || candidate.raw_brand);
    const size = inferProductSize(candidate.raw_product || candidate.matched_label);
    candidateSegment.set(candidate.id, productSegmentKey(line, size));
  }

  const battles = Array.from(groups.entries()).map(([key, group]) => {
    const skuIds = new Set(group.skus.map((sku) => sku.id));
    const competitors = input.competitors.filter((product) => {
      if (product.sku_matches?.some((match) => skuIds.has(match.sku_master_id))) return true;
      return competitorSegment.get(product.id) === key;
    });
    const snapshots = input.snapshots.filter((snapshot) => {
      const product = snapshot.competitor_products;
      if (!product) return false;
      if (product.sku_matches?.some((match) => skuIds.has(match.sku_master_id))) return true;
      return competitorSegment.get(product.id) === key;
    });
    const promos = input.promos.filter((promo) => {
      if (promo.sku_master_id && skuIds.has(promo.sku_master_id)) return true;
      const product = promo.competitor_products;
      if (!product) return false;
      if (product.sku_matches?.some((match) => skuSegment.get(match.sku_master_id) === key)) return true;
      return competitorSegment.get(product.id) === key;
    });
    const candidates = input.candidates.filter((candidate) => candidateSegment.get(candidate.id) === key);
    const competitorProductCount = competitors.length || new Set(
      candidates.map((candidate) => `${cleanText(candidate.raw_brand) ?? "-"}|${cleanText(candidate.raw_product) ?? "-"}`),
    ).size;
    const targetPrices = [
      ...group.skus.map((sku) => sku.target_price_per_piece),
      ...(group.skus.length === 0 ? group.materialItems.map((item) => item.pcs_price) : []),
    ].filter(isPositiveNumber);
    const floorPrices = group.skus.map((sku) => sku.floor_price_per_piece).filter(isPositiveNumber);
    const targetPriceMin = minOrNull(targetPrices);
    const targetPriceMax = maxOrNull(targetPrices);
    const floorPriceMin = minOrNull(floorPrices);
    const floorPriceMax = maxOrNull(floorPrices);
    const priceEvidence = [
      ...snapshots.map((snapshot) => ({
        price: snapshot.price_per_piece,
        brand: snapshot.competitor_products?.brands?.name ?? null,
        channel: snapshot.channel,
        capturedAt: snapshot.captured_at,
      })),
      ...promos.map((promo) => ({
        price: promo.new_price_per_piece,
        brand: promo.competitor_products?.brands?.name ?? null,
        channel: promo.channel,
        capturedAt: promo.started_at,
      })),
      ...candidates.map((candidate) => ({
        price: candidate.reviewed_price_per_piece ?? candidate.price_per_piece,
        brand: cleanText(candidate.raw_brand),
        channel: "offline" as const,
        capturedAt: candidate.reviewed_at ?? candidate.created_at,
      })),
    ].filter(isProductBattlePriceEvidence);
    const lowest = priceEvidence.reduce<typeof priceEvidence[number] | null>((current, item) => {
      if (!current || item.price < current.price) return item;
      return current;
    }, null);
    const latestCapturedAt = priceEvidence
      .map((item) => item.capturedAt)
      .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ?? null;
    const targetGapPct = lowest && targetPriceMin ? ((lowest.price - targetPriceMin) / targetPriceMin) * 100 : null;
    const floorGapPct = lowest && floorPriceMin ? ((lowest.price - floorPriceMin) / floorPriceMin) * 100 : null;
    const promoSeverity = maxSeverity(promos.map((promo) => promo.severity));
    const evidenceCount = snapshots.length + promos.length + candidates.length;
    const severity = productBattleSeverity({ targetGapPct, floorGapPct, promoSeverity, evidenceCount });
    const segmentLabels = Array.from(new Set(group.skus.map((sku) => sku.segment)));

    return {
      id: key,
      line: group.line,
      size: group.size,
      label: `${group.line} / ${group.size}`,
      segmentLabels,
      makukuSkuCount: group.skus.length || group.materialItems.length,
      makukuSkuNames: group.skus.length > 0 ? group.skus.map((sku) => sku.makuku_sku_name) : group.materialItems.map((item) => item.tenant_sku_name),
      targetPriceMin,
      targetPriceMax,
      floorPriceMin,
      floorPriceMax,
      competitorProductCount,
      evidenceCount,
      promoEventCount: promos.length,
      lowestCompetitorPricePerPiece: lowest?.price ?? null,
      strongestCompetitorBrand: lowest?.brand ?? null,
      strongestChannel: lowest?.channel ?? null,
      targetGapPct,
      floorGapPct,
      severity,
      latestCapturedAt,
      href: `/${input.locale}/prices?line=${encodeURIComponent(group.line)}&size=${encodeURIComponent(group.size)}`,
    } satisfies ProductSegmentBattle;
  });

  return battles
    .sort((a, b) => productBattleSortScore(b) - productBattleSortScore(a))
    .slice(0, 12);
}

function productLineLabel(value: SkuMaster["pack_type"]) {
  if (value === "pants") return "Pants";
  if (value === "tape") return "Tape";
  return "Unknown";
}

function competitorProductSegment(product: CompetitorProduct) {
  const line = product.pack_type === "unknown"
    ? inferProductLine(product.normalized_name || product.raw_title)
    : productLineLabel(product.pack_type);
  const size = cleanText(product.size) ?? inferProductSize(product.normalized_name || product.raw_title);
  return { line, size };
}

function inferProductLine(value: string | null | undefined) {
  const text = (value ?? "").toLowerCase();
  if (text.includes("tape")) return "Tape";
  if (text.includes("pants") || text.includes("pant")) return "Pants";
  return "Pants";
}

function inferProductSize(value: string | null | undefined) {
  const text = (value ?? "").toUpperCase();
  const match = text.match(/\b(NB\/NB-S|XXXXL|XXXL|XXL|XL|NB|L|M|S)\b/);
  return match?.[1] ?? "Unknown";
}

function isMakukuBrandName(value: string | null | undefined) {
  return (value ?? "").toLowerCase().includes("makuku");
}

function isProductBattlePriceEvidence(item: {
  price: number | null;
  brand: string | null;
  channel: PriceSnapshot["channel"];
  capturedAt: string;
}): item is {
  price: number;
  brand: string | null;
  channel: PriceSnapshot["channel"];
  capturedAt: string;
} {
  return isPositiveNumber(item.price);
}

function productSegmentKey(line: string, size: string) {
  return `${slugKey(line)}-${slugKey(size)}`;
}

function productBattleSeverity(input: {
  targetGapPct: number | null;
  floorGapPct: number | null;
  promoSeverity: Severity | null;
  evidenceCount: number;
}): Severity {
  if ((input.floorGapPct !== null && input.floorGapPct < 0) || input.promoSeverity === "critical") return "critical";
  if ((input.targetGapPct !== null && input.targetGapPct < -8) || input.promoSeverity === "high") return "high";
  if (input.evidenceCount > 0 || input.promoSeverity === "medium") return "medium";
  return "low";
}

function productBattleSortScore(battle: ProductSegmentBattle) {
  const floorPressure = battle.floorGapPct === null ? 0 : Math.max(0, -battle.floorGapPct) * 4;
  const targetPressure = battle.targetGapPct === null ? 0 : Math.max(0, -battle.targetGapPct) * 2;
  return actionSeverityRank(battle.severity) * 100 + floorPressure + targetPressure + battle.evidenceCount * 5 + battle.competitorProductCount;
}

function minOrNull(values: number[]) {
  return values.length > 0 ? Math.min(...values) : null;
}

function maxOrNull(values: number[]) {
  return values.length > 0 ? Math.max(...values) : null;
}

function buildOpportunityActions(input: {
  locale: string;
  matrix: DashboardCategoryChannelMatrix;
  feed: PromoEventFeedItem[];
  candidates: AiPriceCandidate[];
}): OpportunityAction[] {
  const isZh = input.locale === "zh";
  const actions: OpportunityAction[] = [];
  const pendingCandidates = input.candidates.filter((candidate) => candidate.status === "pending");

  if (pendingCandidates.length > 0) {
    actions.push({
      id: "action-review-pending-prices",
      type: "review_price",
      status: "pending_review",
      title: isZh ? `复核 ${pendingCandidates.length} 条 AI 价格候选` : `Review ${pendingCandidates.length} AI price candidates`,
      reason: isZh ? "价格候选未审批会阻断价格真值沉淀和后续机会判断。" : "Unreviewed price candidates block the truth source for later opportunity decisions.",
      evidence: isZh
        ? `${input.matrix.collection.aiCandidateCount} 条候选，${input.matrix.collection.approvedCandidateCount} 条已审批`
        : `${input.matrix.collection.aiCandidateCount} candidates, ${input.matrix.collection.approvedCandidateCount} approved`,
      priorityScore: 0,
      severity: pendingCandidates.length >= 100 ? "high" : "medium",
      city: null,
      channelCode: null,
      category: null,
      brandName: null,
      productName: null,
      href: `/${input.locale}/offline-price-candidates?status=pending`,
      sourceIds: pendingCandidates.slice(0, 20).map((candidate) => candidate.id),
    });
  }

  for (const city of input.matrix.battleMapCities) {
    if (city.shareSampleCount === 0 && city.storeCount > 0) {
      actions.push({
        id: `action-capture-${slugKey(city.city)}`,
        type: "capture_evidence",
        status: "capture_needed",
        title: isZh ? `补采 ${city.city} 货架证据` : `Capture shelf evidence in ${city.city}`,
        reason: isZh ? "已有门店覆盖但缺少 Makuku 货架份额样本，无法判断是否占领。" : "Stores are covered but Makuku shelf share evidence is missing.",
        evidence: isZh ? `${city.storeCount} 家门店，${city.promoCount} 条促销信号` : `${city.storeCount} stores, ${city.promoCount} promo signals`,
        priorityScore: 0,
        severity: city.maxSeverity ?? (city.promoCount > 0 ? "medium" : "low"),
        city: city.city,
        channelCode: null,
        category: null,
        brandName: null,
        productName: null,
        href: city.href,
        sourceIds: [`city:${city.city}`],
      });
    }

    if (!city.captured && city.promoCount > 0) {
      actions.push({
        id: `action-defend-${slugKey(city.city)}`,
        type: "defend_city",
        status: "open",
        title: isZh ? `防守 ${city.city} 竞品促销压力` : `Defend ${city.city} promo pressure`,
        reason: isZh ? "竞品促销已经出现，但 Makuku 尚未达到占领阈值。" : "Competitor promos are active before Makuku reaches the captured threshold.",
        evidence: isZh
          ? `${city.promoCount} 条促销，最高折扣 ${city.maxDiscountRate?.toFixed(1) ?? "-"}%`
          : `${city.promoCount} promos, max discount ${city.maxDiscountRate?.toFixed(1) ?? "-"}%`,
        priorityScore: 0,
        severity: city.maxSeverity ?? (city.promoCount >= 3 ? "high" : "medium"),
        city: city.city,
        channelCode: null,
        category: null,
        brandName: null,
        productName: null,
        href: city.href,
        sourceIds: [`city:${city.city}`],
      });
    }
  }

  const highImpactEvents = input.feed
    .filter((event) => event.severity === "critical" || event.severity === "high" || (event.discountRate ?? 0) >= 25)
    .slice(0, 8);

  for (const event of highImpactEvents) {
    actions.push({
      id: `action-event-${event.id}`,
      type: "inspect_promo",
      status: event.status === "pending_review" ? "pending_review" : "open",
      title: isZh ? `复核 ${event.city ?? "未知城市"} ${event.brandName ?? "竞品"} 促销` : `Inspect ${event.brandName ?? "competitor"} promo in ${event.city ?? "unknown city"}`,
      reason: isZh ? "高风险或高折扣促销会直接影响终端价格判断。" : "High-risk or high-discount promos can change terminal price decisions.",
      evidence: [event.storeName, event.category, event.discountLabel].filter(Boolean).join(" / "),
      priorityScore: 0,
      severity: event.severity ?? "medium",
      city: event.city,
      channelCode: event.channelCode,
      category: event.category,
      brandName: event.brandName,
      productName: event.productName,
      href: event.detailHref ? `/${input.locale}${event.detailHref}` : `/${input.locale}/promo-events?city=${encodeURIComponent(event.city ?? "")}`,
      sourceIds: [event.id],
    });
  }

  const expandCells = input.matrix.rows
    .flatMap((row) => row.cells
      .filter((cell) => cell.signalType === "opportunity")
      .map((cell) => ({ row, cell })))
    .slice(0, 6);

  for (const { row, cell } of expandCells) {
    actions.push({
      id: `action-expand-${slugKey(row.category)}-${slugKey(cell.channelCode)}`,
      type: "expand_channel",
      status: "open",
      title: isZh ? `${row.category} 可扩展到 ${cell.channelCode}` : `${row.category} can expand into ${cell.channelCode}`,
      reason: isZh ? "该品类已有促销信号，但这个渠道仍是空白机会。" : "This category has promo signals, while this channel remains whitespace.",
      evidence: isZh ? `品类总促销 ${row.totalPromoCount} 条` : `${row.totalPromoCount} category promo signals`,
      priorityScore: 0,
      severity: "low",
      city: null,
      channelCode: cell.channelCode,
      category: row.category,
      brandName: null,
      productName: null,
      href: cell.href,
      sourceIds: [`category:${row.category}`, `channel:${cell.channelCode}`],
    });
  }

  return dedupeOpportunityActions(actions)
    .map((action) => ({ ...action, priorityScore: scoreOpportunityAction(action) }))
    .sort((a, b) => b.priorityScore - a.priorityScore)
    .slice(0, 40);
}

function scoreOpportunityAction(action: OpportunityAction) {
  const severityScore = actionSeverityRank(action.severity) * 20;
  const typeScore: Record<OpportunityActionType, number> = {
    defend_city: 35,
    review_price: 30,
    inspect_promo: 25,
    capture_evidence: 22,
    expand_channel: 12,
  };
  const statusScore: Record<OpportunityActionStatus, number> = {
    pending_review: 20,
    capture_needed: 18,
    open: 10,
    completed: -100,
  };
  return severityScore + typeScore[action.type] + statusScore[action.status];
}

function actionSeverityRank(severity: Severity | null) {
  if (severity === "critical") return 4;
  if (severity === "high") return 3;
  if (severity === "medium") return 2;
  if (severity === "low") return 1;
  return 0;
}

function dedupeOpportunityActions(actions: OpportunityAction[]) {
  const seen = new Set<string>();
  return actions.filter((action) => {
    if (seen.has(action.id)) return false;
    seen.add(action.id);
    return true;
  });
}

function slugKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "unknown";
}

function buildBattleMapCities(input: {
  cityRows: DashboardCategoryChannelMatrix["cityRows"];
  feed: PromoEventFeedItem[];
  visits: OfflineStoreVisit[];
  locale: string;
  since: Date;
}): DashboardCategoryChannelMatrix["battleMapCities"] {
  return input.cityRows
    .map((row, index) => {
      const cityEvents = input.feed.filter((item) => cleanText(item.city) === row.city);
      const metrics = buildMatrixCellMetrics(cityEvents, input.since);
      const makukuShares = input.visits
        .filter((visit) => cleanText(visit.city) === row.city)
        .map(readMakukuShelfShare)
        .filter(isFiniteNumber);
      const makukuShareAvg = makukuShares.length > 0
        ? Math.round((makukuShares.reduce((sum, value) => sum + value, 0) / makukuShares.length) * 10) / 10
        : null;
      const point = cityMapPoint(row.city, index);

      return {
        city: row.city,
        storeCount: row.storeCount,
        promoCount: metrics.promoCount,
        recentPromoCount: metrics.recentPromoCount,
        maxSeverity: metrics.maxSeverity,
        maxDiscountRate: metrics.maxDiscountRate,
        makukuShareAvg,
        shareSampleCount: makukuShares.length,
        captured: makukuShareAvg !== null && makukuShareAvg >= 30,
        competitionLevel: competitionLevel(metrics),
        x: point.x,
        y: point.y,
        href: `/${input.locale}/promo-events?city=${encodeURIComponent(row.city)}`,
      };
    })
    .sort((a, b) => battleScore(b) - battleScore(a));
}

function readMakukuShelfShare(visit: OfflineStoreVisit) {
  const brands = visit.ai_result?.shelf_understanding?.brands_present ?? [];
  const makuku = brands.find((item) => cleanText(item.brand)?.toLowerCase().includes("makuku"));
  if (!makuku || !isFiniteNumber(makuku.shelf_share_estimate)) return null;
  const rawShare = makuku.shelf_share_estimate;
  const percentShare = rawShare <= 1 ? rawShare * 100 : rawShare;
  return Math.min(100, Math.max(0, percentShare));
}

function competitionLevel(metrics: ReturnType<typeof buildMatrixCellMetrics>) {
  if (metrics.promoCount === 0) return "weak" as const;
  if (
    metrics.maxSeverity === "critical" ||
    metrics.maxSeverity === "high" ||
    (metrics.maxDiscountRate ?? 0) >= 25 ||
    metrics.promoCount >= 3 ||
    metrics.recentPromoCount >= 2
  ) {
    return "strong" as const;
  }
  return "medium" as const;
}

function battleScore(city: DashboardCategoryChannelMatrix["battleMapCities"][number]) {
  const levelScore = city.competitionLevel === "strong" ? 30 : city.competitionLevel === "medium" ? 15 : 0;
  const shareGap = city.captured || city.makukuShareAvg === null ? 0 : 30 - city.makukuShareAvg;
  return levelScore + city.promoCount * 4 + city.recentPromoCount * 3 + city.storeCount + shareGap;
}

function cityMapPoint(city: string, fallbackIndex: number) {
  const points: Record<string, { x: number; y: number }> = {
    aceh: { x: 4, y: 15 },
    medan: { x: 9, y: 22 },
    pekanbaru: { x: 17, y: 34 },
    padang: { x: 14, y: 42 },
    palembang: { x: 22, y: 49 },
    lampung: { x: 25, y: 57 },
    jakarta: { x: 29, y: 62 },
    bandung: { x: 32, y: 66 },
    semarang: { x: 39, y: 64 },
    yogyakarta: { x: 39, y: 70 },
    surabaya: { x: 47, y: 67 },
    denpasar: { x: 55, y: 72 },
    mataram: { x: 59, y: 72 },
    pontianak: { x: 43, y: 39 },
    banjarmasin: { x: 53, y: 54 },
    balikpapan: { x: 58, y: 45 },
    samarinda: { x: 58, y: 41 },
    makassar: { x: 67, y: 59 },
    manado: { x: 78, y: 34 },
    ambon: { x: 84, y: 57 },
    jayapura: { x: 94, y: 52 },
  };
  const key = cleanText(city)?.toLowerCase() ?? "";
  const matchedKey = Object.keys(points).find((pointKey) => key.includes(pointKey));
  if (matchedKey) return points[matchedKey];
  return {
    x: 18 + (fallbackIndex % 7) * 11,
    y: 28 + (Math.floor(fallbackIndex / 7) % 4) * 12,
  };
}

function buildMatrixCellMetrics(events: PromoEventFeedItem[], since: Date) {
  const severities = events.map((event) => event.severity).filter(Boolean) as Severity[];
  const discountRates = events.map((event) => event.discountRate).filter(isPositiveNumber);

  return {
    promoCount: events.length,
    maxSeverity: maxSeverity(severities),
    maxDiscountRate: discountRates.length > 0 ? Math.max(...discountRates) : null,
    recentPromoCount: events.filter((event) => new Date(event.date) >= since).length,
  };
}

function normalizeChannelCode(value: string | null | undefined) {
  const normalized = cleanText(value)?.toLowerCase().replaceAll("-", "_").replaceAll(" ", "_");
  if (!normalized || normalized === "offline" || normalized === "manual") return "other";
  if (normalized === "moderntrade") return "modern_trade";
  if (normalized === "babystore") return "baby_store";
  if (normalized === "generaltrade") return "general_trade";
  return normalized;
}

function maxSeverity(values: Severity[]) {
  const order: Record<Severity, number> = { low: 1, medium: 2, high: 3, critical: 4 };
  return values.sort((a, b) => order[b] - order[a])[0] ?? null;
}

function buildDashboardInsights(input: {
  rows: DashboardCategoryChannelMatrix["rows"];
  cityRows: DashboardCategoryChannelMatrix["cityRows"];
  battleMapCities: DashboardCategoryChannelMatrix["battleMapCities"];
  channels: ChannelMaster[];
  recentPromoCount: number;
  locale: string;
}): DashboardCategoryChannelMatrix["insights"] {
  const isZh = input.locale === "zh";
  const channelNameByCode = new Map(input.channels.map((channel) => [channel.code, channel.name]));
  const offlineChannels = input.channels.filter((channel) => channel.type === "offline");
  const growthOpportunities: DashboardInsight[] = [];
  const riskInsights: DashboardInsight[] = [];

  const dataGapCity = input.battleMapCities
    .filter((city) => city.storeCount > 0 && city.shareSampleCount === 0)
    .sort((a, b) => b.storeCount - a.storeCount)[0];
  if (dataGapCity) {
    growthOpportunities.push({
      id: `growth-map-share-gap-${dataGapCity.city}`,
      title: isZh ? `${dataGapCity.city} \u9700\u8981\u8865\u91c7\u8d27\u67b6\u4efd\u989d` : `${dataGapCity.city} needs shelf-share capture`,
      summary: isZh
        ? `${dataGapCity.storeCount} \u5bb6\u95e8\u5e97\u5df2\u5efa\u6863\uff0c\u4f46\u8fd8\u6ca1\u6709 Makuku \u8d27\u67b6\u4efd\u989d\u6837\u672c\uff0c\u4f18\u5148\u8865\u91c7\u81ea\u5bb6\u8d27\u67b6\u548c\u7ade\u54c1\u8d27\u67b6\u3002`
        : `${dataGapCity.storeCount} stores are covered but no Makuku shelf-share sample is available; prioritize own-shelf and competitor-shelf capture.`,
      level: "medium",
      href: dataGapCity.href,
    });
  }

  const contestedCity = input.battleMapCities
    .filter((city) => !city.captured && city.competitionLevel !== "weak" && city.promoCount > 0)
    .sort((a, b) => battleScore(b) - battleScore(a))[0];
  if (contestedCity) {
    const shareText = contestedCity.makukuShareAvg === null ? (isZh ? "\u6682\u65e0\u8d27\u67b6\u4efd\u989d" : "no shelf-share sample") : `${contestedCity.makukuShareAvg.toFixed(1)}%`;
    riskInsights.push({
      id: `risk-map-contested-${contestedCity.city}`,
      title: isZh ? `${contestedCity.city} \u7ade\u4e89\u672a\u62ff\u4e0b` : `${contestedCity.city} is contested`,
      summary: isZh
        ? `\u5df2\u8bb0\u5f55 ${contestedCity.promoCount} \u6761\u4fc3\u9500\u4fe1\u53f7\uff0cMakuku \u8d27\u67b6\u4efd\u989d ${shareText}\uff0c\u5efa\u8bae\u5148\u590d\u6838\u9ad8\u6298\u6263\u95e8\u5e97\u3002`
        : `${contestedCity.promoCount} promo signals are logged and Makuku shelf share is ${shareText}; review high-discount stores first.`,
      level: contestedCity.maxSeverity ?? (contestedCity.promoCount >= 3 ? "high" : "medium"),
      href: contestedCity.href,
    });
  }

  const capturedHeatingCity = input.battleMapCities
    .filter((city) => city.captured && city.promoCount > 0)
    .sort((a, b) => battleScore(b) - battleScore(a))[0];
  if (capturedHeatingCity) {
    riskInsights.push({
      id: `risk-map-defend-${capturedHeatingCity.city}`,
      title: isZh ? `${capturedHeatingCity.city} \u5df2\u5360\u9886\u4f46\u4fc3\u9500\u5347\u6e29` : `${capturedHeatingCity.city} is captured but heating up`,
      summary: isZh
        ? `Makuku \u8d27\u67b6\u4efd\u989d ${capturedHeatingCity.makukuShareAvg?.toFixed(1)}%\uff0c\u4ecd\u6709 ${capturedHeatingCity.promoCount} \u6761\u7ade\u54c1\u4fc3\u9500\uff0c\u5efa\u8bae\u505a\u9632\u5b88\u5de1\u5e97\u3002`
        : `Makuku shelf share is ${capturedHeatingCity.makukuShareAvg?.toFixed(1)}%, but ${capturedHeatingCity.promoCount} competitor promos are active; keep this city on defense.`,
      level: capturedHeatingCity.maxSeverity ?? "medium",
      href: capturedHeatingCity.href,
    });
  }

  const cityOpportunities = input.cityRows
    .flatMap((row) => row.cells
      .filter((cell) => row.storeCount > 0 && cell.promoCount === 0 && offlineChannels.some((channel) => channel.code === cell.channelCode))
      .map((cell) => ({
        city: row.city,
        storeCount: row.storeCount,
        channelCode: cell.channelCode,
        href: cell.href,
      })))
    .sort((a, b) => b.storeCount - a.storeCount);

  for (const item of cityOpportunities.slice(0, 2)) {
    const channelName = channelNameByCode.get(item.channelCode) ?? item.channelCode;
    growthOpportunities.push({
      id: `growth-city-${item.city}-${item.channelCode}`,
      title: isZh ? `${item.city} ${channelName} 空白机会` : `${item.city} ${channelName} whitespace`,
      summary: isZh
        ? `${item.storeCount} 家门店已覆盖，但该渠道暂无促销事件，可优先补采价格牌和陈列活动。`
        : `${item.storeCount} stores are covered but no promo events are logged for this channel; prioritize price-tag and display capture.`,
      level: "medium",
      href: item.href,
    });
  }

  const categoryOpportunities = input.rows
    .flatMap((row) => row.cells
      .filter((cell) => row.totalPromoCount > 0 && cell.promoCount === 0)
      .map((cell) => ({
        category: row.category,
        channelCode: cell.channelCode,
        href: cell.href,
      })));

  for (const item of categoryOpportunities.slice(0, 3 - growthOpportunities.length)) {
    const channelName = channelNameByCode.get(item.channelCode) ?? item.channelCode;
    growthOpportunities.push({
      id: `growth-category-${item.category}-${item.channelCode}`,
      title: isZh ? `${item.category} 可扩展到 ${channelName}` : `${item.category} can expand into ${channelName}`,
      summary: isZh
        ? `该品类已有促销信号，但 ${channelName} 暂无记录，可作为下一轮渠道补投或补采方向。`
        : `This category already has promo signals, while ${channelName} has no records; use it as the next channel capture or activation target.`,
      level: "low",
      href: item.href,
    });
  }

  const categoryRisks = input.rows
    .flatMap((row) => row.cells
      .filter((cell) => cell.promoCount > 0)
      .map((cell) => ({
        category: row.category,
        channelCode: cell.channelCode,
        promoCount: cell.promoCount,
        href: cell.href,
      })))
    .sort((a, b) => b.promoCount - a.promoCount);

  const topCategoryRisk = categoryRisks[0];
  if (topCategoryRisk) {
    const channelName = channelNameByCode.get(topCategoryRisk.channelCode) ?? topCategoryRisk.channelCode;
    riskInsights.push({
      id: `risk-category-${topCategoryRisk.category}-${topCategoryRisk.channelCode}`,
      title: isZh ? `${topCategoryRisk.category} 在 ${channelName} 促销集中` : `${topCategoryRisk.category} is active on ${channelName}`,
      summary: isZh
        ? `当前已有 ${topCategoryRisk.promoCount} 条促销信号，建议优先复核折扣力度和对标 SKU。`
        : `${topCategoryRisk.promoCount} promo signals are active; review discount depth and matched SKUs first.`,
      level: topCategoryRisk.promoCount >= 3 ? "high" : "medium",
      href: topCategoryRisk.href,
    });
  }

  const topCityRisk = input.cityRows
    .filter((row) => row.totalPromoCount > 0)
    .sort((a, b) => b.totalPromoCount - a.totalPromoCount)[0];
  if (topCityRisk) {
    riskInsights.push({
      id: `risk-city-${topCityRisk.city}`,
      title: isZh ? `${topCityRisk.city} 线下促销压力` : `${topCityRisk.city} offline promo pressure`,
      summary: isZh
        ? `${topCityRisk.city} 已记录 ${topCityRisk.totalPromoCount} 条促销，覆盖 ${topCityRisk.storeCount} 家门店，建议督导复核重点门店。`
        : `${topCityRisk.totalPromoCount} promos are logged across ${topCityRisk.storeCount} stores; supervisors should review priority stores.`,
      level: topCityRisk.totalPromoCount >= 3 ? "high" : "medium",
      href: `/${input.locale}/promo-events?city=${encodeURIComponent(topCityRisk.city)}`,
    });
  }

  if (input.recentPromoCount > 0) {
    riskInsights.push({
      id: "risk-recent-promos",
      title: isZh ? "近 24 小时促销活跃" : "Promos active in the last 24h",
      summary: isZh
        ? `近 24 小时新增 ${input.recentPromoCount} 条促销信号，建议先处理高风险和折扣异常事件。`
        : `${input.recentPromoCount} promo signals appeared in the last 24h; start with high-risk and abnormal discount events.`,
      level: input.recentPromoCount >= 3 ? "critical" : "high",
      href: `/${input.locale}/promo-events`,
    });
  }

  return {
    growthOpportunities: growthOpportunities.slice(0, 3),
    riskInsights: riskInsights.slice(0, 3),
  };
}

function buildPromoEventFeed(events: PromoEvent[], visits: OfflineStoreVisit[], uploads: OfflineUpload[], materialMaster: MaterialMaster[]) {
  const offlineItems = [
    ...buildOfflineCaptureFeedItems(visits, materialMaster),
    ...buildOfflineUploadFeedItems(uploads, materialMaster),
  ];
  const offlineEvidence = new Set(offlineItems.map((item) => item.evidenceUrl).filter(Boolean));
  const eventItems = events
    .filter((event) => !(event.channel === "offline" && event.evidence_url && offlineEvidence.has(event.evidence_url)))
    .map((event) => buildPromoEventFeedItem(event, materialMaster));

  return [...offlineItems, ...eventItems].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

function buildPromoEventFeedItem(event: PromoEvent, materialMaster: MaterialMaster[]): PromoEventFeedItem {
  const brand = event.competitor_products?.brands ?? null;
  const productName = event.competitor_products?.normalized_name ?? event.competitor_products?.raw_title ?? null;
  const discountRate = calculateDiscountRate(event.old_price_per_piece, event.new_price_per_piece);
  const category = resolveSubBrand(materialMaster, [
    event.sku_master?.makuku_sku_name,
    productName,
    brand?.name,
  ]);
  return {
    id: `promo-event-${event.id}`,
    source: "promo_event",
    sourceId: event.id,
    detailHref: `/promo-events/${event.id}`,
    channel: event.channel,
    channelCode: event.channel === "offline" ? "other" : event.channel,
    severity: event.severity,
    brandName: brand?.name ?? null,
    brandId: brand?.id ?? event.competitor_products?.brand_id ?? null,
    category,
    productName,
    city: event.city,
    date: event.started_at,
    storeName: event.competitor_products?.shop_name ?? event.city ?? null,
    activityName: event.event_title,
    discountRate,
    discountLabel: formatDiscountLabel(discountRate),
    status: "confirmed",
    evidenceUrl: event.evidence_url,
  };
}

function buildOfflineCaptureFeedItems(visits: OfflineStoreVisit[], materialMaster: MaterialMaster[]) {
  return visits.flatMap((visit) => (visit.offline_visit_images ?? []).flatMap((image) => {
    const detectedProducts = getDetectedProducts(image.vision_result);
    return detectedProducts
      .filter(hasOfflinePromoSignal)
      .map((product, index): PromoEventFeedItem => {
        const brandName = cleanText(product.brand_name);
        const productName = cleanText(product.product_name_normalized) ?? cleanText(product.product_name_raw);
        const promoText = cleanText(product.promo_text_raw);
        const discountRate = calculateDiscountRate(product.list_price_idr, product.promo_price_idr);
        const category = resolveSubBrand(materialMaster, [productName, brandName, promoText]);
        return {
          id: `offline-capture-${image.id}-${index}`,
          source: "offline_capture",
          sourceId: image.id,
          detailHref: `/offline-uploads/${visit.id}`,
          channel: "offline",
          channelCode: visit.channel_type || "other",
          severity: null,
          brandName,
          brandId: null,
          category,
          productName,
          city: visit.city,
          date: visit.visit_date ?? image.uploaded_at ?? image.created_at ?? visit.created_at,
          storeName: visit.store_name,
          activityName: buildActivityName(brandName, productName, promoText, product.promo_mechanic),
          discountRate,
          discountLabel: formatDiscountLabel(discountRate),
          status: image.analysis_status === "reviewed" || visit.visit_status === "reviewed" ? "confirmed" : "pending_review",
          evidenceUrl: image.image_url,
        };
      });
  }));
}

function buildOfflineUploadFeedItems(uploads: OfflineUpload[], materialMaster: MaterialMaster[]) {
  return uploads.flatMap((upload) => (upload.offline_ocr_results ?? [])
    .filter((ocr) => Boolean(cleanText(ocr.detected_promo_text)) || isPositiveNumber(ocr.detected_price_idr))
    .map((ocr): PromoEventFeedItem => {
      const brandName = cleanText(ocr.corrected_brand) ?? cleanText(ocr.detected_brand);
      const productName = cleanText(ocr.corrected_product) ?? cleanText(ocr.detected_product);
      const promoText = cleanText(ocr.detected_promo_text);
      const category = resolveSubBrand(materialMaster, [productName, brandName, promoText]);
      return {
        id: `offline-upload-${upload.id}-${ocr.id}`,
        source: "offline_upload",
        sourceId: upload.id,
        detailHref: null,
        channel: "offline",
        channelCode: upload.channel_type || "other",
        severity: null,
        brandName,
        brandId: null,
        category,
        productName,
        city: upload.city,
        date: ocr.created_at ?? upload.created_at,
        storeName: upload.store_name,
        activityName: buildActivityName(brandName, productName, promoText, "offline_display"),
        discountRate: null,
        discountLabel: "-",
        status: ocr.reviewed || upload.upload_status === "reviewed" ? "confirmed" : "pending_review",
        evidenceUrl: upload.image_url,
      };
    }));
}

function getDetectedProducts(value: unknown): VisionDetectedProduct[] {
  if (!isRecord(value) || !Array.isArray(value.detected_products)) return [];
  return value.detected_products.filter(isRecord) as VisionDetectedProduct[];
}

function hasOfflinePromoSignal(product: VisionDetectedProduct) {
  const mechanic = cleanText(product.promo_mechanic);
  return isPositiveNumber(product.promo_price_idr)
    || Boolean(cleanText(product.promo_text_raw))
    || Boolean(mechanic && mechanic !== "unknown");
}

function buildActivityName(brandName: string | null, productName: string | null, promoText: string | null, promoMechanic: string | null | undefined) {
  if (promoText) {
    const subject = [brandName, productName].filter(Boolean).join(" ");
    return subject ? `${promoText} - ${subject}` : promoText;
  }
  const subject = [brandName, productName].filter(Boolean).join(" ");
  const mechanic = cleanText(promoMechanic)?.replaceAll("_", " ");
  return [subject, mechanic || "offline promo"].filter(Boolean).join(" - ");
}

function resolveSubBrand(materialMaster: MaterialMaster[], values: Array<string | null | undefined>) {
  const haystack = values.filter(Boolean).join(" ").toLowerCase();
  if (!haystack) return "Unassigned";

  const exactSku = materialMaster.find((item) => item.tenant_sku_name && haystack.includes(item.tenant_sku_name.toLowerCase()));
  if (exactSku?.sub_brand) return exactSku.sub_brand;

  const subBrands = Array.from(new Set(materialMaster.map((item) => cleanText(item.sub_brand)).filter(Boolean) as string[]));
  const matchedSubBrand = subBrands.find((subBrand) => haystack.includes(subBrand.toLowerCase()));
  return matchedSubBrand ?? "Unassigned";
}

function calculateDiscountRate(listPrice: number | null | undefined, promoPrice: number | null | undefined) {
  if (!isPositiveNumber(listPrice) || !isPositiveNumber(promoPrice) || promoPrice > listPrice) return null;
  return Math.round(((listPrice - promoPrice) / listPrice) * 1000) / 10;
}

function formatDiscountLabel(discountRate: number | null) {
  if (discountRate === null) return "-";
  return `${discountRate.toFixed(1)}% off`;
}

function cleanText(value: unknown) {
  const text = typeof value === "string" ? value.trim() : "";
  return text.length > 0 ? text : null;
}

function isPositiveNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export async function getOfflineUploads(): Promise<QueryResult<OfflineUpload[]>> {
  if (!hasSupabaseConfig()) return { data: demoOfflineUploads, error: null, isDemo: true };
  const supabase = createSupabaseAnonClient();
  return fromSupabase<OfflineUpload[]>(
    supabase
      .from("offline_uploads")
      .select("*, offline_ocr_results(*)")
      .order("created_at", { ascending: false }),
    demoOfflineUploads,
  );
}

function filterDemoOfflineStoreVisits(filters: OfflineStoreVisitFilters = {}) {
  return demoOfflineStoreVisits.filter((visit) => {
    const q = filters.q?.toLowerCase();
    if (q && ![visit.store_name, visit.city, visit.uploader_name].some((value) => value.toLowerCase().includes(q))) return false;
    if (filters.city && !visit.city.toLowerCase().includes(filters.city.toLowerCase())) return false;
    if (filters.status && visit.visit_status !== filters.status) return false;
    if (filters.uploaderName && visit.uploader_name !== filters.uploaderName) return false;
    if (filters.uploaderUserId && visit.uploader_user_id && visit.uploader_user_id !== filters.uploaderUserId) return false;
    if (filters.dateFrom && visit.visit_date < filters.dateFrom) return false;
    if (filters.dateTo && visit.visit_date > filters.dateTo) return false;
    return true;
  }).slice(0, filters.limit ?? 100);
}

export async function getOfflineStoreVisits(filters: OfflineStoreVisitFilters = {}): Promise<QueryResult<OfflineStoreVisit[]>> {
  if (!hasSupabaseServiceConfig()) return { data: filterDemoOfflineStoreVisits(filters), error: null, isDemo: true };
  const supabase = createSupabaseServiceClient();
  const runQuery = async (includeUploaderUserId: boolean) => {
    let query = supabase
      .from("offline_store_visits")
      .select("*, offline_visit_images(*)")
      .order("created_at", { ascending: false })
      .limit(filters.limit ?? 100);

    if (filters.q) {
      const q = filters.q.replaceAll(",", " ");
      query = query.or(`store_name.ilike.%${q}%,city.ilike.%${q}%,uploader_name.ilike.%${q}%`);
    }
    if (filters.city) query = query.ilike("city", `%${filters.city}%`);
    if (filters.status) query = query.eq("visit_status", filters.status);
    if (includeUploaderUserId && filters.uploaderName && filters.uploaderUserId) {
      query = query.or(`uploader_user_id.eq.${filters.uploaderUserId},uploader_name.eq.${filters.uploaderName}`);
    } else if (includeUploaderUserId && filters.uploaderUserId) {
      query = query.eq("uploader_user_id", filters.uploaderUserId);
    } else if (filters.uploaderName) {
      query = query.eq("uploader_name", filters.uploaderName);
    }
    if (filters.dateFrom) query = query.gte("visit_date", filters.dateFrom);
    if (filters.dateTo) query = query.lte("visit_date", filters.dateTo);
    return query;
  };

  let { data, error } = await runQuery(true);
  if (error?.message.includes("uploader_user_id")) {
    const legacyResult = await runQuery(false);
    data = legacyResult.data;
    error = legacyResult.error;
  }
  if (error) return { data: filterDemoOfflineStoreVisits(filters), error: error.message, isDemo: true };
  return { data: await attachVisitImageUrls((data ?? []) as OfflineStoreVisit[]), error: null, isDemo: false };
}

export async function getOfflineStoreVisit(id: string): Promise<QueryResult<OfflineStoreVisit | null>> {
  if (!hasSupabaseServiceConfig()) {
    return {
      data: demoOfflineStoreVisits.find((visit) => visit.id === id) ?? null,
      error: null,
      isDemo: true,
    };
  }

  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("offline_store_visits")
    .select("*, offline_visit_images(*)")
    .eq("id", id)
    .single();
  if (error) return { data: null, error: error.message, isDemo: false };
  const [visit] = await attachVisitImageUrls([data as OfflineStoreVisit]);
  return { data: visit, error: null, isDemo: false };
}

async function attachVisitImageUrls(visits: OfflineStoreVisit[]) {
  const supabase = createSupabaseServiceClient();
  return Promise.all(visits.map(async (visit) => {
    const imagePaths = Array.isArray(visit.image_urls) ? visit.image_urls : [];
    const categories = Array.isArray(visit.image_categories) ? visit.image_categories : [];
    const signedImages = await Promise.all(imagePaths.map(async (path, index) => {
      const { data } = await supabase.storage
        .from("store-visits")
        .createSignedUrl(path, 60 * 60);
      return { path, url: data?.signedUrl ?? null, category: categories[index] };
    }));

    return {
      ...visit,
      signed_images: signedImages,
      offline_visit_images: await Promise.all((visit.offline_visit_images ?? []).map(async (image) => {
        if (image.image_url) return image;
        const { data } = await supabase.storage
          .from("offline-visit-images")
          .createSignedUrl(image.image_path, 60 * 60);
        return { ...image, image_url: data?.signedUrl ?? null };
      })),
    };
  }));
}

export async function getAlerts(): Promise<QueryResult<Alert[]>> {
  if (!hasSupabaseConfig()) return { data: demoAlerts, error: null, isDemo: true };
  const supabase = createSupabaseAnonClient();
  return fromSupabase<Alert[]>(
    supabase
      .from("alerts")
      .select("*, promo_events(*, competitor_products(*, brands(id,name)))")
      .order("created_at", { ascending: false }),
    demoAlerts,
  );
}

export function getHighRiskRecommendations() {
  return demoAiRecommendations.filter((item) => item.risk_level === "high" || item.risk_level === "critical");
}

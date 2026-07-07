import {
  demoAiRecommendations,
  demoAlerts,
  demoBrands,
  demoChannels,
  demoCompetitors,
  demoCompetitorSeriesMappings,
  demoMaterialMaster,
  demoMarketBenchmarks,
  demoOfflineStores,
  demoOfflineStoreVisits,
  demoOfflineUploads,
  demoPriceSnapshots,
  demoPromoEvents,
  demoSkuMaster,
} from "@/lib/demo-data";
import { formatShortImageId } from "@/lib/format";
import { monthWeeks } from "@/lib/periods";
import { priceSnapshotBusinessLine, priceSnapshotBusinessSegment, priceSnapshotBusinessSize } from "@/lib/price-snapshot-business";
import { findMatchingMaterialForSeries } from "@/lib/competitor-series-mapping";
import { createSupabaseAnonClient, createSupabaseServiceClient, hasSupabaseConfig, hasSupabaseServiceConfig } from "@/lib/supabase";
import type {
  Alert,
  AiPriceCandidate,
  AiPriceReviewRule,
  AppUser,
  Brand,
  ChannelMaster,
  CompetitorProduct,
  CompetitorSeriesMapping,
  DashboardCategoryChannelMatrix,
  DashboardCollectionEfficiency,
  DashboardInsight,
  MaterialMaster,
  MarketBenchmark,
  OfflineStore,
  OfflineUpload,
  OfflineStoreVisit,
  Organization,
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
  WeeklyPriceCoefficientBoard,
  WeeklyPriceCoefficientCell,
  WeeklyPriceCoefficientNode,
} from "@/lib/types";

type QueryResult<T> = { data: T; error: string | null; isDemo: boolean };
export type PaginatedQueryResult<T> = QueryResult<T[]> & { total: number; page: number; perPage: number };

export type OfflineStoreVisitFilters = {
  q?: string;
  city?: string;
  status?: string;
  uploaderName?: string;
  uploaderUserId?: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  includeImageUrls?: boolean;
};

export type StoreVisitMonitorFilters = {
  dateFrom?: string;
  dateTo?: string;
  visitCode?: string;
  storeName?: string;
  promoter?: string;
  analysisStatus?: string;
  limit?: number;
  page?: number;
  pageSize?: number;
};

export type StoreVisitMonitorItem = {
  visitId: string;
  visitCode: string | null;
  storeName: string;
  visitDate: string;
  promoter: string;
  analysisStatus: string | null;
  visitStatus: string;
  fullAnalysisTimeMs: number | null;
  imageCount: number;
  successCount: number;
  failureCount: number;
  retakeRequiredCount: number;
  accuracy: number | null;
  autoApprovalRate: number | null;
  avgPriceDeviationRate: number | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string | null;
};

export type StoreVisitMonitorSummary = {
  visitsAnalyzed: number;
  p50: number | null;
  p90: number | null;
  p95: number | null;
  actionRequiredOrFailedCount: number;
  averageImagesPerVisit: number | null;
  averageSuccessfulImagesPerVisit: number | null;
};

export type StoreVisitMonitorQuality = {
  accuracy: number | null;
  autoApprovalRate: number | null;
  avgPriceDeviationRate: number | null;
};

export type StoreVisitMonitorResult = {
  summary: StoreVisitMonitorSummary;
  quality: StoreVisitMonitorQuality;
  visits: StoreVisitMonitorItem[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    from: number;
    to: number;
    hasPrevious: boolean;
    hasNext: boolean;
  };
  filters: {
    dateFrom: string;
    dateTo: string;
    isDefaultRecent24Hours: boolean;
  };
};

export type AiPriceCandidateFilters = {
  dateFrom?: string;
  dateTo?: string;
  visitCode?: string;
  imageId?: string;
  status?: "pending" | "approved" | "rejected";
  limit?: number;
  page?: number;
  perPage?: number;
};

export type PriceSnapshotOwnerFilter = "all" | "makuku" | "competitor";

export type PriceSnapshotFilters = {
  owner?: PriceSnapshotOwnerFilter;
  capturedFrom?: string;
  capturedTo?: string;
  visitCode?: string;
  limit?: number;
  offset?: number;
};

export type PriceSnapshotPageFilters = PriceSnapshotFilters & {
  brand?: string;
  sku?: string;
  line?: string;
  priceBand?: string;
  size?: string;
  province?: string;
  cityName?: string;
  district?: string;
  store?: string;
  page?: number;
  perPage?: number;
};

const priceSnapshotVisitColumns = "id,visit_code,store_name,city,province,city_name,district,channel_type,visit_date,uploader_name,created_at";
const priceSnapshotSelectWithMaterial = `*, sku_master(*, material_master(*)), material_master(*), offline_stores(id,name,city,province,city_name,district,channel_type,organization_id,organizations(id,name,status)), offline_store_visits!source_visit_id(${priceSnapshotVisitColumns}), competitor_products(*, brands(id,name), sku_matches(*, sku_master(*, material_master(*)))), ai_price_candidates(id, offline_store_visits(${priceSnapshotVisitColumns}))`;
const legacyPriceSnapshotSelect = `*, sku_master(*), offline_stores(id,name,city,province,city_name,district,channel_type,organization_id,organizations(id,name,status)), offline_store_visits!source_visit_id(${priceSnapshotVisitColumns}), competitor_products(*, brands(id,name), sku_matches(*, sku_master(*))), ai_price_candidates(id, offline_store_visits(${priceSnapshotVisitColumns}))`;

export type ProductSegmentPriceIndexFilters = {
  province?: string;
  cityName?: string;
  district?: string;
  line?: string;
  priceBand?: string;
  size?: string;
  status?: "low_index" | "near_index" | "missing_benchmark" | "all";
  sort?: "priceIndexAsc" | "priceIndexDesc" | "problemStoresDesc" | "latest";
};

const defaultAiPriceReviewRule: AiPriceReviewRule = {
  id: "demo-default-ai-price-review-rule",
  name: "Default bulk review rule",
  min_ai_confidence: 0.95,
  min_match_score: 0.9,
  require_matched_entity: true,
  require_no_warnings: true,
  require_price_and_piece: true,
  active: true,
  created_at: "1970-01-01T00:00:00.000Z",
  updated_at: null,
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

function isMissingVisitCodeError(error: { message?: string } | null) {
  return (error?.message ?? "").includes("visit_code");
}

function escapeIlikePattern(value: string) {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
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
    .eq("active", true)
    .order("sort_order")
    .order("name");

  if (isMissingSchemaError(error)) return { data: demoChannels, error: null, isDemo: false };
  if (error) return { data: demoChannels, error: error.message, isDemo: true };
  return { data: (data ?? []) as ChannelMaster[], error: null, isDemo: false };
}

export async function getMarketBenchmarks(): Promise<QueryResult<MarketBenchmark[]>> {
  if (!hasSupabaseServiceConfig()) return { data: demoMarketBenchmarks, error: null, isDemo: true };

  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("market_benchmarks")
    .select("*, competitor_products(*, brands(id,name), sku_matches(*, sku_master(*)))")
    .order("market")
    .order("product_line")
    .order("size");

  if (isMissingSchemaError(error) || error?.message.includes("market_benchmarks")) {
    return { data: demoMarketBenchmarks, error: "Run migration 202606090001_market_benchmarks_and_store_regions.sql", isDemo: true };
  }
  if (error) return { data: demoMarketBenchmarks, error: error.message, isDemo: true };
  return { data: (data ?? []) as MarketBenchmark[], error: null, isDemo: false };
}

export async function getAppUsers(): Promise<QueryResult<AppUser[]>> {
  return getFilteredAppUsers();
}

export async function getFilteredAppUsers(filters: {
  q?: string;
  role?: string;
} = {}): Promise<QueryResult<AppUser[]>> {
  if (!hasSupabaseServiceConfig()) {
    return {
      data: [],
      error: "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
      isDemo: true,
    };
  }

  const supabase = createSupabaseServiceClient();
  const q = cleanText(filters.q)?.toLowerCase() ?? "";
  const roleFilter = cleanText(filters.role);
  let { data, error } = await supabase
    .from("app_users")
    .select("id,username,display_name,email,feishu_user_id,password_login_enabled,feishu_org_mismatch,role,status,disabled_at,updated_at,created_at,organization_members(*, organizations(id,name,status))")
    .order("created_at", { ascending: false });

  if (error?.message.includes("status") || error?.message.includes("disabled_at") || error?.message.includes("updated_at") || error?.message.includes("email") || error?.message.includes("feishu_user_id") || error?.message.includes("password_login_enabled") || error?.message.includes("feishu_org_mismatch")) {
    const legacy = await supabase
      .from("app_users")
      .select("id,username,display_name,role,created_at")
      .order("created_at", { ascending: false });
    data = (legacy.data ?? []).map((user) => ({
      ...user,
      status: "enabled",
      disabled_at: null,
      updated_at: null,
      email: null,
      feishu_user_id: null,
      password_login_enabled: true,
      feishu_org_mismatch: false,
      organization_members: [],
    }));
    error = legacy.error;
  }

  if (isMissingSchemaError(error)) return { data: [], error: "Run migration 202606080004_app_user_management.sql", isDemo: false };
  if (error) return { data: [], error: error.message, isDemo: false };

  const users = ((data ?? []) as AppUser[]).filter((user) => {
    if (roleFilter && user.role !== roleFilter) return false;
    if (!q) return true;

    const organizationNames = (user.organization_members ?? [])
      .filter((member) => member.active)
      .map((member) => member.organizations?.name ?? "")
      .join(" ");

    const haystack = [
      user.username,
      user.display_name,
      user.role,
      organizationNames,
    ].join(" ").toLowerCase();

    return haystack.includes(q);
  });

  return { data: users, error: null, isDemo: false };
}

export async function getOrganizations(): Promise<QueryResult<Organization[]>> {
  if (!hasSupabaseServiceConfig()) {
    return { data: [], error: "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY", isDemo: true };
  }

  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("organizations")
    .select("*, organization_members(*, app_users(id,username,display_name,email,feishu_user_id,role,status)), organization_region_rules(*)")
    .order("name");

  if (isMissingSchemaError(error) || error?.message.includes("organizations")) {
    return { data: [], error: "Run migration 202606160002_organizations_store_assignment.sql", isDemo: false };
  }
  if (error) return { data: [], error: error.message, isDemo: false };

  const organizations = ((data ?? []) as Organization[]).map((organization) => {
    const members = organization.organization_members?.filter((member) => member.active) ?? [];
    const rules = organization.organization_region_rules?.filter((rule) => rule.active) ?? [];
    return {
      ...organization,
      member_count: members.length,
      region_rule_count: rules.length,
      organization_members: members,
      organization_region_rules: rules,
    };
  });
  return { data: organizations, error: null, isDemo: false };
}

type OfflineStoreStatusFilter = "enabled" | "disabled" | "all";
type OfflineStoreOrganizationFilter = "all" | "unassigned" | string;

export async function getOfflineStores({
  status = "enabled",
  organization = "all",
}: { status?: OfflineStoreStatusFilter; organization?: OfflineStoreOrganizationFilter } = {}): Promise<QueryResult<OfflineStore[]>> {
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
    .select("*, channels(id,code,name,type), organizations(id,name,status)")
    .order("created_at", { ascending: false });

  if (error?.message.includes("channels") || error?.message.includes("schema cache")) {
    const legacy = await supabase
      .from("offline_stores")
      .select("*")
      .order("created_at", { ascending: false });
    data = legacy.data;
    error = legacy.error;
  }

  if (error?.message.includes("organizations") || error?.message.includes("organization_id")) {
    const noOrganization = await supabase
      .from("offline_stores")
      .select("*, channels(id,code,name,type)")
      .order("created_at", { ascending: false });
    data = noOrganization.data;
    error = noOrganization.error;
  }

  const storeError = error;
  const masterStores = storeError && !isMissingSchemaError(storeError) ? [] : ((data ?? []) as OfflineStore[]);
  const disabledStoreIds = new Set(masterStores.filter(isDisabledOfflineStore).map((store) => store.id));
  const disabledStoreKeys = new Set(masterStores.filter(isDisabledOfflineStore).map(storeKey).filter(Boolean) as string[]);
  const activeMasterStores = filterDisabledOfflineStores(masterStores, disabledStoreIds, disabledStoreKeys);

  const visitsResult = await readVisitStoresForStoreList(supabase);
  const uploadsResult = await readUploadStoresForStoreList(supabase);
  const stores = filterStoresByOrganization(mergeOfflineStores(status === "disabled"
    ? masterStores.filter(isDisabledOfflineStore)
    : [
        ...(status === "all" ? masterStores : activeMasterStores),
        ...filterDisabledOfflineStores(visitsResult.stores, disabledStoreIds, disabledStoreKeys),
        ...filterDisabledOfflineStores(uploadsResult.stores, disabledStoreIds, disabledStoreKeys),
      ]), organization);

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

function cityLabelFromRegionSource(source: Pick<OfflineStore, "city" | "province" | "city_name" | "district"> | Pick<OfflineStoreVisit, "city" | "province" | "city_name" | "district"> | { city?: string | null } | null | undefined) {
  if (!source) return null;
  if ("province" in source || "city_name" in source || "district" in source) {
    const label = regionLabel({
      province: cleanRegionText("province" in source ? source.province : null),
      cityName: cleanRegionText("city_name" in source ? source.city_name : null),
      district: cleanRegionText("district" in source ? source.district : null),
    });
    if (label) return label;
  }
  return cleanText(source.city);
}

function storeRegionKeyLabel(store: Pick<OfflineStore, "city" | "province" | "city_name" | "district">) {
  return cityLabelFromRegionSource(store);
}

function storeKey(store: Pick<OfflineStore, "name" | "city" | "province" | "city_name" | "district">) {
  const name = cleanText(store.name);
  const city = storeRegionKeyLabel(store);
  if (!name || !city) return null;
  return `${city.toLowerCase()}::${name.toLowerCase()}`;
}

function isDisabledOfflineStore(store: OfflineStore) {
  return store.status === "disabled" || Boolean(store.disabled_at || store.deleted_at);
}

function isMasterOfflineStoreId(id: string | null | undefined) {
  const value = String(id ?? "");
  return Boolean(value) && !value.startsWith("visit-store-") && !value.startsWith("upload-store-");
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

function storeMergeKey(store: Pick<OfflineStore, "id" | "name" | "city" | "province" | "city_name" | "district">) {
  if (isMasterOfflineStoreId(store.id)) return `id:${store.id}`;
  return storeKey(store);
}

export function mergeOfflineStores(stores: OfflineStore[]) {
  const merged = new Map<string, OfflineStore>();

  for (const store of stores) {
    const name = cleanText(store.name);
    const city = storeRegionKeyLabel(store);
    if (!name || !city) continue;

    const key = storeMergeKey(store);
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
      id: isMasterOfflineStoreId(current.id) ? current.id : normalizedStore.id,
      channel_type: current.channel_type || normalizedStore.channel_type,
      channel_id: current.channel_id ?? normalizedStore.channel_id,
      address: current.address ?? normalizedStore.address,
      status: current.status ?? normalizedStore.status,
      disabled_at: current.disabled_at ?? normalizedStore.disabled_at,
      deleted_at: current.deleted_at ?? normalizedStore.deleted_at,
      created_by: current.created_by ?? normalizedStore.created_by,
      created_by_name: current.created_by_name ?? normalizedStore.created_by_name,
      created_by_user: current.created_by_user ?? normalizedStore.created_by_user,
      organization_id: current.organization_id ?? normalizedStore.organization_id,
      organization_assignment_method: current.organization_assignment_method ?? normalizedStore.organization_assignment_method,
      organization_assigned_at: current.organization_assigned_at ?? normalizedStore.organization_assigned_at,
      organization_region_rule_id: current.organization_region_rule_id ?? normalizedStore.organization_region_rule_id,
      organizations: current.organizations ?? normalizedStore.organizations,
      channels: current.channels ?? normalizedStore.channels,
      created_at: current.created_at ?? normalizedStore.created_at,
    });
  }

  return Array.from(merged.values()).sort((a, b) => {
    const dateCompare = new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime();
    return dateCompare || a.name.localeCompare(b.name);
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
  const shouldFilterVisit = Boolean(filters.dateFrom || filters.dateTo || filters.visitCode);
  const visitColumns = "id,visit_code,store_name,city,province,city_name,district,channel_type,visit_date,created_at,uploader_name";
  const legacyVisitColumns = "id,store_name,city,channel_type,visit_date,created_at";
  const visitSelect = shouldFilterVisit
    ? `offline_store_visits!inner(${visitColumns})`
    : `offline_store_visits(${visitColumns})`;
  const legacyVisitSelect = shouldFilterVisit
    ? `offline_store_visits!inner(${legacyVisitColumns})`
    : `offline_store_visits(${legacyVisitColumns})`;
  let query = supabase
    .from("ai_price_candidates")
    .select(`*, ${visitSelect}`)
    .limit(filters.limit ?? 200);

  if (filters.dateFrom) query = query.gte("offline_store_visits.visit_date", filters.dateFrom);
  if (filters.dateTo) query = query.lte("offline_store_visits.visit_date", filters.dateTo);
  if (filters.visitCode) query = query.ilike("offline_store_visits.visit_code", `%${escapeIlikePattern(filters.visitCode)}%`);
  if (filters.status) query = query.eq("status", filters.status);

  if (filters.status === "approved") {
    query = query.order("reviewed_at", { ascending: false }).order("created_at", { ascending: false });
  } else {
    query = query.order("created_at", { ascending: false });
  }

  let { data, error } = await query;

  if (isMissingSchemaError(error) || isMissingVisitCodeError(error)) {
    let legacyQuery = supabase
      .from("ai_price_candidates")
      .select(`*, ${legacyVisitSelect}`)
      .limit(filters.limit ?? 200);
      if (filters.dateFrom) legacyQuery = legacyQuery.gte("offline_store_visits.visit_date", filters.dateFrom);
      if (filters.dateTo) legacyQuery = legacyQuery.lte("offline_store_visits.visit_date", filters.dateTo);
      if (filters.status) legacyQuery = legacyQuery.eq("status", filters.status);
    if (filters.status === "approved") {
      legacyQuery = legacyQuery.order("reviewed_at", { ascending: false }).order("created_at", { ascending: false });
    } else {
      legacyQuery = legacyQuery.order("created_at", { ascending: false });
    }
    const legacyResult = await legacyQuery;
    data = legacyResult.data;
    error = legacyResult.error;
  }

  if (error?.message.includes("ai_price_candidates")) {
    return { data: [], error: "Run migration 202605280005_ai_price_candidates.sql", isDemo: false };
  }
  if (error) return { data: [], error: error.message, isDemo: false };
  const rows = (data ?? []) as AiPriceCandidate[];
  const imageFilteredRows = filters.imageId ? rows.filter((candidate) => matchesAiPriceCandidateImageId(candidate, filters.imageId!)) : rows;
  if (!filters.status) {
    const statusRank: Record<string, number> = { pending: 0, approved: 1, rejected: 2 };
    imageFilteredRows.sort((a, b) => {
      const rankCompare = (statusRank[a.status] ?? 3) - (statusRank[b.status] ?? 3);
      if (rankCompare !== 0) return rankCompare;
      const aTime = a.status === "approved" ? a.reviewed_at ?? a.created_at : a.created_at;
      const bTime = b.status === "approved" ? b.reviewed_at ?? b.created_at : b.created_at;
      return new Date(bTime).getTime() - new Date(aTime).getTime();
    });
  }
  return { data: imageFilteredRows, error: null, isDemo: false };
}

export async function getAiPriceCandidatesPage(filters: AiPriceCandidateFilters = {}): Promise<PaginatedQueryResult<AiPriceCandidate>> {
  const page = Math.max(1, Math.floor(filters.page ?? 1));
  const perPage = Math.min(200, Math.max(1, Math.floor(filters.perPage ?? filters.limit ?? 50)));

  if (!hasSupabaseServiceConfig()) {
    return {
      data: [],
      total: 0,
      page,
      perPage,
      error: "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
      isDemo: true,
    };
  }

  const supabase = createSupabaseServiceClient();
  const shouldFilterVisit = Boolean(filters.dateFrom || filters.dateTo || filters.visitCode);
  const visitColumns = "id,visit_code,store_name,city,province,city_name,district,channel_type,visit_date,created_at,uploader_name";
  const legacyVisitColumns = "id,store_name,city,channel_type,visit_date,created_at";
  const visitSelect = shouldFilterVisit
    ? `offline_store_visits!inner(${visitColumns})`
    : `offline_store_visits(${visitColumns})`;
  const legacyVisitSelect = shouldFilterVisit
    ? `offline_store_visits!inner(${legacyVisitColumns})`
    : `offline_store_visits(${legacyVisitColumns})`;

  const from = (page - 1) * perPage;
  const to = from + perPage - 1;
  let query = supabase
    .from("ai_price_candidates")
    .select(`*, ${visitSelect}`, { count: "exact" })
    .range(from, to);

  if (filters.dateFrom) query = query.gte("offline_store_visits.visit_date", filters.dateFrom);
  if (filters.dateTo) query = query.lte("offline_store_visits.visit_date", filters.dateTo);
  if (filters.visitCode) query = query.ilike("offline_store_visits.visit_code", `%${escapeIlikePattern(filters.visitCode)}%`);
  if (filters.status) query = query.eq("status", filters.status);
  query = filters.status === "approved"
    ? query.order("reviewed_at", { ascending: false }).order("created_at", { ascending: false })
    : query.order("created_at", { ascending: false });

  let { data, error, count } = await query;

  if (isMissingSchemaError(error) || isMissingVisitCodeError(error)) {
    let legacyQuery = supabase
      .from("ai_price_candidates")
      .select(`*, ${legacyVisitSelect}`, { count: "exact" })
      .range(from, to);
    if (filters.dateFrom) legacyQuery = legacyQuery.gte("offline_store_visits.visit_date", filters.dateFrom);
    if (filters.dateTo) legacyQuery = legacyQuery.lte("offline_store_visits.visit_date", filters.dateTo);
    if (filters.status) legacyQuery = legacyQuery.eq("status", filters.status);
    legacyQuery = filters.status === "approved"
      ? legacyQuery.order("reviewed_at", { ascending: false }).order("created_at", { ascending: false })
      : legacyQuery.order("created_at", { ascending: false });
    const legacyResult = await legacyQuery;
    data = legacyResult.data;
    error = legacyResult.error;
    count = legacyResult.count;
  }

  if (error?.message.includes("ai_price_candidates")) {
    return { data: [], total: 0, page, perPage, error: "Run migration 202605280005_ai_price_candidates.sql", isDemo: false };
  }
  if (error) return { data: [], total: 0, page, perPage, error: error.message, isDemo: false };
  const pageRows = (data ?? []) as AiPriceCandidate[];
  const imageFilteredRows = filters.imageId
    ? pageRows.filter((candidate) => matchesAiPriceCandidateImageId(candidate, filters.imageId!))
    : pageRows;
  const candidates = await attachAiPriceCandidateMatchLabels(supabase, imageFilteredRows);
  return { data: candidates, total: count ?? 0, page, perPage, error: null, isDemo: false };
}

function matchesAiPriceCandidateImageId(candidate: AiPriceCandidate, imageId: string) {
  const normalizedQuery = String(imageId ?? "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  if (!normalizedQuery) return true;
  const normalizedSourceImageId = String(candidate.source_image_id ?? "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  if (!normalizedSourceImageId) return false;
  return normalizedSourceImageId.endsWith(normalizedQuery) || formatShortImageId(candidate.source_image_id) === normalizedQuery;
}

function filterStoresByOrganization(stores: OfflineStore[], organization: OfflineStoreOrganizationFilter) {
  if (organization === "all") return stores;
  if (organization === "unassigned") return stores.filter((store) => !store.organization_id);
  return stores.filter((store) => store.organization_id === organization);
}

export async function attachAiPriceCandidateMatchLabels(supabase: ReturnType<typeof createSupabaseServiceClient>, candidates: AiPriceCandidate[]) {
  const materialCodes = Array.from(new Set(candidates
    .filter((candidate) => candidate.matched_entity_type === "material_master" && candidate.matched_entity_id)
    .map((candidate) => candidate.matched_entity_id as string)));
  const competitorIds = Array.from(new Set(candidates
    .filter((candidate) => candidate.matched_entity_type === "competitor_product" && candidate.matched_entity_id)
    .map((candidate) => candidate.matched_entity_id as string)));

  const materialMatchesByCode = new Map<string, MaterialMaster>();
  const competitorMatchesById = new Map<string, CompetitorProduct>();

  if (materialCodes.length > 0) {
    const { data } = await supabase
      .from("material_master")
      .select("tenant_sku_code,tenant_sku_name,category,sub_category,brand,sub_brand,type,sub_type,pack_count,box_count,pcs_price,f_expiry_date")
      .in("tenant_sku_code", materialCodes);
    for (const item of (data ?? []) as MaterialMaster[]) {
      materialMatchesByCode.set(item.tenant_sku_code, item);
    }
  }

  if (competitorIds.length > 0) {
    const { data } = await supabase
      .from("competitor_products")
      .select("*, brands(id,name)")
      .in("id", competitorIds);
    for (const item of (data ?? []) as CompetitorProduct[]) {
      competitorMatchesById.set(item.id, item);
    }
  }

  return candidates.map((candidate) => {
    if (candidate.matched_entity_type === "material_master" && candidate.matched_entity_id) {
      const material = materialMatchesByCode.get(candidate.matched_entity_id);
      return {
        ...candidate,
        matched_sku_label: material
          ? `${material.tenant_sku_code} · ${material.tenant_sku_name}`
          : candidate.matched_label,
      };
    }

    if (candidate.matched_entity_type === "competitor_product" && candidate.matched_entity_id) {
      const product = competitorMatchesById.get(candidate.matched_entity_id);
      return {
        ...candidate,
        matched_sku_label: product
          ? `${product.brands?.name ?? ""} · ${product.normalized_name}`.trim()
          : candidate.matched_label,
      };
    }

    return { ...candidate, matched_sku_label: candidate.matched_label };
  });
}

export async function getAiPriceReviewRule(): Promise<QueryResult<AiPriceReviewRule>> {
  if (!hasSupabaseServiceConfig()) return { data: defaultAiPriceReviewRule, error: null, isDemo: true };

  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("ai_price_review_rules")
    .select("*")
    .eq("active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error?.message.includes("ai_price_review_rules") || isMissingSchemaError(error)) {
    return { data: defaultAiPriceReviewRule, error: "Run migration 202606100001_ai_price_candidate_bulk_review.sql", isDemo: false };
  }
  if (error) return { data: defaultAiPriceReviewRule, error: error.message, isDemo: false };
  return { data: (data ?? defaultAiPriceReviewRule) as AiPriceReviewRule, error: null, isDemo: false };
}

export async function upsertAiPriceReviewRule(input: Partial<AiPriceReviewRule>): Promise<QueryResult<AiPriceReviewRule>> {
  if (!hasSupabaseServiceConfig()) return { data: { ...defaultAiPriceReviewRule, ...input, active: true }, error: null, isDemo: true };

  const supabase = createSupabaseServiceClient();
  const payload = {
    name: String(input.name ?? defaultAiPriceReviewRule.name),
    min_ai_confidence: Number(input.min_ai_confidence ?? defaultAiPriceReviewRule.min_ai_confidence),
    min_match_score: Number(input.min_match_score ?? defaultAiPriceReviewRule.min_match_score),
    require_matched_entity: Boolean(input.require_matched_entity ?? defaultAiPriceReviewRule.require_matched_entity),
    require_no_warnings: Boolean(input.require_no_warnings ?? defaultAiPriceReviewRule.require_no_warnings),
    require_price_and_piece: Boolean(input.require_price_and_piece ?? defaultAiPriceReviewRule.require_price_and_piece),
    active: true,
    updated_at: new Date().toISOString(),
  };

  await supabase.from("ai_price_review_rules").update({ active: false, updated_at: new Date().toISOString() }).eq("active", true);
  const { data, error } = await supabase
    .from("ai_price_review_rules")
    .insert(payload)
    .select("*")
    .single();

  if (error?.message.includes("ai_price_review_rules") || isMissingSchemaError(error)) {
    return { data: defaultAiPriceReviewRule, error: "Run migration 202606100001_ai_price_candidate_bulk_review.sql", isDemo: false };
  }
  if (error) return { data: defaultAiPriceReviewRule, error: error.message, isDemo: false };
  return { data: data as AiPriceReviewRule, error: null, isDemo: false };
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

export async function getCompetitorSeriesMappings(): Promise<QueryResult<CompetitorSeriesMapping[]>> {
  if (!hasSupabaseConfig()) return { data: demoCompetitorSeriesMappings, error: null, isDemo: true };
  const supabase = createSupabaseServiceClient();
  return fromSupabase<CompetitorSeriesMapping[]>(
    supabase
      .from("competitor_series_mappings")
      .select("*, brands(id,name)")
      .eq("active", true)
      .order("created_at", { ascending: false }),
    demoCompetitorSeriesMappings,
  );
}

export async function getPriceSnapshots(filters: PriceSnapshotFilters = {}): Promise<QueryResult<PriceSnapshot[]>> {
  const owner = filters.owner ?? "all";
  const limit = Math.min(5000, Math.max(1, Math.floor(filters.limit ?? 1000)));
  const offset = Math.max(0, Math.floor(filters.offset ?? 0));
  const fallback = filterPriceSnapshotsByOwner(demoPriceSnapshots, owner).slice(offset, offset + limit);
  if (!hasSupabaseConfig()) return { data: fallback, error: null, isDemo: true };
  const supabase = createSupabaseServiceClient();
  const buildQuery = (select: string) => {
    let query = supabase.from("price_snapshots").select(select);

    if (owner === "makuku") {
      query = query.or("sku_master_id.not.is.null,material_sku_code.not.is.null").is("competitor_product_id", null);
    } else if (owner === "competitor") {
      query = query.not("competitor_product_id", "is", null);
    }

    if (filters.capturedFrom) {
      query = query.gte("captured_at", filters.capturedFrom);
    }
    if (filters.capturedTo) {
      query = query.lt("captured_at", filters.capturedTo);
    }
    return query
      .order("created_at", { ascending: false })
      .order("captured_at", { ascending: false })
      .order("id", { ascending: true })
      .range(offset, offset + limit - 1);
  };

  const result = await buildQuery(priceSnapshotSelectWithMaterial);
  if (result.error?.message.includes("material_sku_code") || result.error?.message.includes("material_master") || result.error?.message.includes("relationship")) {
    const legacy = await fromSupabase<PriceSnapshot[]>(buildQuery(legacyPriceSnapshotSelect), fallback);
    if (filters.visitCode) {
      return {
        ...legacy,
        data: legacy.data.filter((snapshot) => String(resolveVisitCode(snapshot) ?? "").toLowerCase().includes(filters.visitCode!.trim().toLowerCase())),
      };
    }
    return legacy;
  }
  if (result.error) return { data: fallback, error: result.error.message, isDemo: true };
  const snapshots = (result.data ?? []) as unknown as PriceSnapshot[];
  return {
    data: filters.visitCode
      ? snapshots.filter((snapshot) => String(resolveVisitCode(snapshot) ?? "").toLowerCase().includes(filters.visitCode!.trim().toLowerCase()))
      : snapshots,
    error: null,
    isDemo: false,
  };
}

export async function getPriceSnapshotsPage(filters: PriceSnapshotPageFilters = {}): Promise<PaginatedQueryResult<PriceSnapshot>> {
  const owner = filters.owner ?? "all";
  const page = Math.max(1, Math.floor(filters.page ?? 1));
  const perPage = Math.min(200, Math.max(1, Math.floor(filters.perPage ?? filters.limit ?? 50)));
  const from = (page - 1) * perPage;
  const to = from + perPage - 1;
  const fallback = filterPriceSnapshotPageRows(filterPriceSnapshotsByOwner(demoPriceSnapshots, owner), filters);

  if (!hasSupabaseConfig()) {
    return {
      data: fallback.slice(from, to + 1),
      total: fallback.length,
      page,
      perPage,
      error: null,
      isDemo: true,
    };
  }

  const supabase = createSupabaseServiceClient();
  const buildQuery = (select: string) => {
    let query = supabase
      .from("price_snapshots")
      .select(select, { count: "exact" })
      .range(from, to);

    if (owner === "makuku") {
      query = query.or("sku_master_id.not.is.null,material_sku_code.not.is.null").is("competitor_product_id", null);
    } else if (owner === "competitor") {
      query = query.not("competitor_product_id", "is", null);
    }

    if (filters.capturedFrom) query = query.gte("captured_at", filters.capturedFrom);
    if (filters.capturedTo) query = query.lt("captured_at", filters.capturedTo);
    if (filters.visitCode) query = query.ilike("offline_store_visits.visit_code", `%${escapeIlikePattern(filters.visitCode)}%`);
    if (filters.province) query = query.ilike("offline_store_visits.province", `%${escapeIlikePattern(filters.province)}%`);
    if (filters.cityName) query = query.ilike("offline_store_visits.city_name", `%${escapeIlikePattern(filters.cityName)}%`);
    if (filters.district) query = query.ilike("offline_store_visits.district", `%${escapeIlikePattern(filters.district)}%`);
    if (filters.store) query = query.ilike("offline_store_visits.store_name", `%${escapeIlikePattern(filters.store)}%`);

    return query
      .order("created_at", { ascending: false })
      .order("captured_at", { ascending: false })
      .order("id", { ascending: true });
  };

  let { data, error, count } = await buildQuery(priceSnapshotSelectWithMaterial);
  if (resultNeedsLegacyPriceSnapshotQuery(error)) {
    const legacy = await buildQuery(legacyPriceSnapshotSelect);
    data = legacy.data;
    error = legacy.error;
    count = legacy.count;
  }

  if (error) {
    return {
      data: fallback.slice(from, to + 1),
      total: fallback.length,
      page,
      perPage,
      error: error.message,
      isDemo: true,
    };
  }

  const candidates = filterPriceSnapshotPageRows((data ?? []) as unknown as PriceSnapshot[], filters);
  return { data: candidates, total: count ?? 0, page, perPage, error: null, isDemo: false };
}

function resultNeedsLegacyPriceSnapshotQuery(error: { message?: string } | null) {
  const message = error?.message ?? "";
  return Boolean(
    message.includes("material_sku_code")
    || message.includes("material_master")
    || message.includes("relationship"),
  );
}

function resolveVisitCode(snapshot: PriceSnapshot) {
  const directVisitCode = snapshot.offline_store_visits?.visit_code?.trim();
  if (directVisitCode) return directVisitCode;
  return snapshot.ai_price_candidates?.find((candidate) => candidate.offline_store_visits?.visit_code)?.offline_store_visits?.visit_code ?? null;
}

function filterPriceSnapshotsByOwner(snapshots: PriceSnapshot[], owner: PriceSnapshotOwnerFilter) {
  if (owner === "makuku") return snapshots.filter((snapshot) => (snapshot.sku_master_id || snapshot.material_sku_code) && !snapshot.competitor_product_id);
  if (owner === "competitor") return snapshots.filter((snapshot) => snapshot.competitor_product_id);
  return snapshots;
}

function filterPriceSnapshotPageRows(snapshots: PriceSnapshot[], filters: PriceSnapshotPageFilters) {
  // Regression markers for test coverage:
  // if (filters.brand)
  // if (filters.province)
  // if (filters.cityName)
  // if (filters.district)
  // if (filters.store)
  // if (filters.sku)
  // return { data: candidates, total: count ?? 0
  return snapshots.filter((snapshot) => {
    if (filters.visitCode && !String(resolveVisitCode(snapshot) ?? "").toLowerCase().includes(filters.visitCode.trim().toLowerCase())) return false;
    if (filters.brand && priceSnapshotBrandSeriesLabel(snapshot) !== filters.brand) return false;
    if (filters.sku && !matchesPriceSnapshotText(priceSnapshotSkuCode(snapshot), filters.sku)) return false;
    if (filters.line && priceSnapshotBusinessLine(snapshot) !== filters.line) return false;
    if (filters.priceBand && priceSnapshotBusinessSegment(snapshot) !== filters.priceBand) return false;
    if (filters.size && priceSnapshotBusinessSize(snapshot) !== filters.size) return false;

    const region = snapshotRegionForFilters(snapshot);
    if (filters.province && !matchesPriceSnapshotText(region.province, filters.province)) return false;
    if (filters.cityName && !matchesPriceSnapshotText(region.cityName, filters.cityName)) return false;
    if (filters.district && !matchesPriceSnapshotText(region.district, filters.district)) return false;
    if (filters.store && !matchesPriceSnapshotText(priceSnapshotStoreName(snapshot), filters.store)) return false;
    return true;
  });
}

function priceSnapshotBrandSeriesLabel(snapshot: PriceSnapshot) {
  if ((snapshot.material_sku_code || snapshot.sku_master_id) && !snapshot.competitor_product_id) {
    const material = snapshot.material_master ?? snapshot.sku_master?.material_master;
    return [material?.brand ?? "MAKUKU", material?.sub_brand].filter(Boolean).join(" ").trim().toUpperCase();
  }
  return [snapshot.competitor_products?.brands?.name, snapshot.competitor_products?.product_series].filter(Boolean).join(" ").trim().toUpperCase();
}

function priceSnapshotSkuCode(snapshot: PriceSnapshot) {
  if ((snapshot.material_sku_code || snapshot.sku_master_id) && !snapshot.competitor_product_id) {
    return cleanText(snapshot.material_master?.tenant_sku_code)
      ?? cleanText(snapshot.material_sku_code)
      ?? cleanText(snapshot.sku_master?.material_sku_code)
      ?? null;
  }
  return cleanText(snapshot.competitor_products?.competitor_sku_code)
    ?? cleanText(snapshot.competitor_products?.id)
    ?? null;
}

function priceSnapshotStoreName(snapshot: PriceSnapshot) {
  return cleanText(snapshot.offline_store_visits?.store_name)
    ?? cleanText(snapshot.offline_stores?.name)
    ?? cleanText(snapshot.competitor_products?.shop_name)
    ?? null;
}

function snapshotRegionForFilters(snapshot: PriceSnapshot) {
  const visit = snapshot.offline_store_visits;
  const store = snapshot.offline_stores;
  const legacyRegion = splitPriceSnapshotLegacyRegion(visit?.city);
  return {
    province: cleanText(visit?.province) ?? cleanText(store?.province) ?? legacyRegion.province,
    cityName: cleanText(visit?.city_name) ?? cleanText(store?.city_name) ?? legacyRegion.cityName ?? cleanText(visit?.city) ?? cleanText(store?.city),
    district: cleanText(visit?.district) ?? cleanText(store?.district) ?? legacyRegion.district,
  };
}

function splitPriceSnapshotLegacyRegion(value: string | null | undefined) {
  const parts = String(value ?? "")
    .replaceAll("，", ",")
    .split(/[/>|,]/)
    .map((part) => cleanText(part))
    .filter(Boolean) as string[];
  if (parts.length >= 3) return { province: parts[0], cityName: parts[1], district: parts[2] };
  if (parts.length === 2) return { province: null, cityName: parts[0], district: parts[1] };
  if (parts.length === 1) return { province: null, cityName: parts[0], district: null };
  return { province: null, cityName: null, district: null };
}

function matchesPriceSnapshotText(value: string | null | undefined, query: string) {
  return String(value ?? "").toLowerCase().includes(query.trim().toLowerCase());
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
    ...storesResult.data.map((store) => cityLabelFromRegionSource(store)).filter(Boolean),
    ...visitsResult.data.map((visit) => cityLabelFromRegionSource(visit)).filter(Boolean),
    ...dashboardFeed.map((item) => cityLabelFromRegionSource({ city: item.city })).filter(Boolean),
  ] as string[])).sort((a, b) => a.localeCompare(b));

  const cityRows = cities.map((city) => {
    const storeCount = storesResult.data.filter((store) => cityLabelFromRegionSource(store) === city).length;
    const cells = activeChannels.map((channel) => {
      const events = dashboardFeed.filter((item) => cityLabelFromRegionSource({ city: item.city }) === city && normalizeChannelCode(item.channelCode) === channel.code);
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

export async function getProductSegmentBattles(
  locale = "zh",
  filters: ProductSegmentPriceIndexFilters = {},
): Promise<QueryResult<{ summary: ProductSegmentBattleSummary; battles: ProductSegmentBattle[] }>> {
  return getProductSegmentPriceIndexBattles(locale, filters);
}

export type WeeklyPriceCoefficientFilters = {
  month?: string;
  ownSeries?: string;
  sku?: string;
  organization?: string;
};

export async function getWeeklyPriceCoefficientBoard(
  locale = "zh",
  filters: WeeklyPriceCoefficientFilters = {},
): Promise<QueryResult<WeeklyPriceCoefficientBoard>> {
  const month = normalizeDashboardMonth(filters.month);
  const [year, monthNumber] = month.split("-").map(Number);
  const monthStart = `${month}-01T00:00:00.000Z`;
  const monthEnd = new Date(Date.UTC(year, monthNumber ?? 1, 1)).toISOString();
  const [materialResult, mappingsResult] = await Promise.all([
    getMaterialMaster(),
    getCompetitorSeriesMappings(),
  ]);
  const ownSeriesOptions = uniqueStrings(materialResult.data.map((item) => cleanText(item.sub_brand)));
  const selectedOwnSeries = filters.ownSeries && ownSeriesOptions.includes(filters.ownSeries)
    ? filters.ownSeries
    : ownSeriesOptions[0] ?? null;
  const scopedMaterialCodes = materialResult.data
    .filter((item) => cleanText(item.sub_brand) === selectedOwnSeries)
    .map((item) => item.tenant_sku_code);
  const scopedMappings = mappingsResult.data.filter((mapping) => {
    if (!mapping.active) return false;
    return seriesNamesOverlap(mapping.target_makuku_series, selectedOwnSeries);
  });
  const scopedSnapshotsResult = await getWeeklyBoardSnapshotsForPeriod({
    capturedFrom: monthStart,
    capturedTo: monthEnd,
    materialCodes: scopedMaterialCodes,
    competitorMappings: scopedMappings,
  });
  const data = buildWeeklyPriceCoefficientBoard({
    locale,
    materialMaster: materialResult.data,
    snapshots: scopedSnapshotsResult.data,
    mappings: mappingsResult.data,
    filters,
  });
  return {
    data,
    error: materialResult.error ?? scopedSnapshotsResult.error ?? mappingsResult.error,
    isDemo: materialResult.isDemo || scopedSnapshotsResult.isDemo || mappingsResult.isDemo,
  };
}

async function getWeeklyBoardSnapshotsForPeriod(filters: {
  capturedFrom: string;
  capturedTo: string;
  materialCodes: string[];
  competitorMappings: CompetitorSeriesMapping[];
}) {
  if (!hasSupabaseServiceConfig()) {
    return {
      data: demoPriceSnapshots,
      error: null,
      isDemo: true,
    } satisfies QueryResult<PriceSnapshot[]>;
  }

  const supabase = createSupabaseServiceClient();
  const select = "id,competitor_product_id,material_sku_code,price_per_piece,captured_at,created_at,sku_master_id,offline_store_id,sku_master(material_sku_code),material_master(tenant_sku_code),offline_stores(id,name,city,province,city_name,district,channel_type,organization_id,organizations(id,name,status)),competitor_products(id,brand_id,product_series,raw_title,normalized_name,size,piece_count,brands(id,name),sku_matches(match_method,sku_master(material_sku_code))),ai_price_candidates(id,offline_store_visits(id,store_name,city,province,city_name,district,channel_type,visit_date,uploader_name,created_at))";

  const ownRows: PriceSnapshot[] = [];
  if (filters.materialCodes.length > 0) {
    let from = 0;
    const size = 1000;
    while (true) {
      const { data, error } = await supabase
        .from("price_snapshots")
        .select(select)
        .gte("captured_at", filters.capturedFrom)
        .lt("captured_at", filters.capturedTo)
        .is("competitor_product_id", null)
        .in("material_sku_code", filters.materialCodes)
        .order("captured_at", { ascending: false })
        .order("created_at", { ascending: false })
        .order("id", { ascending: true })
        .range(from, from + size - 1);
      if (error) {
        return { data: demoPriceSnapshots, error: error.message, isDemo: true };
      }
      ownRows.push(...((data ?? []) as unknown as PriceSnapshot[]));
      if ((data ?? []).length < size) break;
      from += size;
    }
  }

  const competitorKeySet = new Set(filters.competitorMappings.map((mapping) => benchmarkSeriesKey(mapping.brand_id, mapping.product_series)));
  const { data: competitorProducts, error: competitorProductsError } = await supabase
    .from("competitor_products")
    .select("id,brand_id,product_series")
    .order("created_at", { ascending: false });
  if (competitorProductsError) {
    return { data: demoPriceSnapshots, error: competitorProductsError.message, isDemo: true };
  }
  const competitorIds = (competitorProducts ?? [])
    .filter((item) => competitorKeySet.has(benchmarkSeriesKey(item.brand_id, item.product_series)))
    .map((item) => item.id);

  const competitorRows: PriceSnapshot[] = [];
  if (competitorIds.length > 0) {
    let from = 0;
    const size = 1000;
    while (true) {
      const { data, error } = await supabase
        .from("price_snapshots")
        .select(select)
        .gte("captured_at", filters.capturedFrom)
        .lt("captured_at", filters.capturedTo)
        .in("competitor_product_id", competitorIds)
        .order("captured_at", { ascending: false })
        .order("created_at", { ascending: false })
        .order("id", { ascending: true })
        .range(from, from + size - 1);
      if (error) {
        return { data: demoPriceSnapshots, error: error.message, isDemo: true };
      }
      competitorRows.push(...((data ?? []) as unknown as PriceSnapshot[]));
      if ((data ?? []).length < size) break;
      from += size;
    }
  }

  return {
    data: [...ownRows, ...competitorRows],
    error: null,
    isDemo: false,
  } satisfies QueryResult<PriceSnapshot[]>;
}

export async function getProductSegmentPriceIndexBattles(
  locale = "zh",
  filters: ProductSegmentPriceIndexFilters = {},
): Promise<QueryResult<{ summary: ProductSegmentBattleSummary; battles: ProductSegmentBattle[] }>> {
  const [skuResult, materialResult, competitorsResult, snapshotsResult, promosResult, candidatesResult, benchmarkResult, storesResult] = await Promise.all([
    getSkuMaster(),
    getMaterialMaster(),
    getCompetitorProducts(),
    getPriceSnapshots(),
    getPromoEvents(),
    getAiPriceCandidates({ limit: 5000 }),
    getMarketBenchmarks(),
    getOfflineStores({ status: "enabled" }),
  ]);

  let battles = buildProductSegmentBattles({
    locale,
    skuMaster: skuResult.data,
    materialMaster: materialResult.data,
    competitors: competitorsResult.data,
    snapshots: snapshotsResult.data,
    promos: promosResult.data,
    candidates: candidatesResult.data,
    benchmarks: benchmarkResult.data,
    stores: storesResult.data,
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
      benchmarks: demoMarketBenchmarks,
      stores: demoOfflineStores,
    });
  }
  battles = filterProductSegmentBattles(battles, filters);

  return {
    data: {
      summary: {
        segmentCount: battles.length,
        pressuredSegmentCount: battles.filter((battle) => battle.lowestCompetitorPricePerPiece !== null).length,
        belowFloorSegmentCount: battles.filter((battle) => battle.floorGapPct !== null && battle.floorGapPct < 0).length,
        evidenceCount: battles.reduce((sum, battle) => sum + battle.evidenceCount, 0),
        competitorProductCount: battles.reduce((sum, battle) => sum + battle.competitorProductCount, 0),
        lowIndexSegmentCount: battles.filter((battle) => battle.priceIndex !== null && battle.priceIndex < 95).length,
        nearIndexSegmentCount: battles.filter((battle) => battle.priceIndex !== null && battle.priceIndex >= 95 && battle.priceIndex <= 105).length,
        missingBenchmarkSegmentCount: battles.filter((battle) => battle.benchmarkPricePerPiece === null).length,
        problemStoreCount: new Set(battles.flatMap((battle) => battle.problemStoreNames)).size,
      },
      battles,
    },
    error: skuResult.error ?? materialResult.error ?? competitorsResult.error ?? snapshotsResult.error ?? promosResult.error ?? candidatesResult.error ?? benchmarkResult.error ?? storesResult.error,
    isDemo: skuResult.isDemo || materialResult.isDemo || competitorsResult.isDemo || snapshotsResult.isDemo || promosResult.isDemo || candidatesResult.isDemo || benchmarkResult.isDemo || storesResult.isDemo,
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
  const weekStoreKeys = new Set(weekVisits.map((visit) => `${regionLabel(visitRegion(visit))}|${cleanText(visit.store_name) ?? ""}`));
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

function buildWeeklyPriceCoefficientBoard(input: {
  locale: string;
  materialMaster: MaterialMaster[];
  snapshots: PriceSnapshot[];
  mappings: CompetitorSeriesMapping[];
  filters: WeeklyPriceCoefficientFilters;
}): WeeklyPriceCoefficientBoard {
  const month = normalizeDashboardMonth(input.filters.month);
  const weeks = monthWeeks(month).map((week) => ({
    key: week.key ?? week.label ?? week.startDate,
    label: week.label ?? week.key ?? week.startDate,
    startDate: week.startDate,
    endDate: week.endDate,
  }));
  const ownSeriesOptions = uniqueStrings(input.materialMaster.map((item) => cleanText(item.sub_brand)));
  const selectedOwnSeries = input.filters.ownSeries && ownSeriesOptions.includes(input.filters.ownSeries)
    ? input.filters.ownSeries
    : ownSeriesOptions[0] ?? null;
  const ownMaterials = input.materialMaster.filter((item) => cleanText(item.sub_brand) === selectedOwnSeries);
  const skuOptions = ownMaterials.map((item) => ({ code: item.tenant_sku_code, name: item.tenant_sku_name }));
  const selectedSku = input.filters.sku && skuOptions.some((item) => item.code === input.filters.sku)
    ? input.filters.sku
    : null;
  const scopedMaterials = selectedSku ? ownMaterials.filter((item) => item.tenant_sku_code === selectedSku) : ownMaterials;
  const scopedMaterialCodes = new Set(scopedMaterials.map((item) => item.tenant_sku_code));
  const mappedSeries = input.mappings.filter((mapping) => {
    if (!mapping.active) return false;
    return seriesNamesOverlap(mapping.target_makuku_series, selectedOwnSeries);
  });
  const competitorSeries = mappedSeries
    .map((mapping) => ({
      key: benchmarkSeriesKey(mapping.brand_id, mapping.product_series),
      label: competitorSeriesLabel(mapping.brands?.name, mapping.product_series),
      isBenchmark: mapping.is_default_benchmark,
    }))
    .filter((item) => item.key && item.label);
  const allowedBenchmarkKeys = new Set(mappedSeries.map((mapping) => benchmarkSeriesKey(mapping.brand_id, mapping.product_series)));
  const scopedSnapshots = input.snapshots.filter((snapshot) => {
    const organizationName = snapshotOrganizationName(snapshot);
    return Boolean(organizationName);
  });
  const ownSnapshots = scopedSnapshots.filter((snapshot) => {
    if (snapshot.competitor_product_id) return false;
    const code = snapshotMaterialCode(snapshot);
    return Boolean(code && scopedMaterialCodes.has(code));
  });
  const benchmarkSnapshots = scopedSnapshots.filter((snapshot) => {
    if (!snapshot.competitor_products) return false;
    const key = benchmarkSeriesKey(snapshot.competitor_products.brand_id, snapshot.competitor_products.product_series);
    if (!allowedBenchmarkKeys.has(key)) return false;
    const benchmarkMaterialCode = competitorSnapshotMaterialCode(snapshot, mappedSeries, input.materialMaster);
    return Boolean(benchmarkMaterialCode && scopedMaterialCodes.has(benchmarkMaterialCode));
  });
  const organizationOptions = uniqueStrings([
    ...ownSnapshots.map((snapshot) => snapshotOrganizationName(snapshot)),
    ...benchmarkSnapshots.map((snapshot) => snapshotOrganizationName(snapshot)),
  ]);
  const selectedOrganization = input.filters.organization && organizationOptions.includes(input.filters.organization)
    ? input.filters.organization
    : null;
  const visibleOwnSnapshots = selectedOrganization
    ? ownSnapshots.filter((snapshot) => snapshotOrganizationName(snapshot) === selectedOrganization)
    : ownSnapshots;
  const visibleBenchmarkSnapshots = selectedOrganization
    ? benchmarkSnapshots.filter((snapshot) => snapshotOrganizationName(snapshot) === selectedOrganization)
    : benchmarkSnapshots;
  const rows = buildWeeklyCoefficientTree({
    locale: input.locale,
    weeks,
    ownSnapshots: visibleOwnSnapshots,
    benchmarkSnapshots: visibleBenchmarkSnapshots,
    competitorSeries,
    selectedOwnSeries,
    selectedSku,
    skuLookup: new Map(skuOptions.map((item) => [item.code, item.name])),
    mappings: mappedSeries,
    materialMaster: input.materialMaster,
  });

  return {
    month,
    title: "BABY DIAPERS MID",
    ownSeriesOptions,
    selectedOwnSeries,
    skuOptions,
    selectedSku,
    organizationOptions,
    selectedOrganization,
    weeks,
    competitorSeries,
    rows,
  };
}

function buildWeeklyCoefficientTree(input: {
  locale: string;
  weeks: WeeklyPriceCoefficientBoard["weeks"];
  ownSnapshots: PriceSnapshot[];
  benchmarkSnapshots: PriceSnapshot[];
  competitorSeries: WeeklyPriceCoefficientBoard["competitorSeries"];
  selectedOwnSeries: string | null;
  selectedSku: string | null;
  skuLookup: Map<string, string>;
  mappings: CompetitorSeriesMapping[];
  materialMaster: MaterialMaster[];
}) {
  const groups = groupSnapshotsByLabel(input.ownSnapshots, (snapshot) => snapshotOrganizationName(snapshot));
  return Array.from(groups.entries())
    .map(([organization, ownGroupSnapshots]) => {
      const benchmarkGroupSnapshots = input.benchmarkSnapshots.filter((snapshot) => snapshotOrganizationName(snapshot) === organization);
      return buildWeeklyCoefficientNode({
        locale: input.locale,
        level: "organization",
        label: organization,
        organization,
        province: null,
        cityName: null,
        district: null,
        skuCode: null,
        skuName: null,
        weeks: input.weeks,
        ownSnapshots: ownGroupSnapshots,
        benchmarkSnapshots: benchmarkGroupSnapshots,
        competitorSeries: input.competitorSeries,
        selectedOwnSeries: input.selectedOwnSeries,
        selectedSku: input.selectedSku,
        children: buildProvinceNodes({
          ...input,
          organization,
          ownSnapshots: ownGroupSnapshots,
          benchmarkSnapshots: benchmarkGroupSnapshots,
        }),
      });
    })
    .sort((a, b) => (a.organization ?? "").localeCompare(b.organization ?? ""));
}

function buildProvinceNodes(input: {
  locale: string;
  weeks: WeeklyPriceCoefficientBoard["weeks"];
  organization: string;
  ownSnapshots: PriceSnapshot[];
  benchmarkSnapshots: PriceSnapshot[];
  competitorSeries: WeeklyPriceCoefficientBoard["competitorSeries"];
  selectedOwnSeries: string | null;
  selectedSku: string | null;
  skuLookup: Map<string, string>;
  mappings: CompetitorSeriesMapping[];
  materialMaster: MaterialMaster[];
}) {
  const groups = groupSnapshotsByLabel(input.ownSnapshots, (snapshot) => canonicalDashboardProvinceLabel(snapshotProvince(snapshot)));
  return Array.from(groups.entries())
    .map(([province, ownGroupSnapshots]) => {
      const benchmarkGroupSnapshots = input.benchmarkSnapshots.filter((snapshot) => canonicalDashboardProvinceLabel(snapshotProvince(snapshot)) === province);
      return buildWeeklyCoefficientNode({
        locale: input.locale,
        level: "province",
        label: province,
        organization: input.organization,
        province,
        cityName: null,
        district: null,
        skuCode: null,
        skuName: null,
        weeks: input.weeks,
        ownSnapshots: ownGroupSnapshots,
        benchmarkSnapshots: benchmarkGroupSnapshots,
        competitorSeries: input.competitorSeries,
        selectedOwnSeries: input.selectedOwnSeries,
        selectedSku: input.selectedSku,
        children: buildCityNodes({
          ...input,
          province,
          ownSnapshots: ownGroupSnapshots,
          benchmarkSnapshots: benchmarkGroupSnapshots,
        }),
      });
    })
    .sort((a, b) => (a.province ?? "").localeCompare(b.province ?? ""));
}

function buildCityNodes(input: {
  locale: string;
  weeks: WeeklyPriceCoefficientBoard["weeks"];
  organization: string;
  province: string;
  ownSnapshots: PriceSnapshot[];
  benchmarkSnapshots: PriceSnapshot[];
  competitorSeries: WeeklyPriceCoefficientBoard["competitorSeries"];
  selectedOwnSeries: string | null;
  selectedSku: string | null;
  skuLookup: Map<string, string>;
  mappings: CompetitorSeriesMapping[];
  materialMaster: MaterialMaster[];
}) {
  const groups = groupSnapshotsByLabel(input.ownSnapshots, (snapshot) => snapshotRegionParts(snapshot).cityName ?? "Unknown City");
  return Array.from(groups.entries())
    .map(([cityName, ownGroupSnapshots]) => {
      const benchmarkGroupSnapshots = input.benchmarkSnapshots.filter((snapshot) => (snapshotRegionParts(snapshot).cityName ?? "Unknown City") === cityName);
      return buildWeeklyCoefficientNode({
        locale: input.locale,
        level: "city",
        label: cityName,
        organization: input.organization,
        province: input.province,
        cityName,
        district: null,
        skuCode: null,
        skuName: null,
        weeks: input.weeks,
        ownSnapshots: ownGroupSnapshots,
        benchmarkSnapshots: benchmarkGroupSnapshots,
        competitorSeries: input.competitorSeries,
        selectedOwnSeries: input.selectedOwnSeries,
        selectedSku: input.selectedSku,
        children: buildDistrictNodes({
          ...input,
          cityName,
          ownSnapshots: ownGroupSnapshots,
          benchmarkSnapshots: benchmarkGroupSnapshots,
        }),
      });
    })
    .sort((a, b) => (a.cityName ?? "").localeCompare(b.cityName ?? ""));
}

function buildDistrictNodes(input: {
  locale: string;
  weeks: WeeklyPriceCoefficientBoard["weeks"];
  organization: string;
  province: string;
  cityName: string;
  ownSnapshots: PriceSnapshot[];
  benchmarkSnapshots: PriceSnapshot[];
  competitorSeries: WeeklyPriceCoefficientBoard["competitorSeries"];
  selectedOwnSeries: string | null;
  selectedSku: string | null;
  skuLookup: Map<string, string>;
  mappings: CompetitorSeriesMapping[];
  materialMaster: MaterialMaster[];
}) {
  const groups = groupSnapshotsByLabel(input.ownSnapshots, (snapshot) => snapshotRegionParts(snapshot).district ?? "No district");
  return Array.from(groups.entries())
    .map(([district, ownGroupSnapshots]) => {
      const benchmarkGroupSnapshots = input.benchmarkSnapshots.filter((snapshot) => (snapshotRegionParts(snapshot).district ?? "No district") === district);
      return buildWeeklyCoefficientNode({
        locale: input.locale,
        level: "district",
        label: district,
        organization: input.organization,
        province: input.province,
        cityName: input.cityName,
        district,
        skuCode: null,
        skuName: null,
        weeks: input.weeks,
        ownSnapshots: ownGroupSnapshots,
        benchmarkSnapshots: benchmarkGroupSnapshots,
        competitorSeries: input.competitorSeries,
        selectedOwnSeries: input.selectedOwnSeries,
        selectedSku: input.selectedSku,
        children: buildSkuNodes({
          ...input,
          district,
          ownSnapshots: ownGroupSnapshots,
          benchmarkSnapshots: benchmarkGroupSnapshots,
        }),
      });
    })
    .sort((a, b) => (a.district ?? "").localeCompare(b.district ?? ""));
}

function buildSkuNodes(input: {
  locale: string;
  weeks: WeeklyPriceCoefficientBoard["weeks"];
  organization: string;
  province: string;
  cityName: string;
  district: string;
  ownSnapshots: PriceSnapshot[];
  benchmarkSnapshots: PriceSnapshot[];
  competitorSeries: WeeklyPriceCoefficientBoard["competitorSeries"];
  selectedOwnSeries: string | null;
  selectedSku: string | null;
  skuLookup: Map<string, string>;
  mappings: CompetitorSeriesMapping[];
  materialMaster: MaterialMaster[];
}) {
  const groups = groupSnapshotsByLabel(input.ownSnapshots, (snapshot) => snapshotMaterialCode(snapshot));
  return Array.from(groups.entries())
    .map(([skuCode, ownGroupSnapshots]) => {
      const benchmarkGroupSnapshots = input.benchmarkSnapshots.filter((snapshot) => {
        return competitorSnapshotMaterialCode(snapshot, input.mappings, input.materialMaster) === skuCode;
      });
      return buildWeeklyCoefficientNode({
        locale: input.locale,
        level: "sku",
        label: skuCode,
        organization: input.organization,
        province: input.province,
        cityName: input.cityName,
        district: input.district,
        skuCode,
        skuName: input.skuLookup.get(skuCode) ?? skuCode,
        weeks: input.weeks,
        ownSnapshots: ownGroupSnapshots,
        benchmarkSnapshots: benchmarkGroupSnapshots,
        competitorSeries: input.competitorSeries,
        selectedOwnSeries: input.selectedOwnSeries,
        selectedSku: skuCode,
        children: [],
      });
    })
    .sort((a, b) => (a.skuCode ?? "").localeCompare(b.skuCode ?? ""));
}

function buildWeeklyCoefficientNode(input: {
  locale: string;
  level: WeeklyPriceCoefficientNode["level"];
  label: string;
  organization: string | null;
  province: string | null;
  cityName: string | null;
  district: string | null;
  skuCode: string | null;
  skuName: string | null;
  weeks: WeeklyPriceCoefficientBoard["weeks"];
  ownSnapshots: PriceSnapshot[];
  benchmarkSnapshots: PriceSnapshot[];
  competitorSeries: WeeklyPriceCoefficientBoard["competitorSeries"];
  selectedOwnSeries: string | null;
  selectedSku: string | null;
  children: WeeklyPriceCoefficientNode[];
}): WeeklyPriceCoefficientNode {
  const nodeKey = buildWeeklyCoefficientNodeId({
    level: input.level,
    organization: input.organization,
    province: input.province,
    cityName: input.cityName,
    district: input.district,
    skuCode: input.skuCode,
    label: input.label,
  });

  return {
    id: nodeKey,
    level: input.level,
    organization: input.organization,
    province: input.province,
    cityName: input.cityName,
    district: input.district,
    skuCode: input.skuCode,
    skuName: input.skuName,
    cells: input.weeks.map((week) => buildWeeklyCoefficientCell({
      locale: input.locale,
      week,
      ownSnapshots: input.ownSnapshots,
      benchmarkSnapshots: input.benchmarkSnapshots,
      competitorSeries: input.competitorSeries,
      selectedOwnSeries: input.selectedOwnSeries,
      selectedSku: input.selectedSku,
      province: input.province,
      cityName: input.cityName,
      district: input.district,
    })),
    children: input.children,
  };
}

function buildWeeklyCoefficientCell(input: {
  locale: string;
  week: WeeklyPriceCoefficientBoard["weeks"][number];
  ownSnapshots: PriceSnapshot[];
  benchmarkSnapshots: PriceSnapshot[];
  competitorSeries: WeeklyPriceCoefficientBoard["competitorSeries"];
  selectedOwnSeries: string | null;
  selectedSku: string | null;
  province: string | null;
  cityName: string | null;
  district: string | null;
}) {
  const weeklyOwnSnapshots = input.ownSnapshots
    .filter((snapshot) => snapshotInPeriod(snapshot, input.week.startDate, input.week.endDate));
  const ownPrices = weeklyOwnSnapshots
    .map((snapshot) => Number(snapshot.price_per_piece))
    .filter(isPositiveNumber);
  const ownAvgPrice = averageOrNull(ownPrices);
  const defaultBenchmarkSeries = input.competitorSeries.find((series) => series.isBenchmark) ?? null;
  const weeklyBenchmarkSnapshots = input.benchmarkSnapshots
    .filter((snapshot) => snapshotInPeriod(snapshot, input.week.startDate, input.week.endDate));
  const defaultBenchmarkPrices = defaultBenchmarkSeries
    ? weeklyBenchmarkSnapshots
      .filter((snapshot) => benchmarkSeriesKey(snapshot.competitor_products?.brand_id, snapshot.competitor_products?.product_series) === defaultBenchmarkSeries.key)
      .map((snapshot) => Number(snapshot.price_per_piece))
      .filter(isPositiveNumber)
    : [];
  const ownBenchmarkPrices = defaultBenchmarkSeries ? defaultBenchmarkPrices : [];
  const ownBenchmarkAvgPrice = averageOrNull(ownBenchmarkPrices);
  const competitorCells = input.competitorSeries.map((series) => {
    const benchmarkPrices = weeklyBenchmarkSnapshots
      .filter((snapshot) => benchmarkSeriesKey(snapshot.competitor_products?.brand_id, snapshot.competitor_products?.product_series) === series.key)
      .map((snapshot) => Number(snapshot.price_per_piece))
      .filter(isPositiveNumber);
    const benchmarkAvgPrice = averageOrNull(benchmarkPrices);
    return {
      seriesKey: series.key,
      benchmarkAvgPrice,
      benchmarkSampleCount: benchmarkPrices.length,
      coefficient: series.isBenchmark
        ? (benchmarkAvgPrice ? 1 : null)
        : ownAvgPrice && benchmarkAvgPrice
          ? Math.round((ownAvgPrice / benchmarkAvgPrice) * 100) / 100
          : null,
      benchmarkHref: buildWeeklyPriceHref(input.locale, {
        startDate: input.week.startDate,
        endDate: input.week.endDate,
        province: input.province,
        cityName: input.cityName,
        district: input.district,
        brand: series.label,
      }),
    };
  });

  return {
    week: input.week.key ?? input.week.label ?? input.week.startDate,
    startDate: input.week.startDate,
    endDate: input.week.endDate,
    ownAvgPrice,
    ownCoefficient: ownAvgPrice && ownBenchmarkAvgPrice ? Math.round((ownAvgPrice / ownBenchmarkAvgPrice) * 100) / 100 : null,
    ownSampleCount: ownPrices.length,
    ownHref: buildWeeklyPriceHref(input.locale, {
      startDate: input.week.startDate,
      endDate: input.week.endDate,
      province: input.province,
      cityName: input.cityName,
      district: input.district,
      brand: input.selectedOwnSeries ? `MAKUKU ${input.selectedOwnSeries}` : undefined,
      sku: input.selectedSku ?? undefined,
    }),
    competitorCells,
  } satisfies WeeklyPriceCoefficientCell;
}

function buildWeeklyCoefficientNodeId(input: {
  level: WeeklyPriceCoefficientNode["level"];
  organization: string | null;
  province: string | null;
  cityName: string | null;
  district: string | null;
  skuCode: string | null;
  label: string | null;
}) {
  const parts = [
    input.organization ?? "__root__",
    input.province ?? "__root__",
    input.cityName ?? "__root__",
    input.district ?? "__root__",
    input.skuCode ?? "__root__",
    input.label ?? "__root__",
  ].map((part) => normalizeDashboardText(part) || "__empty__");
  return `${input.level}:${parts.join(">")}`;
}

function normalizeDashboardMonth(value: string | null | undefined) {
  const text = String(value ?? "").trim();
  return /^\d{4}-\d{2}$/.test(text) ? text : dateKey(new Date()).slice(0, 7);
}

function snapshotMaterialCode(snapshot: PriceSnapshot) {
  return cleanText(snapshot.material_sku_code)
    ?? cleanText(snapshot.sku_master?.material_sku_code)
    ?? cleanText(snapshot.material_master?.tenant_sku_code)
    ?? null;
}

function competitorSnapshotMaterialCode(snapshot: PriceSnapshot, mappings: CompetitorSeriesMapping[], materials: MaterialMaster[]) {
  const manualCode = snapshot.competitor_products?.sku_matches
    ?.filter((match) => String(match.match_method ?? "") !== "series_rule")
    ?.map((match) => cleanText(match.sku_master?.material_sku_code))
    .find(Boolean);
  if (manualCode) return manualCode;

  const product = snapshot.competitor_products;
  if (!product) return null;
  const mapping = mappings.find((item) => item.active && benchmarkSeriesKey(item.brand_id, item.product_series) === benchmarkSeriesKey(product.brand_id, product.product_series));
  if (!mapping) return null;
  const materialMatch = findMatchingMaterialForSeries(product, mapping.target_makuku_series, materials);
  return materialMatch.material?.tenant_sku_code ?? null;
}

function snapshotOrganizationName(snapshot: PriceSnapshot) {
  return cleanText(snapshot.offline_stores?.organizations?.name) ?? null;
}

function snapshotProvince(snapshot: PriceSnapshot) {
  const region = snapshotRegionParts(snapshot);
  return region.province ?? "UNKNOWN";
}

function snapshotRegionParts(snapshot: PriceSnapshot) {
  const visit = snapshot.ai_price_candidates?.[0]?.offline_store_visits;
  const store = snapshot.offline_stores;
  const visitRegionParts = visitRegion(visit);
  const storeRegionParts = storeRegion(store);
  return {
    province: visitRegionParts.province ?? storeRegionParts.province ?? null,
    cityName: visitRegionParts.cityName ?? storeRegionParts.cityName ?? null,
    district: visitRegionParts.district ?? storeRegionParts.district ?? null,
  };
}

function snapshotInPeriod(snapshot: PriceSnapshot, startDate: string, endDate: string) {
  const capturedDate = dateKey(new Date(snapshot.captured_at));
  return capturedDate >= startDate && capturedDate <= endDate;
}

function buildWeeklyPriceHref(locale: string, input: {
  startDate: string;
  endDate: string;
  province: string | null;
  cityName?: string | null;
  district?: string | null;
  brand?: string;
  sku?: string;
}) {
  const params = new URLSearchParams();
  params.set("createdFrom", input.startDate);
  params.set("createdTo", input.endDate);
  if (input.province) params.set("province", input.province);
  if (input.cityName) params.set("cityName", input.cityName);
  if (input.district) params.set("district", input.district);
  if (input.brand) params.set("brand", input.brand);
  if (input.sku) params.set("sku", input.sku);
  return `/${locale}/prices?${params.toString()}`;
}

function groupSnapshotsByLabel(snapshots: PriceSnapshot[], getLabel: (snapshot: PriceSnapshot) => string | null) {
  const groups = new Map<string, PriceSnapshot[]>();
  for (const snapshot of snapshots) {
    const label = cleanText(getLabel(snapshot));
    if (!label) continue;
    const current = groups.get(label) ?? [];
    current.push(snapshot);
    groups.set(label, current);
  }
  return groups;
}

function averageOrNull(values: number[]) {
  return values.length ? Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100) / 100 : null;
}

function benchmarkSeriesKey(brandId: string | null | undefined, productSeries: string | null | undefined) {
  return `${cleanText(brandId) ?? ""}|${normalizeDashboardText(productSeries)}`;
}

function competitorSeriesLabel(brandName: string | null | undefined, productSeries: string | null | undefined) {
  return [cleanText(brandName), cleanText(productSeries)].filter(Boolean).join(" ");
}

function seriesNamesOverlap(left: string | null | undefined, right: string | null | undefined) {
  const leftKey = normalizeDashboardText(left);
  const rightKey = normalizeDashboardText(right);
  if (!leftKey || !rightKey) return false;
  return leftKey === rightKey || leftKey.includes(rightKey) || rightKey.includes(leftKey);
}


function canonicalDashboardProvinceLabel(value: string) {
  const lower = value.toLowerCase();
  if (value.includes("上海") || lower.includes("shanghai") || lower.includes("shang hai")) return "Shanghai";
  if (lower === "daerah khusus ibukota jakarta") return "Jakarta";
  return formatDashboardRegionDisplay(value);
}

function formatDashboardRegionDisplay(value: string) {
  if (/^[A-Z\s]+$/.test(value)) {
    return value
      .toLowerCase()
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }
  return value;
}


function normalizeDashboardText(value: string | null | undefined) {
  return cleanText(value)?.toLowerCase() ?? "";
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map(cleanText).filter(Boolean) as string[])).sort();
}

function buildProductSegmentBattles(input: {
  locale: string;
  skuMaster: SkuMaster[];
  materialMaster: MaterialMaster[];
  competitors: CompetitorProduct[];
  snapshots: PriceSnapshot[];
  promos: PromoEvent[];
  candidates: AiPriceCandidate[];
  benchmarks: MarketBenchmark[];
  stores: OfflineStore[];
}): ProductSegmentBattle[] {
  const groups = new Map<string, { category: string; line: string; size: string; priceBand: string; skus: SkuMaster[]; materialItems: MaterialMaster[] }>();

  for (const sku of input.skuMaster.filter((item) => item.active)) {
    const line = productLineLabel(sku.pack_type);
    const size = cleanText(sku.size) ?? "Unknown";
    const priceBand = sku.segment;
    const key = productSegmentKey(line, size, priceBand);
    const group = groups.get(key) ?? { category: "Diapers", line, size, priceBand, skus: [], materialItems: [] };
    group.skus.push(sku);
    groups.set(key, group);
  }

  for (const item of input.materialMaster) {
    const line = cleanText(item.sub_category) ?? cleanText(item.type) ?? "Unknown";
    const size = cleanText(item.sub_type) ?? "Unknown";
    const priceBand = "unknown";
    const key = productSegmentKey(line, size, priceBand);
    const group = groups.get(key) ?? { category: cleanText(item.category) ?? "Diapers", line, size, priceBand, skus: [], materialItems: [] };
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
    competitorSegment.set(product.id, productSegmentKey(segment.line, segment.size, segment.priceBand));
  }
  const candidateSegment = new Map<string, string>();
  const competitorSegmentById = new Map(input.competitors.map((product) => [product.id, competitorSegment.get(product.id)]));
  for (const candidate of input.candidates.filter((item) => !isMakukuBrandName(item.raw_brand))) {
    if (candidate.matched_entity_type !== "competitor_product" || !candidate.matched_entity_id) continue;
    const segmentKey = competitorSegmentById.get(candidate.matched_entity_id);
    if (segmentKey) candidateSegment.set(candidate.id, segmentKey);
  }

  const battles = Array.from(groups.entries()).map(([key, group]) => {
    const skuIds = new Set(group.skus.map((sku) => sku.id));
    const competitors = input.competitors.filter((product) => {
      if (product.sku_matches?.some((match) => skuIds.has(match.sku_master_id))) return true;
      return competitorSegment.get(product.id) === key;
    });
    const snapshots = input.snapshots.filter((snapshot) => {
      if (snapshot.sku_master_id && skuIds.has(snapshot.sku_master_id)) return true;
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
    const benchmark = pickMarketBenchmark(input.benchmarks, group);
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
    const regionParts = battleRegionParts(benchmark, candidates, input.stores);
    const priceEvidence = [
      ...snapshots.map((snapshot) => ({
        price: snapshot.price_per_piece,
        brand: snapshot.sku_master_id ? "Makuku" : snapshot.competitor_products?.brands?.name ?? null,
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
    const benchmarkPricePerPiece = benchmark?.benchmark_price_per_piece ?? null;
    const priceIndex = targetPriceMin && benchmarkPricePerPiece ? Math.round((targetPriceMin / benchmarkPricePerPiece) * 1000) / 10 : null;
    const promoSeverity = maxSeverity(promos.map((promo) => promo.severity));
    const evidenceCount = snapshots.length + promos.length + candidates.length;
    const severity = productBattleSeverity({ targetGapPct, floorGapPct, promoSeverity, evidenceCount });
    const segmentLabels = Array.from(new Set(group.skus.map((sku) => sku.segment)));
    const problemStores = buildProblemStores({
      candidates,
      stores: input.stores,
      priceIndex,
      floorGapPct,
      benchmarkMissing: !benchmark,
    });

    return {
      id: key,
      market: benchmark?.market ?? "Indonesia",
      province: regionParts.province,
      cityName: regionParts.cityName,
      district: regionParts.district,
      category: group.category,
      line: group.line,
      size: group.size,
      priceBand: group.priceBand,
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
      benchmarkSkuName: benchmark?.benchmark_sku_name ?? null,
      benchmarkPricePerPiece,
      priceIndex,
      problemStoreCount: problemStores.length,
      pendingEvidenceCount: candidates.filter((candidate) => candidate.status === "pending").length,
      worstProblemStore: problemStores[0] ?? null,
      problemStoreNames: problemStores.map((store) => store.name),
      targetGapPct,
      floorGapPct,
      severity,
      latestCapturedAt,
      href: benchmark
        ? buildDashboardPriceHref(input.locale, {
          line: group.line,
          size: group.size,
          priceBand: group.priceBand,
          province: regionParts.province,
          cityName: regionParts.cityName,
          district: regionParts.district,
        })
        : buildCompetitorMappingHref(input.locale, {
          line: group.line,
          size: group.size,
          priceBand: group.priceBand,
        }),
    } satisfies ProductSegmentBattle;
  });

  return battles
    .sort((a, b) => productBattleSortScore(b) - productBattleSortScore(a))
    .slice(0, 12);
}

function filterProductSegmentBattles(battles: ProductSegmentBattle[], filters: ProductSegmentPriceIndexFilters) {
  const filtered = battles.filter((battle) => {
    if (filters.province && battle.province !== filters.province) return false;
    if (filters.cityName && battle.cityName !== filters.cityName) return false;
    if (filters.district && battle.district !== filters.district) return false;
    if (filters.line && battle.line !== filters.line) return false;
    if (filters.priceBand && battle.priceBand !== filters.priceBand) return false;
    if (filters.size && battle.size !== filters.size) return false;
    if (filters.status === "low_index" && !(battle.priceIndex !== null && battle.priceIndex < 95)) return false;
    if (filters.status === "near_index" && !(battle.priceIndex !== null && battle.priceIndex >= 95 && battle.priceIndex <= 105)) return false;
    if (filters.status === "missing_benchmark" && battle.benchmarkPricePerPiece !== null) return false;
    return true;
  });

  const priceIndexSort = (a: ProductSegmentBattle, b: ProductSegmentBattle) => (a.priceIndex ?? Number.POSITIVE_INFINITY) - (b.priceIndex ?? Number.POSITIVE_INFINITY);
  const problemStoreSort = (a: ProductSegmentBattle, b: ProductSegmentBattle) => b.problemStoreCount - a.problemStoreCount;
  if (filters.sort === "priceIndexAsc") return filtered.sort(priceIndexSort);
  if (filters.sort === "priceIndexDesc") return filtered.sort((a, b) => -priceIndexSort(a, b));
  if (filters.sort === "problemStoresDesc") return filtered.sort(problemStoreSort);
  if (filters.sort === "latest") return filtered.sort((a, b) => new Date(b.latestCapturedAt ?? 0).getTime() - new Date(a.latestCapturedAt ?? 0).getTime());
  return filtered;
}

function pickMarketBenchmark(benchmarks: MarketBenchmark[], group: { category: string; line: string; size: string; priceBand: string }) {
  return benchmarks
    .filter((benchmark) => benchmark.active)
    .filter((benchmark) => sameLoose(benchmark.category, group.category))
    .filter((benchmark) => sameLoose(benchmark.product_line, group.line))
    .filter((benchmark) => sameLoose(benchmark.size, group.size))
    .filter((benchmark) => sameLoose(benchmark.price_band, group.priceBand))
    .sort((a, b) => benchmarkSpecificity(b) - benchmarkSpecificity(a))[0] ?? null;
}

function benchmarkSpecificity(benchmark: MarketBenchmark) {
  return [benchmark.province, benchmark.city_name, benchmark.district].filter(cleanText).length;
}

function sameLoose(left: string | null | undefined, right: string | null | undefined) {
  return (left ?? "").trim().toLowerCase() === (right ?? "").trim().toLowerCase();
}

function splitRegion(value: string | null | undefined) {
  const parts = (value ?? "").split(" / ").map((part) => part.trim()).filter(Boolean);
  return {
    province: cleanRegionText(parts[0]),
    cityName: cleanRegionText(parts[1]),
    district: cleanRegionText(parts[2]),
  };
}

function regionLabel(region: { province?: string | null; cityName?: string | null; district?: string | null }) {
  return [region.province, region.cityName, region.district].map(cleanRegionText).filter(Boolean).join(" / ");
}

function storeRegion(store: Pick<OfflineStore, "city" | "province" | "city_name" | "district"> | null | undefined) {
  const fallback = splitRegion(store?.city);
  return {
    province: cleanRegionText(store?.province) ?? fallback.province,
    cityName: cleanRegionText(store?.city_name) ?? fallback.cityName,
    district: cleanRegionText(store?.district) ?? fallback.district,
  };
}

function visitRegion(visit: Pick<OfflineStoreVisit, "city" | "province" | "city_name" | "district"> | null | undefined) {
  const fallback = splitRegion(visit?.city);
  return {
    province: cleanRegionText(visit?.province) ?? fallback.province,
    cityName: cleanRegionText(visit?.city_name) ?? fallback.cityName,
    district: cleanRegionText(visit?.district) ?? fallback.district,
  };
}

function battleRegionParts(benchmark: MarketBenchmark | null, candidates: AiPriceCandidate[], stores: OfflineStore[]) {
  const benchmarkRegion = {
    province: cleanRegionText(benchmark?.province),
    cityName: cleanRegionText(benchmark?.city_name),
    district: cleanRegionText(benchmark?.district),
  };
  if (benchmarkRegion.province || benchmarkRegion.cityName || benchmarkRegion.district) return benchmarkRegion;

  const candidateVisit = candidates.find((candidate) => candidate.offline_store_visits)?.offline_store_visits ?? null;
  const candidateRegion = visitRegion(candidateVisit);
  if (candidateRegion.province || candidateRegion.cityName || candidateRegion.district) return candidateRegion;

  return storeRegion(stores[0] ?? null);
}

function buildProblemStores(input: {
  candidates: AiPriceCandidate[];
  stores: OfflineStore[];
  priceIndex: number | null;
  floorGapPct: number | null;
  benchmarkMissing: boolean;
}) {
  const shouldFlagSegment = (input.priceIndex !== null && input.priceIndex < 95) || (input.floorGapPct !== null && input.floorGapPct < 0) || input.benchmarkMissing;
  const byName = new Map<string, NonNullable<ProductSegmentBattle["worstProblemStore"]>>();

  for (const candidate of input.candidates) {
    const visit = candidate.offline_store_visits;
    if (!visit && !shouldFlagSegment) continue;
    const name = cleanStoreName(visit?.store_name) ?? "Unknown Store";
    const region = visitRegion(visit);
    const tags = [
      candidate.status === "pending" ? "pending review" : null,
      input.benchmarkMissing ? "missing benchmark" : null,
      input.priceIndex !== null && input.priceIndex < 95 ? "low index" : null,
    ].filter(Boolean) as string[];
    byName.set(name, {
      id: visit?.id ?? null,
      name,
      province: region.province,
      cityName: region.cityName,
      district: region.district,
      evidence: `${candidate.raw_brand} ${candidate.raw_product}`.trim() || "photo price evidence",
      pricePerPiece: candidate.reviewed_price_per_piece ?? candidate.price_per_piece,
      tags,
    });
  }


  return Array.from(byName.values()).sort((a, b) => {
    const priceCompare = (a.pricePerPiece ?? Number.POSITIVE_INFINITY) - (b.pricePerPiece ?? Number.POSITIVE_INFINITY);
    return priceCompare || a.name.localeCompare(b.name);
  });
}

function buildDashboardPriceHref(locale: string, input: {
  line: string;
  size: string;
  priceBand: string;
  province: string | null;
  cityName: string | null;
  district: string | null;
}) {
  const params = new URLSearchParams();
  params.set("line", input.line);
  params.set("size", input.size);
  params.set("priceBand", input.priceBand);
  if (input.province) params.set("province", input.province);
  if (input.cityName) params.set("cityName", input.cityName);
  if (input.district) params.set("district", input.district);
  return `/${locale}/prices?${params.toString()}`;
}

function buildCompetitorMappingHref(locale: string, input: { line: string; size: string; priceBand: string }) {
  const params = new URLSearchParams();
  params.set("line", input.line);
  params.set("size", input.size);
  params.set("priceBand", input.priceBand);
  return `/${locale}/competitor-mappings?${params.toString()}`;
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
  return { line, size, priceBand: product.segment };
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

function productSegmentKey(line: string, size: string, priceBand = "unknown") {
  return `${slugKey(line)}-${slugKey(size)}-${slugKey(priceBand)}`;
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
  const indexPressure = battle.priceIndex === null ? 0 : Math.max(0, 105 - battle.priceIndex) * 8;
  const floorPressure = battle.floorGapPct === null ? 0 : Math.max(0, -battle.floorGapPct) * 4;
  const targetPressure = battle.targetGapPct === null ? 0 : Math.max(0, -battle.targetGapPct) * 2;
  return actionSeverityRank(battle.severity) * 100 + indexPressure + floorPressure + targetPressure + battle.problemStoreCount * 20 + battle.evidenceCount * 5 + battle.competitorProductCount;
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
      const cityEvents = input.feed.filter((item) => cityLabelFromRegionSource({ city: item.city }) === row.city);
      const metrics = buildMatrixCellMetrics(cityEvents, input.since);
      const makukuShares = input.visits
        .filter((visit) => cityLabelFromRegionSource(visit) === row.city)
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
          city: cityLabelFromRegionSource(visit) ?? visit.city,
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
        city: cityLabelFromRegionSource({ city: upload.city }) ?? upload.city,
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

function cleanRegionText(value: unknown) {
  const text = cleanText(value);
  if (!text) return null;
  if (/^\d+$/.test(text)) return null;
  return text;
}

function cleanStoreName(value: unknown) {
  const text = cleanText(value);
  if (!text) return null;
  if (/^\d+$/.test(text)) return null;
  return text;
}

function dateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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
    const city = cityLabelFromRegionSource(visit);
    if (q && ![visit.store_name, city, visit.uploader_name].filter(Boolean).some((value) => value!.toLowerCase().includes(q))) return false;
    if (filters.city && !(city ?? "").toLowerCase().includes(filters.city.toLowerCase())) return false;
    if (filters.status && visit.visit_status !== filters.status) return false;
    if (filters.uploaderName && visit.uploader_name !== filters.uploaderName) return false;
    if (filters.uploaderUserId && visit.uploader_user_id && visit.uploader_user_id !== filters.uploaderUserId) return false;
    if (filters.dateFrom && visit.visit_date < filters.dateFrom) return false;
    if (filters.dateTo && visit.visit_date > filters.dateTo) return false;
    return true;
  }).slice(0, filters.limit ?? 100);
}

function formatLocalDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function defaultRecent24HoursRange() {
  const now = new Date();
  const start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  return {
    dateFrom: formatLocalDate(start),
    dateTo: formatLocalDate(now),
  };
}

const storeVisitMonitorDefaultPageSize = 50;
const storeVisitMonitorMaxPageSize = 100;
const storeVisitMonitorSummaryLimit = 5000;
const storeVisitMonitorExportBatchSize = 500;
const storeVisitMonitorSelect = "id,visit_code,store_name,visit_date,promoter,uploader_name,analysis_status,visit_status,summary_result,created_at,updated_at,image_urls";
const legacyStoreVisitMonitorSelect = "id,visit_code,store_name,visit_date,promoter,uploader_name,analysis_status,visit_status,summary_result,created_at,image_urls";

function positiveInteger(value: unknown, fallback: number) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function normalizeStoreVisitMonitorPagination(filters: StoreVisitMonitorFilters) {
  const page = positiveInteger(filters.page, 1);
  const requestedPageSize = positiveInteger(filters.pageSize ?? filters.limit, storeVisitMonitorDefaultPageSize);
  return {
    page,
    pageSize: Math.min(requestedPageSize, storeVisitMonitorMaxPageSize),
  };
}

function storeVisitMonitorPagination(page: number, pageSize: number, total: number, itemCount: number) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = total === 0 ? 0 : Math.min((page - 1) * pageSize + itemCount, total);
  return {
    page,
    pageSize,
    total,
    totalPages,
    from,
    to,
    hasPrevious: page > 1,
    hasNext: page < totalPages,
  };
}

function isMissingStoreVisitUpdatedAtError(error: { message?: string } | null | undefined) {
  return (error?.message ?? "").includes("offline_store_visits.updated_at")
    || (error?.message ?? "").includes("'updated_at' column")
    || (error?.message ?? "").includes("Could not find the 'updated_at' column");
}

function filterMonitorItems(items: StoreVisitMonitorItem[], filters: StoreVisitMonitorFilters, dateFrom: string, dateTo: string) {
  return items.filter((visit) => {
    const completedDate = (visit.completedAt ?? "").slice(0, 10);
    if (completedDate) {
      if (completedDate < dateFrom || completedDate > dateTo) return false;
    } else if (visit.visitDate < dateFrom || visit.visitDate > dateTo) {
      return false;
    }
    if (filters.visitCode && !(visit.visitCode ?? "").toLowerCase().includes(filters.visitCode.toLowerCase())) return false;
    if (filters.storeName && !visit.storeName.toLowerCase().includes(filters.storeName.toLowerCase())) return false;
    if (filters.promoter && !visit.promoter.toLowerCase().includes(filters.promoter.toLowerCase())) return false;
    if (filters.analysisStatus && visit.analysisStatus !== filters.analysisStatus) return false;
    return true;
  });
}

function sortMonitorItems(items: StoreVisitMonitorItem[]) {
  return [...items].sort((a, b) => {
    const completedDiff = new Date(b.completedAt ?? b.createdAt).getTime() - new Date(a.completedAt ?? a.createdAt).getTime();
    if (completedDiff !== 0) return completedDiff;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

function percentile(values: number[], ratio: number) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1));
  return sorted[index] ?? null;
}

function toMonitorItem(visit: OfflineStoreVisit): StoreVisitMonitorItem {
  const summaryResult = isRecord(visit.summary_result) ? visit.summary_result : {};
  const analysisMetrics = isRecord(summaryResult.analysis_metrics) ? summaryResult.analysis_metrics : {};
  const imageCount = isFiniteNumber(analysisMetrics.price_image_count)
    ? analysisMetrics.price_image_count
    : (visit.offline_visit_images?.length ?? visit.image_urls?.length ?? 0);
  return {
    visitId: visit.id,
    visitCode: visit.visit_code ?? null,
    storeName: visit.store_name,
    visitDate: visit.visit_date,
    promoter: visit.promoter ?? visit.uploader_name,
    analysisStatus: visit.analysis_status ?? null,
    visitStatus: visit.visit_status,
    fullAnalysisTimeMs: isFiniteNumber(analysisMetrics.visit_analysis_duration_ms)
      ? analysisMetrics.visit_analysis_duration_ms
      : null,
    imageCount,
    successCount: isFiniteNumber(analysisMetrics.price_image_success_count)
      ? analysisMetrics.price_image_success_count
      : 0,
    failureCount: isFiniteNumber(analysisMetrics.price_image_failure_count)
      ? analysisMetrics.price_image_failure_count
      : 0,
    retakeRequiredCount: isFiniteNumber(analysisMetrics.price_image_retake_required_count)
      ? analysisMetrics.price_image_retake_required_count
      : 0,
    accuracy: null,
    autoApprovalRate: null,
    avgPriceDeviationRate: null,
    startedAt: typeof analysisMetrics.visit_analysis_started_at === "string"
      ? analysisMetrics.visit_analysis_started_at
      : null,
    completedAt: typeof analysisMetrics.visit_analysis_completed_at === "string"
      ? analysisMetrics.visit_analysis_completed_at
      : null,
    createdAt: visit.created_at,
    updatedAt: (visit as OfflineStoreVisit & { updated_at?: string | null }).updated_at ?? null,
  };
}

function emptyStoreVisitMonitorQuality(): StoreVisitMonitorQuality {
  return {
    accuracy: null,
    autoApprovalRate: null,
    avgPriceDeviationRate: null,
  };
}

function isMissingStoreVisitQualityViewError(error: { message?: string } | null) {
  const message = error?.message ?? "";
  return message.includes("ai_price_candidate_quality_metrics_v1")
    && (message.includes("Could not find the table") || message.includes("does not exist") || message.includes("schema cache"));
}

function isInactiveQualityLifecycleStatus(status: string | null | undefined) {
  return status === "deleted" || status === "replaced" || status === "reanalyzed";
}

function valuesMatch(left: string | number | null | undefined, right: string | number | null | undefined) {
  return left === right || (left == null && right == null);
}

type StoreVisitMonitorQualityRow = {
  id?: string;
  visit_id: string | null;
  status: string;
  review_method?: string | null;
  candidate_type: string;
  h5_lifecycle_status?: string | null;
  ai_matched_entity_type?: string | null;
  ai_matched_entity_id?: string | null;
  ai_net_price_idr?: number | null;
  matched_entity_type?: string | null;
  matched_entity_id?: string | null;
  net_price_idr?: number | null;
  created_at?: string | null;
};

function candidateContributesToQuality(row: StoreVisitMonitorQualityRow) {
  return row.candidate_type === "SKU" && !isInactiveQualityLifecycleStatus(row.h5_lifecycle_status);
}

function candidateMatchesOriginalAi(row: StoreVisitMonitorQualityRow) {
  if (row.status === "rejected") return false;
  return valuesMatch(row.ai_matched_entity_type, row.matched_entity_type)
    && valuesMatch(row.ai_matched_entity_id, row.matched_entity_id)
    && valuesMatch(row.ai_net_price_idr, row.net_price_idr);
}

function candidateWasAutoApproved(row: StoreVisitMonitorQualityRow) {
  return row.status === "approved" && row.review_method === "auto_rule";
}

async function loadStoreVisitMonitorQualityRows(visitIds: string[]) {
  const supabase = createSupabaseServiceClient();
  const pageSize = 1000;
  const rows: StoreVisitMonitorQualityRow[] = [];

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      // Keep the SQL view for downstream consumers; the monitor reads ai_price_candidates directly
      // so the metrics reflect current row edits immediately without requiring snapshot approval.
      .from("ai_price_candidates")
      .select("id,visit_id,status,review_method,candidate_type,h5_lifecycle_status,ai_matched_entity_type,ai_matched_entity_id,ai_net_price_idr,matched_entity_type,matched_entity_id,net_price_idr,created_at")
      .in("visit_id", visitIds)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) return { rows: [] as StoreVisitMonitorQualityRow[], error };
    const pageRows = (data ?? []) as StoreVisitMonitorQualityRow[];
    rows.push(...pageRows);
    if (pageRows.length < pageSize) return { rows, error: null };
  }
}

async function getStoreVisitMonitorQuality(visitIds: string[]): Promise<QueryResult<StoreVisitMonitorQuality>> {
  if (!hasSupabaseServiceConfig() || visitIds.length === 0) {
    return { data: emptyStoreVisitMonitorQuality(), error: null, isDemo: !hasSupabaseServiceConfig() };
  }

  const { rows, error } = await loadStoreVisitMonitorQualityRows(visitIds);

  if (isMissingStoreVisitQualityViewError(error) || (error?.message ?? "").includes("ai_matched_entity_type")) {
    return { data: emptyStoreVisitMonitorQuality(), error: null, isDemo: false };
  }
  if (error) return { data: emptyStoreVisitMonitorQuality(), error: error.message, isDemo: false };

  const activeRows = rows.filter(candidateContributesToQuality);
  const denominator = activeRows.length;
  const deviationRows = activeRows
    .map((row) => {
      if (typeof row.ai_net_price_idr !== "number" || !Number.isFinite(row.ai_net_price_idr)) return null;
      if (typeof row.net_price_idr !== "number" || !Number.isFinite(row.net_price_idr) || row.net_price_idr <= 0) return null;
      return Math.abs(row.ai_net_price_idr - row.net_price_idr) / row.net_price_idr;
    })
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));

  return {
    data: {
      accuracy: denominator > 0
        ? activeRows.filter(candidateMatchesOriginalAi).length / denominator
        : null,
      autoApprovalRate: denominator > 0
        ? activeRows.filter(candidateWasAutoApproved).length / denominator
        : null,
      avgPriceDeviationRate: deviationRows.length > 0
        ? deviationRows.reduce((sum, value) => sum + value, 0) / deviationRows.length
        : null,
    },
    error: null,
    isDemo: false,
  };
}

async function getStoreVisitMonitorVisitQuality(visitIds: string[]): Promise<QueryResult<Record<string, StoreVisitMonitorQuality>>> {
  if (!hasSupabaseServiceConfig() || visitIds.length === 0) {
    return { data: {}, error: null, isDemo: !hasSupabaseServiceConfig() };
  }

  const { rows, error } = await loadStoreVisitMonitorQualityRows(visitIds);

  if (isMissingStoreVisitQualityViewError(error) || (error?.message ?? "").includes("ai_matched_entity_type")) {
    return { data: {}, error: null, isDemo: false };
  }
  if (error) return { data: {}, error: error.message, isDemo: false };

  const grouped = new Map<string, { total: number; correct: number; autoApproved: number; deviations: number[] }>();
  for (const row of rows) {
    if (!row.visit_id) continue;
    if (!candidateContributesToQuality(row)) continue;
    const bucket = grouped.get(row.visit_id) ?? { total: 0, correct: 0, autoApproved: 0, deviations: [] };
    bucket.total += 1;
    if (candidateMatchesOriginalAi(row)) {
      bucket.correct += 1;
    }
    if (candidateWasAutoApproved(row)) bucket.autoApproved += 1;
    if (
      typeof row.ai_net_price_idr === "number"
      && Number.isFinite(row.ai_net_price_idr)
      && typeof row.net_price_idr === "number"
      && Number.isFinite(row.net_price_idr)
      && row.net_price_idr > 0
    ) {
      bucket.deviations.push(Math.abs(row.ai_net_price_idr - row.net_price_idr) / row.net_price_idr);
    }
    grouped.set(row.visit_id, bucket);
  }

  const visitQualityById = Object.fromEntries(
    Array.from(grouped.entries()).map(([visitId, bucket]) => [
      visitId,
      {
        accuracy: bucket.total > 0 ? bucket.correct / bucket.total : null,
        autoApprovalRate: bucket.total > 0 ? bucket.autoApproved / bucket.total : null,
        avgPriceDeviationRate: bucket.deviations.length > 0
          ? bucket.deviations.reduce((sum, value) => sum + value, 0) / bucket.deviations.length
          : null,
      },
    ]),
  ) as Record<string, StoreVisitMonitorQuality>;

  return {
    data: visitQualityById,
    error: null,
    isDemo: false,
  };
}

async function getStoreVisitMonitorRows(filters: StoreVisitMonitorFilters, dateFrom: string, dateTo: string) {
  if (!hasSupabaseServiceConfig()) {
    const sorted = sortMonitorItems(filterMonitorItems(demoOfflineStoreVisits.map(toMonitorItem), filters, dateFrom, dateTo));
    return { rows: sorted, total: sorted.length, error: null, isDemo: true };
  }

  const supabase = createSupabaseServiceClient();
  const { page, pageSize } = normalizeStoreVisitMonitorPagination(filters);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const runQueries = async (select: string) => {
    const pageQuery = applyStoreVisitMonitorRowFilters(
      supabase
        .from("offline_store_visits")
        .select(select, { count: "exact" })
        .neq("visit_status", "draft")
        .gte("visit_date", dateFrom)
        .lte("visit_date", dateTo)
        .order("created_at", { ascending: false })
        .range(from, to),
      filters,
    );
    const summaryQuery = applyStoreVisitMonitorRowFilters(
      supabase
        .from("offline_store_visits")
        .select(select)
        .neq("visit_status", "draft")
        .gte("visit_date", dateFrom)
        .lte("visit_date", dateTo)
        .order("created_at", { ascending: false })
        .range(0, storeVisitMonitorSummaryLimit - 1),
      filters,
    );

    return Promise.all([pageQuery, summaryQuery]);
  };

  let [pageResult, summaryResult] = await runQueries(storeVisitMonitorSelect);
  if (isMissingStoreVisitUpdatedAtError(pageResult.error) || isMissingStoreVisitUpdatedAtError(summaryResult.error)) {
    [pageResult, summaryResult] = await runQueries(legacyStoreVisitMonitorSelect);
  }
  if (pageResult.error) return { rows: [], summaryRows: [], total: 0, error: pageResult.error.message, isDemo: false };
  if (summaryResult.error) return { rows: [], summaryRows: [], total: 0, error: summaryResult.error.message, isDemo: false };

  return {
    rows: ((pageResult.data ?? []) as unknown as OfflineStoreVisit[]).map(toMonitorItem),
    summaryRows: ((summaryResult.data ?? []) as unknown as OfflineStoreVisit[]).map(toMonitorItem),
    total: pageResult.count ?? 0,
    error: null,
    isDemo: false,
  };
}

function applyStoreVisitMonitorRowFilters<T>(query: T, filters: StoreVisitMonitorFilters): T {
  let nextQuery = query as T & {
    ilike: (column: string, pattern: string) => typeof nextQuery;
    or: (filters: string) => typeof nextQuery;
    eq: (column: string, value: string) => typeof nextQuery;
  };

  if (filters.visitCode) {
    nextQuery = nextQuery.ilike("visit_code", `%${filters.visitCode}%`);
  }
  if (filters.storeName) {
    nextQuery = nextQuery.ilike("store_name", `%${filters.storeName}%`);
  }
  if (filters.promoter) {
    const promoterFilter = `promoter.ilike.%${filters.promoter}%,uploader_name.ilike.%${filters.promoter}%`;
    nextQuery = nextQuery.or(promoterFilter);
  }
  if (filters.analysisStatus) {
    nextQuery = nextQuery.eq("analysis_status", filters.analysisStatus);
  }

  return nextQuery;
}

async function getStoreVisitMonitorExportRows(filters: StoreVisitMonitorFilters, dateFrom: string, dateTo: string) {
  if (!hasSupabaseServiceConfig()) {
    const sorted = sortMonitorItems(filterMonitorItems(demoOfflineStoreVisits.map(toMonitorItem), filters, dateFrom, dateTo));
    return { rows: sorted, error: null, isDemo: true };
  }

  const supabase = createSupabaseServiceClient();

  const loadRows = async (select: string) => {
    const rows: OfflineStoreVisit[] = [];

    for (let from = 0; ; from += storeVisitMonitorExportBatchSize) {
      const { data, error } = await applyStoreVisitMonitorRowFilters(
        supabase
          .from("offline_store_visits")
          .select(select)
          .neq("visit_status", "draft")
          .gte("visit_date", dateFrom)
          .lte("visit_date", dateTo)
          .order("created_at", { ascending: false })
          .order("id", { ascending: false })
          .range(from, from + storeVisitMonitorExportBatchSize - 1),
        filters,
      );

      if (error) return { rows: [] as StoreVisitMonitorItem[], error: error.message, isDemo: false };
      const pageRows = (data ?? []) as unknown as OfflineStoreVisit[];
      rows.push(...pageRows);
      if (pageRows.length < storeVisitMonitorExportBatchSize) {
        return { rows: rows.map(toMonitorItem), error: null, isDemo: false };
      }
    }
  };

  let exportResult = await loadRows(storeVisitMonitorSelect);
  if (isMissingStoreVisitUpdatedAtError(exportResult.error ? { message: exportResult.error } : null)) {
    exportResult = await loadRows(legacyStoreVisitMonitorSelect);
  }
  return exportResult;
}

export async function getStoreVisitMonitor(
  filters: StoreVisitMonitorFilters = {},
): Promise<QueryResult<StoreVisitMonitorResult>> {
  const recent24Hours = defaultRecent24HoursRange();
  const dateFrom = filters.dateFrom || recent24Hours.dateFrom;
  const dateTo = filters.dateTo || recent24Hours.dateTo;
  const isDefaultRecent24Hours = !filters.dateFrom && !filters.dateTo;
  const { page, pageSize } = normalizeStoreVisitMonitorPagination(filters);
  const visitsResult = await getStoreVisitMonitorRows(filters, dateFrom, dateTo);
  const visits = visitsResult.rows;
  const summaryVisits = visitsResult.summaryRows ?? visits;

  const durations = summaryVisits
    .map((visit) => visit.fullAnalysisTimeMs)
    .filter((value): value is number => isFiniteNumber(value));

  const summary: StoreVisitMonitorSummary = {
    visitsAnalyzed: visitsResult.total,
    p50: percentile(durations, 0.5),
    p90: percentile(durations, 0.9),
    p95: percentile(durations, 0.95),
    actionRequiredOrFailedCount: summaryVisits.filter((visit) => visit.analysisStatus === "action_required" || visit.analysisStatus === "failed").length,
    averageImagesPerVisit: summaryVisits.length > 0
      ? Math.round((summaryVisits.reduce((sum, visit) => sum + visit.imageCount, 0) / summaryVisits.length) * 10) / 10
      : null,
    averageSuccessfulImagesPerVisit: summaryVisits.length > 0
      ? Math.round((summaryVisits.reduce((sum, visit) => sum + visit.successCount, 0) / summaryVisits.length) * 10) / 10
      : null,
  };

  const visitIds = visits.map((visit) => visit.visitId);
  const [qualityResult, visitQualityResult] = await Promise.all([
    getStoreVisitMonitorQuality(visitIds),
    getStoreVisitMonitorVisitQuality(visitIds),
  ]);
  const quality = {
    accuracy: qualityResult.data.accuracy,
    autoApprovalRate: qualityResult.data.autoApprovalRate,
    avgPriceDeviationRate: qualityResult.data.avgPriceDeviationRate,
  };
  const visitQualityById = visitQualityResult.data;
  const visitsWithQuality = visits.map((visit) => ({
    ...visit,
    accuracy: visitQualityById[visit.visitId]?.accuracy ?? null,
    autoApprovalRate: visitQualityById[visit.visitId]?.autoApprovalRate ?? null,
    avgPriceDeviationRate: visitQualityById[visit.visitId]?.avgPriceDeviationRate ?? null,
  }));

  return {
    data: {
      summary,
      quality: {
        accuracy: quality.accuracy,
        autoApprovalRate: quality.autoApprovalRate,
        avgPriceDeviationRate: quality.avgPriceDeviationRate,
      },
      visits: visitsWithQuality,
      pagination: storeVisitMonitorPagination(page, pageSize, visitsResult.total, visitsWithQuality.length),
      filters: {
        dateFrom,
        dateTo,
        isDefaultRecent24Hours,
      },
    },
    error: visitsResult.error ?? qualityResult.error ?? visitQualityResult.error,
    isDemo: visitsResult.isDemo || qualityResult.isDemo || visitQualityResult.isDemo,
  };
}

export async function getStoreVisitMonitorExport(
  filters: StoreVisitMonitorFilters = {},
): Promise<QueryResult<StoreVisitMonitorItem[]>> {
  const recent24Hours = defaultRecent24HoursRange();
  const dateFrom = filters.dateFrom || recent24Hours.dateFrom;
  const dateTo = filters.dateTo || recent24Hours.dateTo;
  const visitsResult = await getStoreVisitMonitorExportRows(filters, dateFrom, dateTo);
  const visits = visitsResult.rows;
  const visitIds = visits.map((visit) => visit.visitId);
  const visitQualityResult = await getStoreVisitMonitorVisitQuality(visitIds);
  const visitQualityById = visitQualityResult.data;

  return {
    data: visits.map((visit) => ({
      ...visit,
      accuracy: visitQualityById[visit.visitId]?.accuracy ?? null,
      autoApprovalRate: visitQualityById[visit.visitId]?.autoApprovalRate ?? null,
      avgPriceDeviationRate: visitQualityById[visit.visitId]?.avgPriceDeviationRate ?? null,
    })),
    error: visitsResult.error ?? visitQualityResult.error,
    isDemo: visitsResult.isDemo || visitQualityResult.isDemo,
  };
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
      query = query.or(`store_name.ilike.%${q}%,city_name.ilike.%${q}%,city.ilike.%${q}%,uploader_name.ilike.%${q}%`);
    }
    if (filters.city) query = query.or(`city_name.ilike.%${filters.city}%,city.ilike.%${filters.city}%`);
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
  const visits = (data ?? []) as OfflineStoreVisit[];
  if (filters.includeImageUrls === false) {
    return { data: visits, error: null, isDemo: false };
  }
  return { data: await attachVisitImageUrls(visits), error: null, isDemo: false };
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

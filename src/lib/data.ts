import {
  demoAiRecommendations,
  demoAlerts,
  demoBrands,
  demoCompetitors,
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
  Brand,
  CompetitorProduct,
  MaterialMaster,
  OfflineUpload,
  OfflineStoreVisit,
  PriceSnapshot,
  PromoEvent,
  SkuMaster,
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

async function fromSupabase<T>(query: PromiseLike<{ data: unknown; error: { message: string } | null }>, fallback: T): Promise<QueryResult<T>> {
  if (!hasSupabaseConfig()) return { data: fallback, error: null, isDemo: true };
  const { data, error } = await query;
  if (error) return { data: fallback, error: error.message, isDemo: true };
  return { data: (data ?? fallback) as T, error: null, isDemo: false };
}

export async function getBrands(): Promise<QueryResult<Brand[]>> {
  if (!hasSupabaseConfig()) return { data: demoBrands, error: null, isDemo: true };
  const supabase = createSupabaseAnonClient();
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
      data: [],
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

export async function getAiPriceCandidates(): Promise<QueryResult<AiPriceCandidate[]>> {
  if (!hasSupabaseServiceConfig()) {
    return {
      data: [],
      error: "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
      isDemo: true,
    };
  }

  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("ai_price_candidates")
    .select("*, offline_store_visits(id,store_name,city,channel_type,visit_date,created_at)")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error?.message.includes("ai_price_candidates")) {
    return { data: [], error: "Run migration 202605280005_ai_price_candidates.sql", isDemo: false };
  }
  if (error) return { data: [], error: error.message, isDemo: false };
  return { data: (data ?? []) as AiPriceCandidate[], error: null, isDemo: false };
}

export async function getCompetitorProducts(): Promise<QueryResult<CompetitorProduct[]>> {
  if (!hasSupabaseConfig()) return { data: demoCompetitors, error: null, isDemo: true };
  const supabase = createSupabaseAnonClient();
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
  const supabase = createSupabaseAnonClient();
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

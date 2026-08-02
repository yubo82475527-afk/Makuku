import { demoOfflineStoreVisits } from "@/lib/demo-data";
import { createSupabaseServiceClient, hasSupabaseServiceConfig } from "@/lib/supabase";
import { loadActiveAiJobsForVisits } from "@/lib/store-visit-ai-jobs";
import { summarizeVisitPriceHandling } from "@/lib/price-handling-status";
import type { AiPriceCandidate, OfflineStoreVisit, StoreVisitAiJobSummary, VisitPriceHandlingSummary } from "@/lib/types";

type VisitListImageMetrics = {
  photoCount: number;
  failedPhotoCount: number;
  hasInFlightPriceImage: boolean;
};

const defaultPageSize = 20;
const maxPageSize = 50;
const visitListSelect = "id,store_id,store_name,region,channel,city,province,city_name,district,channel_type,visit_date,visit_status,analysis_status,analysis_error,ai_result,created_at,image_urls";

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

function isVisibleVisit(visit: OfflineStoreVisit) {
  return visit.visit_status !== "draft";
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
    .neq("visit_status", "draft")
    .eq("visit_date", params.todayVisitDate);

  const legacyUserResult = await params.supabase
    .from("offline_store_visits")
    .select("store_id,store_name,region,channel,city,channel_type")
    .eq("user_id", params.userId)
    .is("uploader_user_id", null)
    .neq("visit_status", "draft")
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
    .neq("visit_status", "draft")
    .is("visit_date", null)
    .gte("created_at", params.start)
    .lt("created_at", params.end);

  const legacyUserResult = await params.supabase
    .from("offline_store_visits")
    .select("store_id,store_name,region,channel,city,channel_type")
    .eq("user_id", params.userId)
    .is("uploader_user_id", null)
    .neq("visit_status", "draft")
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

function isListPriceImageType(imageType: string | null | undefined) {
  return imageType === "own_shelf"
    || imageType === "makuku_shelf"
    || imageType === "competitor_shelf";
}

function photoCount(visit: OfflineStoreVisit, imageMetricsByVisitId?: Map<string, VisitListImageMetrics>) {
  const legacyCount = Array.isArray(visit.image_urls) ? visit.image_urls.length : 0;
  const rowCount = imageMetricsByVisitId?.get(visit.id)?.photoCount ?? visit.offline_visit_images?.length ?? 0;
  return Math.max(legacyCount, rowCount);
}

function isActiveJobStatus(status: string | null | undefined) {
  return status === "queued" || status === "running";
}

function formatVisitRegion(visit: OfflineStoreVisit) {
  const structured = [visit.province, visit.city_name, visit.district].map((value) => value?.trim()).filter(Boolean).join(" / ");
  return visit.region ?? structured ?? visit.city ?? null;
}

function serializeVisit(
  visit: OfflineStoreVisit,
  activeAiJob?: StoreVisitAiJobSummary | null,
  imageMetricsByVisitId?: Map<string, VisitListImageMetrics>,
  priceHandling?: VisitPriceHandlingSummary,
  rerunInFlight?: boolean,
) {
  const metrics = imageMetricsByVisitId?.get(visit.id);
  const resolvedPriceHandling = priceHandling ?? summarizeVisitPriceHandling({
    analysis_status: visit.analysis_status,
    active_job_status: activeAiJob?.status ?? null,
    candidates: [],
  });
  const inFlight = Boolean(
    rerunInFlight
    || isActiveJobStatus(activeAiJob?.status)
    || metrics?.hasInFlightPriceImage
    || visit.analysis_status === "pending"
    || visit.analysis_status === "analyzing"
    || resolvedPriceHandling.status === "PROCESSING",
  );
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
    price_handling: resolvedPriceHandling,
    image_urls: visit.image_urls ?? [],
    photo_count: photoCount(visit, imageMetricsByVisitId),
    failed_photo_count: metrics?.failedPhotoCount ?? 0,
    in_flight: inFlight,
    created_at: visit.created_at,
    active_ai_job: activeAiJob ?? null,
  };
}

function filterDemoVisits(userId: string) {
  return demoOfflineStoreVisits
    .filter((visit) => visit.user_id === userId || visit.uploader_user_id === userId)
    .filter(isVisibleVisit)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

function dedupeAndSortVisits(rows: OfflineStoreVisit[]) {
  const byId = new Map<string, OfflineStoreVisit>();
  for (const row of rows) {
    if (!byId.has(row.id)) byId.set(row.id, row);
  }
  return [...byId.values()].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

async function loadVisitPageRows(params: {
  supabase: ReturnType<typeof createSupabaseServiceClient>;
  userId: string;
  from: number;
  pageSize: number;
}) {
  const pageFetchLimit = params.from + params.pageSize + 1;
  const fetchTo = pageFetchLimit - 1;
  const uploaderResult = await params.supabase
    .from("offline_store_visits")
    .select(visitListSelect)
    .eq("uploader_user_id", params.userId)
    .neq("visit_status", "draft")
    .order("created_at", { ascending: false })
    .range(0, fetchTo);

  if (uploaderResult.error) return { error: uploaderResult.error, rows: [] as OfflineStoreVisit[] };

  const legacyUserResult = await params.supabase
    .from("offline_store_visits")
    .select(visitListSelect)
    .eq("user_id", params.userId)
    .is("uploader_user_id", null)
    .neq("visit_status", "draft")
    .order("created_at", { ascending: false })
    .range(0, fetchTo);

  const rows = dedupeAndSortVisits([
    ...((uploaderResult.data ?? []) as OfflineStoreVisit[]),
    ...(legacyUserResult.error ? [] : ((legacyUserResult.data ?? []) as OfflineStoreVisit[])),
  ]);

  return { error: null, rows };
}

async function loadVisitImageMetricsByVisitId(params: {
  supabase: ReturnType<typeof createSupabaseServiceClient>;
  visitIds: string[];
}) {
  if (params.visitIds.length === 0) return new Map<string, VisitListImageMetrics>();

  // Prefer DB-side aggregation so large vision_result JSON never leaves Postgres.
  const rpcResult = await params.supabase.rpc("h5_list_visit_image_metrics", {
    p_visit_ids: params.visitIds,
  });
  if (!rpcResult.error && Array.isArray(rpcResult.data)) {
    const metrics = new Map<string, VisitListImageMetrics>();
    for (const row of rpcResult.data as Array<{
      visit_id?: unknown;
      photo_count?: unknown;
      failed_photo_count?: unknown;
      has_in_flight_price_image?: unknown;
    }>) {
      const visitId = String(row.visit_id ?? "");
      if (!visitId) continue;
      metrics.set(visitId, {
        photoCount: Number(row.photo_count) || 0,
        failedPhotoCount: Number(row.failed_photo_count) || 0,
        hasInFlightPriceImage: Boolean(row.has_in_flight_price_image),
      });
    }
    return metrics;
  }

  // Fallback: light columns only (no full vision_result payload).
  const { data, error } = await params.supabase
    .from("offline_visit_images")
    .select("visit_id,analysis_status,image_type,deleted_at,replaced_by_image_id,photo_quality:vision_result->photo_quality")
    .in("visit_id", params.visitIds);
  if (error) return new Map<string, VisitListImageMetrics>();

  const metrics = new Map<string, VisitListImageMetrics>();
  for (const row of data ?? []) {
    const record = row as {
      visit_id?: unknown;
      analysis_status?: unknown;
      image_type?: unknown;
      deleted_at?: unknown;
      replaced_by_image_id?: unknown;
      photo_quality?: unknown;
    };
    const visitId = String(record.visit_id ?? "");
    if (!visitId || record.replaced_by_image_id || record.deleted_at) continue;
    const current = metrics.get(visitId) ?? { photoCount: 0, failedPhotoCount: 0, hasInFlightPriceImage: false };
    current.photoCount += 1;
    const imageType = String(record.image_type ?? "");
    const analysisStatus = String(record.analysis_status ?? "");
    if (isListPriceImageType(imageType)) {
      if (analysisStatus === "pending" || analysisStatus === "analyzing") {
        current.hasInFlightPriceImage = true;
      }
      const photoQuality = record.photo_quality && typeof record.photo_quality === "object" && !Array.isArray(record.photo_quality)
        ? record.photo_quality as { status?: unknown }
        : null;
      const failed = analysisStatus === "failed" || photoQuality?.status === "retake_required";
      if (failed) current.failedPhotoCount += 1;
    }
    metrics.set(visitId, current);
  }
  return metrics;
}

async function loadActiveRerunVisitIds(params: {
  supabase: ReturnType<typeof createSupabaseServiceClient>;
  visitIds: string[];
}) {
  if (params.visitIds.length === 0) return new Set<string>();
  const visitIdSet = new Set(params.visitIds);
  const { data, error } = await params.supabase
    .from("store_visit_rerun_jobs")
    .select("child_ai_jobs,selector,progress")
    .in("status", ["queued", "running"])
    .order("created_at", { ascending: false })
    .limit(20);
  if (error || !data?.length) return new Set<string>();

  const inFlight = new Set<string>();
  for (const row of data) {
    const record = row as {
      child_ai_jobs?: unknown;
      selector?: unknown;
      progress?: unknown;
    };
    if (Array.isArray(record.child_ai_jobs)) {
      for (const child of record.child_ai_jobs) {
        const visitId = String((child as { visitId?: unknown })?.visitId ?? "").trim();
        if (visitId && visitIdSet.has(visitId)) inFlight.add(visitId);
      }
    }
    const selector = record.selector && typeof record.selector === "object" && !Array.isArray(record.selector)
      ? record.selector as Record<string, unknown>
      : null;
    const selectorVisitIds = Array.isArray(selector?.visitIds) ? selector.visitIds : [];
    const progress = record.progress && typeof record.progress === "object" && !Array.isArray(record.progress)
      ? record.progress as Record<string, unknown>
      : null;
    const settled = new Set<string>([
      ...(Array.isArray(progress?.matched_visit_ids) ? progress.matched_visit_ids.map((id) => String(id)) : []),
      ...(Array.isArray(progress?.skipped_visit_ids) ? progress.skipped_visit_ids.map((id) => String(id)) : []),
      ...(Array.isArray(progress?.permanently_failed_visit_ids) ? progress.permanently_failed_visit_ids.map((id) => String(id)) : []),
    ]);
    for (const rawId of selectorVisitIds) {
      const visitId = String(rawId ?? "").trim();
      if (visitId && visitIdSet.has(visitId) && !settled.has(visitId)) inFlight.add(visitId);
    }
  }
  return inFlight;
}

async function loadPriceHandlingCandidatesForVisits(params: {
  supabase: ReturnType<typeof createSupabaseServiceClient>;
  visitIds: string[];
}) {
  if (params.visitIds.length === 0) return new Map<string, AiPriceCandidate[]>();
  // Keep null lifecycle rows: SQL `NOT IN (...)` would drop NULL and hide approved counts.
  const { data, error } = await params.supabase
    .from("ai_price_candidates")
    .select("visit_id,status,review_decision,quality_gate_status,quality_gate_attempt_count,h5_lifecycle_status")
    .in("visit_id", params.visitIds)
    .or("h5_lifecycle_status.is.null,h5_lifecycle_status.not.in.(deleted,replaced,reanalyzed)");
  if (error) throw new Error(error.message);

  const byVisitId = new Map<string, AiPriceCandidate[]>();
  for (const row of (data ?? []) as AiPriceCandidate[]) {
    if (!row.visit_id) continue;
    if (row.h5_lifecycle_status === "deleted" || row.h5_lifecycle_status === "replaced" || row.h5_lifecycle_status === "reanalyzed") continue;
    const candidates = byVisitId.get(row.visit_id) ?? [];
    candidates.push(row);
    byVisitId.set(row.visit_id, candidates);
  }
  return byVisitId;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("user_id")?.trim() || "";
    const page = readPositiveInt(searchParams.get("page"), 1);
    const pageSize = Math.min(readPositiveInt(searchParams.get("page_size"), defaultPageSize), maxPageSize);
    const from = (page - 1) * pageSize;

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
    const todayVisitDate = todayVisitDateValue();
    const { start, end } = todayRange();
    const [visitsResult, visitDateRowsResult, legacyRowsResult] = await Promise.all([
      loadVisitPageRows({
        supabase,
        userId,
        from,
        pageSize,
      }),
      loadTodayRowsWithVisitDate({
        supabase,
        userId,
        todayVisitDate,
      }),
      loadLegacyTodayRowsWithoutVisitDate({
        supabase,
        userId,
        start,
        end,
      }),
    ]);

    if (visitsResult.error) {
      return Response.json({ error: visitsResult.error.message }, { status: 400 });
    }

    const todayRows = [...visitDateRowsResult.rows, ...legacyRowsResult.rows];

    const rows = visitsResult.rows;
    const fetchTo = from + pageSize;
    const hasNext = rows.length > fetchTo;
    const pagedRows = rows.slice(from, from + pageSize);
    const visitIds = pagedRows.map((visit) => visit.id);
    const [activeJobsByVisitId, imageMetricsByVisitId, candidatesByVisitId, rerunInFlightVisitIds] = await Promise.all([
      loadActiveAiJobsForVisits({
        supabase,
        visitIds,
      }),
      loadVisitImageMetricsByVisitId({
        supabase,
        visitIds,
      }),
      loadPriceHandlingCandidatesForVisits({
        supabase,
        visitIds,
      }),
      loadActiveRerunVisitIds({
        supabase,
        visitIds,
      }),
    ]);
    const priceHandlingByVisitId = new Map(pagedRows.map((visit) => {
      const activeAiJob = activeJobsByVisitId.get(visit.id) ?? null;
      return [visit.id, summarizeVisitPriceHandling({
        analysis_status: visit.analysis_status,
        active_job_status: activeAiJob?.status ?? null,
        candidates: candidatesByVisitId.get(visit.id) ?? [],
      })] as const;
    }));

    return Response.json({
      visits: pagedRows.map((visit) => serializeVisit(
        visit,
        activeJobsByVisitId.get(visit.id) ?? null,
        imageMetricsByVisitId,
        priceHandlingByVisitId.get(visit.id),
        rerunInFlightVisitIds.has(visit.id),
      )),
      pagination: {
        page,
        page_size: pageSize,
        total: from + pagedRows.length + (hasNext ? 1 : 0),
        has_next: hasNext,
      },
      today_count: new Set(todayRows.map(storeDedupKey)).size,
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}

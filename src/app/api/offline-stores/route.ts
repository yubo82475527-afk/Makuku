import { revalidatePath } from "next/cache";
import { formReturnRedirect, readRequestBody } from "@/lib/request";
import { demoOfflineStores } from "@/lib/demo-data";
import { getOfflineStores } from "@/lib/data";
import { createSupabaseServiceClient, hasSupabaseServiceConfig } from "@/lib/supabase";
import { requireAdminSession, requireAppSession } from "@/lib/auth-session";
import type { OfflineStore } from "@/lib/types";

function isMissingSchemaError(error: { message?: string } | null) {
  return Boolean(error?.message?.includes("Could not find the table") || error?.message?.includes("schema cache"));
}

function clean(value: unknown) {
  return String(value ?? "").trim();
}

const externalMdFallbackChannelType = "BABY SHOP";

function resolveOfflineStoreChannelType(value: unknown) {
  const channelType = clean(value);
  return channelType && channelType !== "other" ? channelType : externalMdFallbackChannelType;
}

function splitRegionText(value: string) {
  if (!value.includes("/")) return null;
  const parts = value.split("/").map((part) => part.trim()).filter(Boolean).slice(0, 3);
  if (parts.length < 2) return null;
  return {
    province: parts[0] ?? null,
    cityName: parts[1] ?? null,
    district: parts[2] ?? null,
  };
}

function resolveStoreRegion(body: Record<string, unknown>) {
  const rawProvince = clean(body.province);
  const rawCityName = clean(body.city_name ?? body.cityName);
  const rawCity = clean(body.city);
  const rawDistrict = clean(body.district);
  const compoundRegion = [rawProvince, rawCityName, rawCity].map(splitRegionText).find(Boolean);

  const province = (compoundRegion?.province ?? rawProvince) || null;
  const rawResolvedCityName = compoundRegion?.cityName ?? rawCityName;
  const cityName = (rawResolvedCityName || rawCity) || null;
  const district = (compoundRegion?.district ?? rawDistrict) || null;
  const city = cityName ?? rawCity ?? province ?? "";

  return { city, province, cityName, district };
}

function cleanOptionalNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isLocationColumnError(error: { message?: string } | null) {
  const message = error?.message ?? "";
  return message.includes("latitude") || message.includes("longitude") || message.includes("location_accuracy_m") || message.includes("location_captured_at");
}

function isStoreRegionColumnError(error: { message?: string } | null) {
  const message = error?.message ?? "";
  return message.includes("province") || message.includes("city_name") || message.includes("district") || message.includes("schema cache");
}

function isStoreStatusColumnError(error: { message?: string } | null) {
  const message = error?.message ?? "";
  return message.includes("status") || message.includes("disabled_at") || message.includes("schema cache");
}

function isStoreCreatorColumnError(error: { message?: string } | null) {
  const message = error?.message ?? "";
  return message.includes("created_by") || message.includes("created_by_user_id") || message.includes("created_by_name") || message.includes("schema cache");
}

function isLegacyDisabledColumnError(error: { message?: string } | null) {
  const message = error?.message ?? "";
  return message.includes("deleted_at") || message.includes("schema cache");
}

function parseStoreIds(body: { id?: unknown; ids?: unknown }, queryId = "") {
  const bodyIds = Array.isArray(body.ids) ? body.ids : body.id ? [body.id] : [];
  return Array.from(new Set([queryId, ...bodyIds].map((id) => String(id).trim()).filter(Boolean)));
}

type StoreRef = {
  id: string;
  name: string;
  city: string;
  province?: string | null;
  city_name?: string | null;
  district?: string | null;
  channel_type: string;
  channel_id?: string | null;
  address?: string | null;
};

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function parseStoreRefs(body: { stores?: unknown }) {
  if (!Array.isArray(body.stores)) return [];
  const refs: StoreRef[] = [];
  for (const item of body.stores) {
    if (!item || typeof item !== "object") continue;
    const ref = item as Record<string, unknown>;
    const id = String(ref.id ?? "").trim();
    const name = String(ref.name ?? "").trim();
    const city = String(ref.city ?? "").trim();
    const channelType = String(ref.channel_type ?? "").trim() || "other";
    if (!id || !name || !city) continue;
    refs.push({
      id,
      name,
      city,
      province: typeof ref.province === "string" && ref.province.trim() ? ref.province.trim() : null,
      city_name: typeof ref.city_name === "string" && ref.city_name.trim() ? ref.city_name.trim() : null,
      district: typeof ref.district === "string" && ref.district.trim() ? ref.district.trim() : null,
      channel_type: channelType,
      channel_id: typeof ref.channel_id === "string" && ref.channel_id.trim() ? ref.channel_id.trim() : null,
      address: typeof ref.address === "string" && ref.address.trim() ? ref.address.trim() : null,
    });
  }
  return refs;
}

function isStoreStatus(value: unknown): value is "enabled" | "disabled" {
  return value === "enabled" || value === "disabled";
}

function hasOrganizationPatch(body: Record<string, unknown>) {
  return Object.prototype.hasOwnProperty.call(body, "organization_id");
}

function isDisabledStore(store: Pick<OfflineStore, "status" | "disabled_at" | "deleted_at">) {
  return store.status === "disabled" || Boolean(store.disabled_at || store.deleted_at);
}

function cleanLimit(value: string | null) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 20;
  return Math.max(1, Math.min(100, Math.floor(parsed)));
}

function filterDemoStoreMasterOptions(q: string, limit: number) {
  const keyword = q.toLowerCase();
  return demoOfflineStores
    .filter((store) => !isDisabledStore(store))
    .filter((store) => !keyword || [store.name, store.city, store.province, store.city_name, store.district].some((value) => (value ?? "").toLowerCase().includes(keyword)))
    .slice(0, limit);
}

async function readStoreMasterOptions({ q, limit }: { q: string; limit: number }) {
  if (!hasSupabaseServiceConfig()) return { stores: filterDemoStoreMasterOptions(q, limit), error: null, demo: true };

  const supabase = createSupabaseServiceClient();
  const keyword = q.trim();
  let query = supabase
    .from("offline_stores")
    .select("id,name,city,province,city_name,district,channel_type,channel_id,address,latitude,longitude,location_accuracy_m,location_captured_at,status,disabled_at,deleted_at,created_by,created_by_user_id,created_by_name,created_at,channels(id,code,name,type)")
    .order("name")
    .limit(limit);

  if (keyword) query = query.or(`name.ilike.%${keyword}%,city.ilike.%${keyword}%,province.ilike.%${keyword}%,city_name.ilike.%${keyword}%,district.ilike.%${keyword}%`);

  const initial = await query;
  let data = initial.data as OfflineStore[] | null;
  let error: { message: string } | null = initial.error;

  if (error?.message.includes("channels") || error?.message.includes("schema cache")) {
    let legacyQuery = supabase
      .from("offline_stores")
      .select("id,name,city,province,city_name,district,channel_type,channel_id,address,latitude,longitude,location_accuracy_m,location_captured_at,status,disabled_at,deleted_at,created_by,created_by_user_id,created_by_name,created_at")
      .order("name")
      .limit(limit);
    if (keyword) legacyQuery = legacyQuery.or(`name.ilike.%${keyword}%,city.ilike.%${keyword}%,province.ilike.%${keyword}%,city_name.ilike.%${keyword}%,district.ilike.%${keyword}%`);
    const legacy = await legacyQuery;
    data = legacy.data as OfflineStore[] | null;
    error = legacy.error;
  }

  if (isStoreStatusColumnError(error)) {
    let noStatusQuery = supabase
      .from("offline_stores")
      .select("id,name,city,province,city_name,district,channel_type,channel_id,address,latitude,longitude,location_accuracy_m,location_captured_at,created_at,channels(id,code,name,type)")
      .order("name")
      .limit(limit);
    if (keyword) noStatusQuery = noStatusQuery.or(`name.ilike.%${keyword}%,city.ilike.%${keyword}%,province.ilike.%${keyword}%,city_name.ilike.%${keyword}%,district.ilike.%${keyword}%`);
    const noStatus = await noStatusQuery;
    data = noStatus.data as OfflineStore[] | null;
    error = noStatus.error;
  }

  if (isStoreRegionColumnError(error)) {
    let legacyRegionQuery = supabase
      .from("offline_stores")
      .select("id,name,city,channel_type,channel_id,address,latitude,longitude,location_accuracy_m,location_captured_at,status,disabled_at,deleted_at,created_by,created_by_user_id,created_by_name,created_at,channels(id,code,name,type)")
      .order("name")
      .limit(limit);
    if (keyword) legacyRegionQuery = legacyRegionQuery.or(`name.ilike.%${keyword}%,city.ilike.%${keyword}%`);
    const legacyRegion = await legacyRegionQuery;
    data = legacyRegion.data as OfflineStore[] | null;
    error = legacyRegion.error;
  }

  if (error) return { stores: filterDemoStoreMasterOptions(q, limit), error: error.message, demo: true };
  return { stores: ((data ?? []) as OfflineStore[]).filter((store) => !isDisabledStore(store)), error: null, demo: false };
}

function revalidateOfflineStoreViews() {
  revalidatePath("/zh/dashboard");
  revalidatePath("/en/dashboard");
  revalidatePath("/zh/offline-stores");
  revalidatePath("/en/offline-stores");
  revalidatePath("/zh/mobile/offline-capture");
  revalidatePath("/en/mobile/offline-capture");
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q")?.trim() ?? "";
    const scope = searchParams.get("scope")?.trim() ?? "";
    const limit = cleanLimit(searchParams.get("limit"));

    if (scope === "master") {
      const result = await readStoreMasterOptions({ q, limit });
      return Response.json({ stores: result.stores, demo: result.demo, error: result.error }, { status: result.error && !result.demo ? 400 : 200 });
    }

    const result = await getOfflineStores();
    const keyword = q.toLowerCase();
    const stores = result.data
      .filter((store) => !keyword || store.name.toLowerCase().includes(keyword) || store.city.toLowerCase().includes(keyword))
      .slice(0, 100);

    if (result.error && result.isDemo) return Response.json({ error: result.error, stores, demo: true }, { status: 400 });
    return Response.json({ stores, demo: result.isDemo, error: result.error });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAppSession(request);
    if (auth.response) return auth.response;
    const { body, isForm } = await readRequestBody(request);
    const name = String(body.name ?? body.external_store_name ?? "").trim();
    const { province, cityName, district } = resolveStoreRegion(body);
    const legacyCity = cityName;
    const channelId = String(body.channel_id ?? "").trim() || null;
    const channelTypeFromBody = String(body.channel_type ?? "").trim();
    const externalStoreId = String(body.external_store_id ?? "").trim() || null;
    const externalOrgId = String(body.external_org_id ?? "").trim() || null;
    const externalOrgName = String(body.external_org_name ?? "").trim() || null;
    const externalMdId = String(body.external_md_id ?? "").trim() || null;
    const externalMdName = String(body.external_md_name ?? "").trim() || null;
    const externalSource = "external_md";
    const address = String(body.address ?? "").trim();
    const latitude = cleanOptionalNumber(body.latitude);
    const longitude = cleanOptionalNumber(body.longitude);
    const locationAccuracyM = cleanOptionalNumber(body.location_accuracy_m);
    const locationCapturedAt = String(body.location_captured_at ?? "").trim() || null;
    const createdByUserId = String(body.created_by_user_id ?? body.createdByUserId ?? auth.session.id).trim() || null;
    const createdByName = String(body.created_by_name ?? body.createdByName ?? auth.session.displayName).trim() || null;
    const createdBy = String(body.created_by ?? createdByName ?? auth.session.displayName).trim() || null;

    if (!name || !cityName || !externalStoreId || !externalMdId) {
      return Response.json({ error: "Missing required fields: name, city_name, external_store_id, external_md_id" }, { status: 400 });
    }

    const supabase = createSupabaseServiceClient();
    const channelType = resolveOfflineStoreChannelType(channelTypeFromBody);

    if (externalSource && externalStoreId) {
      const existing = await supabase
        .from("offline_stores")
        .select("*, channels(id,code,name,type)")
        .eq("external_source", externalSource)
        .eq("external_store_id", externalStoreId)
        .maybeSingle();
      if (existing.data) {
        return Response.json({ store: existing.data });
      }
    }

    let { data, error } = await supabase
      .from("offline_stores")
      .insert({
        name,
        city: legacyCity,
        province,
        city_name: cityName,
        district,
        channel_type: channelType,
        channel_id: channelId,
        address: address || null,
        latitude,
        longitude,
        location_accuracy_m: locationAccuracyM,
        location_captured_at: locationCapturedAt,
        created_by: createdBy,
        created_by_user_id: createdByUserId,
        created_by_name: createdByName,
        external_store_id: externalStoreId,
        external_org_id: externalOrgId,
        external_org_name: externalOrgName,
        external_md_id: externalMdId,
        external_md_name: externalMdName,
        external_source: externalSource,
        external_synced_at: new Date().toISOString(),
      })
      .select("*, channels(id,code,name,type)")
      .single();

    if (isStoreCreatorColumnError(error)) {
      const noCreator = await supabase
        .from("offline_stores")
        .insert({
          name,
          city: legacyCity,
          province,
          city_name: cityName,
          district,
          channel_type: channelType,
          channel_id: channelId,
          address: address || null,
          latitude,
          longitude,
          location_accuracy_m: locationAccuracyM,
          location_captured_at: locationCapturedAt,
          external_store_id: externalStoreId,
          external_org_id: externalOrgId,
          external_org_name: externalOrgName,
          external_md_id: externalMdId,
          external_md_name: externalMdName,
          external_source: externalSource,
          external_synced_at: new Date().toISOString(),
        })
        .select("*, channels(id,code,name,type)")
        .single();
      data = noCreator.data;
      error = noCreator.error;
    }

    if (isLocationColumnError(error)) {
      const noLocation = await supabase
        .from("offline_stores")
        .insert({
          name,
          city: legacyCity,
          province,
          city_name: cityName,
          district,
          channel_type: channelType,
          channel_id: channelId,
          address: address || null,
          created_by: createdBy,
          created_by_user_id: createdByUserId,
          created_by_name: createdByName,
          external_store_id: externalStoreId,
          external_org_id: externalOrgId,
          external_org_name: externalOrgName,
          external_md_id: externalMdId,
          external_md_name: externalMdName,
          external_source: externalSource,
          external_synced_at: new Date().toISOString(),
        })
        .select("*, channels(id,code,name,type)")
        .single();
      data = noLocation.data;
      error = noLocation.error;
    }

    if (isStoreRegionColumnError(error)) {
      const noRegion = await supabase
        .from("offline_stores")
        .insert({
          name,
          city: legacyCity,
          channel_type: channelType,
          channel_id: channelId,
          address: address || null,
          latitude,
          longitude,
          location_accuracy_m: locationAccuracyM,
          location_captured_at: locationCapturedAt,
          created_by: createdBy,
          created_by_user_id: createdByUserId,
          created_by_name: createdByName,
          external_store_id: externalStoreId,
          external_org_id: externalOrgId,
          external_org_name: externalOrgName,
          external_md_id: externalMdId,
          external_md_name: externalMdName,
          external_source: externalSource,
          external_synced_at: new Date().toISOString(),
        })
        .select("*, channels(id,code,name,type)")
        .single();
      data = noRegion.data;
      error = noRegion.error;
    }

    if (error?.message.includes("channel_id") || error?.message.includes("channels")) {
      const legacy = await supabase
        .from("offline_stores")
        .insert({
          name,
          city: legacyCity,
          province,
          city_name: cityName,
          district,
          channel_type: channelType,
          address: address || null,
          external_store_id: externalStoreId,
          external_org_id: externalOrgId,
          external_org_name: externalOrgName,
          external_md_id: externalMdId,
          external_md_name: externalMdName,
          external_source: externalSource,
          external_synced_at: new Date().toISOString(),
        })
        .select("*")
        .single();
      data = legacy.data;
      error = legacy.error;
    }

    if (isStoreCreatorColumnError(error)) {
      const noCreatorLegacy = await supabase
        .from("offline_stores")
        .insert({
          name,
          city: legacyCity,
          province,
          city_name: cityName,
          district,
          channel_type: channelType,
          channel_id: channelId,
          address: address || null,
          external_store_id: externalStoreId,
          external_org_id: externalOrgId,
          external_org_name: externalOrgName,
          external_md_id: externalMdId,
          external_md_name: externalMdName,
          external_source: externalSource,
          external_synced_at: new Date().toISOString(),
        })
        .select("*, channels(id,code,name,type)")
        .single();
      data = noCreatorLegacy.data;
      error = noCreatorLegacy.error;
    }

    if (isMissingSchemaError(error) && process.env.NODE_ENV !== "production") {
      return Response.json({
        store: {
          id: `demo-store-${Date.now()}`,
          name,
          city: legacyCity,
          province,
          city_name: cityName,
          district,
          channel_type: channelType,
          channel_id: channelId,
          address: address || null,
          latitude,
          longitude,
          location_accuracy_m: locationAccuracyM,
          location_captured_at: locationCapturedAt,
          created_by: createdBy,
          created_by_user_id: createdByUserId,
          created_by_name: createdByName,
          external_store_id: externalStoreId,
          external_org_id: externalOrgId,
          external_org_name: externalOrgName,
          external_md_id: externalMdId,
          external_md_name: externalMdName,
          external_source: externalSource,
          external_synced_at: new Date().toISOString(),
        },
        demo: true,
      });
    }
    if (error) return Response.json({ error: error.message }, { status: 400 });

    revalidatePath("/zh/dashboard");
    revalidatePath("/en/dashboard");
    revalidatePath("/zh/offline-stores");
    revalidatePath("/en/offline-stores");

    if (isForm) return formReturnRedirect(request, body, "/offline-stores");
    return Response.json({ store: data });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const auth = await requireAdminSession(request);
    if (auth.response) return auth.response;
    const { searchParams } = new URL(request.url);
    const bodyResult = request.headers.get("content-type")?.includes("application/json")
      ? await readRequestBody(request)
      : { body: {}, isForm: false };
    const body = bodyResult.body as { id?: unknown; ids?: unknown; stores?: unknown };
    const queryId = searchParams.get("id")?.trim() || "";
    const ids = parseStoreIds(body, queryId);
    const refs = parseStoreRefs(body);
    const uuidIds = ids.filter(isUuid);
    const derivedRefs = refs.filter((store) => !isUuid(store.id));
    if (uuidIds.length === 0 && derivedRefs.length === 0) return Response.json({ error: "Missing store id" }, { status: 400 });

    const supabase = createSupabaseServiceClient();
    const disabledAt = new Date().toISOString();
    let data: { id: string; status: "enabled" | "disabled"; disabled_at: string | null }[] | null = [];
    let error: { message: string } | null = null;

    if (uuidIds.length > 0) {
      const updateResult = await supabase
        .from("offline_stores")
        .update({ status: "disabled", disabled_at: disabledAt })
        .in("id", uuidIds)
        .neq("status", "disabled")
        .select("id,status,disabled_at")
        .returns<{ id: string; status: "enabled" | "disabled"; disabled_at: string | null }[]>();
      data = updateResult.data;
      error = updateResult.error;
    }

    if (!error && derivedRefs.length > 0) {
      const derivedDisablePayloads = derivedRefs.map((store) => ({
        name: store.name,
        city: store.city,
        province: store.province ?? null,
        city_name: store.city_name ?? null,
        district: store.district ?? null,
        channel_type: store.channel_type,
        channel_id: store.channel_id,
        address: store.address,
        status: "disabled",
        disabled_at: disabledAt,
        deleted_at: disabledAt,
      }));
      const insertResult = await supabase
        .from("offline_stores")
        .insert(derivedDisablePayloads)
        .select("id,status,disabled_at")
        .returns<{ id: string; status: "enabled" | "disabled"; disabled_at: string | null }[]>();
      data = [...(data ?? []), ...(insertResult.data ?? [])];
      error = insertResult.error;
    }

    if (isStoreStatusColumnError(error)) {
      data = [];
      error = null;
      if (uuidIds.length > 0) {
        const legacy = await supabase
          .from("offline_stores")
          .update({ deleted_at: disabledAt })
          .in("id", uuidIds)
          .is("deleted_at", null)
          .select("id,deleted_at")
          .returns<{ id: string; deleted_at: string | null }[]>();
        data = legacy.data?.map((store) => ({ id: store.id, status: "disabled", disabled_at: store.deleted_at })) ?? null;
        error = legacy.error;
      }
      if (!error && derivedRefs.length > 0) {
        const legacyDerivedPayloads = derivedRefs.map((store) => ({
          name: store.name,
          city: store.city,
          province: store.province ?? null,
          city_name: store.city_name ?? null,
          district: store.district ?? null,
          channel_type: store.channel_type,
          channel_id: store.channel_id,
          address: store.address,
          deleted_at: disabledAt,
        }));
        const legacyInsert = await supabase
          .from("offline_stores")
          .insert(legacyDerivedPayloads)
          .select("id,deleted_at")
          .returns<{ id: string; deleted_at: string | null }[]>();
        data = [...(data ?? []), ...((legacyInsert.data ?? []).map((store) => ({ id: store.id, status: "disabled" as const, disabled_at: store.deleted_at })))];
        error = legacyInsert.error;
      }
      if (isLegacyDisabledColumnError(error)) {
        return Response.json({ error: "Store status schema is not migrated. Run the latest Supabase migrations." }, { status: 400 });
      }
    }

    if (error) return Response.json({ error: error.message }, { status: 400 });
    if (!data || data.length === 0) return Response.json({ error: "Store not found" }, { status: 404 });

    revalidateOfflineStoreViews();

    return Response.json({ stores: data, store: data[0] ?? null, disabled_count: data.length, deleted_count: data.length });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await requireAdminSession(request);
    if (auth.response) return auth.response;
    const { body } = await readRequestBody(request);
    const patchBody = body as Record<string, unknown>;
    const ids = parseStoreIds(patchBody as { id?: unknown; ids?: unknown });
    const uuidIds = ids.filter(isUuid);
    const status = isStoreStatus(patchBody.status) ? patchBody.status : null;
    if (uuidIds.length === 0) return Response.json({ error: "Missing store id" }, { status: 400 });

    const supabase = createSupabaseServiceClient();
    if (hasOrganizationPatch(patchBody)) {
      const organizationId = clean(patchBody.organization_id) || null;
      const { data, error } = await supabase
        .from("offline_stores")
        .update({ organization_id: organizationId })
        .in("id", uuidIds)
        .select("id,organization_id")
        .returns<{ id: string; organization_id: string | null }[]>();

      if (error) return Response.json({ error: error.message }, { status: 400 });
      if (!data || data.length === 0) return Response.json({ error: "Store not found" }, { status: 404 });

      revalidateOfflineStoreViews();

      return Response.json({ stores: data, updated_count: data.length });
    }

    if (!status) return Response.json({ error: "Missing valid status" }, { status: 400 });
    const disabledAt = status === "disabled" ? new Date().toISOString() : null;
    const { data, error } = await supabase
      .from("offline_stores")
      .update({ status, disabled_at: disabledAt, deleted_at: null })
      .in("id", uuidIds)
      .select("id,status,disabled_at")
      .returns<{ id: string; status: "enabled" | "disabled"; disabled_at: string | null }[]>();

    if (isStoreStatusColumnError(error)) {
      return Response.json({ error: "Store status schema is not migrated. Run the latest Supabase migrations." }, { status: 400 });
    }
    if (error) return Response.json({ error: error.message }, { status: 400 });
    if (!data || data.length === 0) return Response.json({ error: "Store not found" }, { status: 404 });

    revalidateOfflineStoreViews();

    return Response.json({ stores: data, updated_count: data.length });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}

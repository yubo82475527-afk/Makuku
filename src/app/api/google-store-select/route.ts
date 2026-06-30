import { revalidatePath } from "next/cache";
import { requireAppSession } from "@/lib/auth-session";
import { readRequestBody } from "@/lib/request";
import { createSupabaseServiceClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const storeSelectFields = "id,name,city,province,city_name,district,google_place_id,channel_type,channel_id,address,latitude,longitude,location_accuracy_m,location_captured_at,status,disabled_at,deleted_at,created_by,created_by_user_id,created_by_name,external_store_id,external_org_id,external_org_name,external_md_id,external_md_name,external_source,external_synced_at,created_at,channels(id,code,name,type)";
const storeSelectFieldsWithoutGooglePlaceId = "id,name,city,province,city_name,district,channel_type,channel_id,address,latitude,longitude,location_accuracy_m,location_captured_at,status,disabled_at,deleted_at,created_by,created_by_user_id,created_by_name,external_store_id,external_org_id,external_org_name,external_md_id,external_md_name,external_source,external_synced_at,created_at,channels(id,code,name,type)";
const storeSelectFieldsWithoutGooglePlaceIdOrChannels = "id,name,city,province,city_name,district,channel_type,channel_id,address,latitude,longitude,location_accuracy_m,location_captured_at,status,disabled_at,deleted_at,created_by,created_by_user_id,created_by_name,external_store_id,external_org_id,external_org_name,external_md_id,external_md_name,external_source,external_synced_at,created_at";

function clean(value: unknown) {
  return String(value ?? "").trim();
}

const externalMdFallbackChannelType = "BABY SHOP";

function cleanOptionalNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isGooglePlaceColumnError(error: { message?: string } | null) {
  return (error?.message ?? "").includes("google_place_id");
}

function isChannelRelationError(error: { message?: string } | null) {
  const message = error?.message ?? "";
  return message.includes("channels") || message.includes("schema cache");
}

function revalidateOfflineStoreViews() {
  revalidatePath("/zh/dashboard");
  revalidatePath("/en/dashboard");
  revalidatePath("/zh/offline-stores");
  revalidatePath("/en/offline-stores");
  revalidatePath("/zh/mobile/offline-capture");
  revalidatePath("/en/mobile/offline-capture");
}

export async function POST(request: Request) {
  try {
    const auth = await requireAppSession(request);
    if (auth.response) return auth.response;
    const { body } = await readRequestBody(request);

    const googlePlaceId = clean(body.google_place_id);
    const name = clean(body.name);
    const province = clean(body.province) || null;
    const cityName = clean(body.cityName ?? body.city_name ?? body.city) || null;
    const district = clean(body.district) || null;
    const legacyCity = cityName;
    const address = clean(body.address) || null;
    const latitude = cleanOptionalNumber(body.latitude);
    const longitude = cleanOptionalNumber(body.longitude);
    const externalStoreId = clean(body.external_store_id);
    const externalOrgId = clean(body.external_org_id) || null;
    const externalOrgName = clean(body.external_org_name) || null;
    const externalMdId = clean(body.external_md_id) || null;
    const externalMdName = clean(body.external_md_name) || null;

    if (!googlePlaceId || !name || !cityName || !externalStoreId || !externalMdId) {
      return Response.json({ error: "Missing required fields: google_place_id, name, city_name, external_store_id, external_md_id" }, { status: 400 });
    }

    const supabase = createSupabaseServiceClient();
    const existing = await supabase
      .from("offline_stores")
      .select(storeSelectFields)
      .eq("google_place_id", googlePlaceId)
      .maybeSingle();

    if (isChannelRelationError(existing.error)) {
      const existingWithoutChannels = await supabase
        .from("offline_stores")
        .select(storeSelectFieldsWithoutGooglePlaceId)
        .eq("google_place_id", googlePlaceId)
        .maybeSingle();
      if (existingWithoutChannels.error && !isGooglePlaceColumnError(existingWithoutChannels.error)) {
        return Response.json({ error: existingWithoutChannels.error.message }, { status: 400 });
      }
      if (existingWithoutChannels.data) {
        return Response.json({ store: existingWithoutChannels.data });
      }
    }

    if (existing.error && !isGooglePlaceColumnError(existing.error)) {
      return Response.json({ error: existing.error.message }, { status: 400 });
    }
    if (existing.data) {
      return Response.json({ store: existing.data });
    }

    const externalExisting = await supabase
      .from("offline_stores")
      .select(storeSelectFields)
      .eq("external_source", "external_md")
      .eq("external_store_id", externalStoreId)
      .maybeSingle();

    if (isChannelRelationError(externalExisting.error)) {
      const externalExistingWithoutChannels = await supabase
        .from("offline_stores")
        .select(storeSelectFieldsWithoutGooglePlaceId)
        .eq("external_source", "external_md")
        .eq("external_store_id", externalStoreId)
        .maybeSingle();
      if (externalExistingWithoutChannels.error) {
        return Response.json({ error: externalExistingWithoutChannels.error.message }, { status: 400 });
      }
      if (externalExistingWithoutChannels.data) {
        return Response.json({ store: externalExistingWithoutChannels.data });
      }
    }

    if (externalExisting.error) {
      return Response.json({ error: externalExisting.error.message }, { status: 400 });
    }
    if (externalExisting.data) {
      return Response.json({ store: externalExisting.data });
    }
    const channelType = externalMdFallbackChannelType;
    const channelIdToSave = null;

    const insertResult = await supabase
      .from("offline_stores")
      .insert({
        name,
        city: legacyCity,
        province,
        city_name: cityName,
        district,
        google_place_id: googlePlaceId,
        channel_type: channelType,
        channel_id: channelIdToSave,
        external_store_id: externalStoreId,
        external_org_id: externalOrgId,
        external_org_name: externalOrgName,
        external_md_id: externalMdId,
        external_md_name: externalMdName,
        external_source: "external_md",
        external_synced_at: new Date().toISOString(),
        address,
        latitude,
        longitude,
        created_by: auth.session.displayName,
        created_by_user_id: auth.session.id,
        created_by_name: auth.session.displayName,
      })
      .select(storeSelectFields)
      .single();
    let data = insertResult.data as Record<string, unknown> | null;
    let error = insertResult.error;

    if (isChannelRelationError(error)) {
      const noChannelRelation = await supabase
        .from("offline_stores")
        .insert({
          name,
          city: legacyCity,
          province,
          city_name: cityName,
          district,
          google_place_id: googlePlaceId,
          channel_type: channelType,
          channel_id: channelIdToSave,
          external_store_id: externalStoreId,
          external_org_id: externalOrgId,
          external_org_name: externalOrgName,
          external_md_id: externalMdId,
          external_md_name: externalMdName,
          external_source: "external_md",
          external_synced_at: new Date().toISOString(),
          address,
          latitude,
          longitude,
          created_by: auth.session.displayName,
          created_by_user_id: auth.session.id,
          created_by_name: auth.session.displayName,
        })
        .select("id,name,city,province,city_name,district,google_place_id,channel_type,channel_id,address,latitude,longitude,location_accuracy_m,location_captured_at,status,disabled_at,deleted_at,created_by,created_by_user_id,created_by_name,external_store_id,external_org_id,external_org_name,external_md_id,external_md_name,external_source,external_synced_at,created_at")
        .single();
      data = noChannelRelation.data as Record<string, unknown> | null;
      error = noChannelRelation.error;
    }

    if (isGooglePlaceColumnError(error)) {
      const legacy = await supabase
        .from("offline_stores")
        .insert({
          name,
          city: legacyCity,
          province,
          city_name: cityName,
          district,
          channel_type: channelType,
          channel_id: channelIdToSave,
          external_store_id: externalStoreId,
          external_org_id: externalOrgId,
          external_org_name: externalOrgName,
          external_md_id: externalMdId,
          external_md_name: externalMdName,
          external_source: "external_md",
          external_synced_at: new Date().toISOString(),
          address,
          latitude,
          longitude,
          created_by: auth.session.displayName,
          created_by_user_id: auth.session.id,
          created_by_name: auth.session.displayName,
        })
        .select(storeSelectFieldsWithoutGooglePlaceIdOrChannels)
        .single();
      data = legacy.data as Record<string, unknown> | null;
      error = legacy.error;
    }

    if (error) return Response.json({ error: error.message }, { status: 400 });

    revalidateOfflineStoreViews();
    return Response.json({ store: data });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}

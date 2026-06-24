import { revalidatePath } from "next/cache";
import { requireAppSession } from "@/lib/auth-session";
import { readRequestBody } from "@/lib/request";
import { createSupabaseServiceClient } from "@/lib/supabase";
import { organizationAssignmentPatch, resolveOrganizationForRegion } from "@/lib/organizations";

export const dynamic = "force-dynamic";

const storeSelectFields = "id,name,city,province,city_name,district,google_place_id,channel_type,channel_id,address,latitude,longitude,location_accuracy_m,location_captured_at,status,disabled_at,deleted_at,created_by,created_by_user_id,created_by_name,created_at,channels(id,code,name,type)";
const storeSelectFieldsWithoutGooglePlaceId = "id,name,city,province,city_name,district,channel_type,channel_id,address,latitude,longitude,location_accuracy_m,location_captured_at,status,disabled_at,deleted_at,created_by,created_by_user_id,created_by_name,created_at,channels(id,code,name,type)";
const storeSelectFieldsWithoutGooglePlaceIdOrChannels = "id,name,city,province,city_name,district,channel_type,channel_id,address,latitude,longitude,location_accuracy_m,location_captured_at,status,disabled_at,deleted_at,created_by,created_by_user_id,created_by_name,created_at";

function clean(value: unknown) {
  return String(value ?? "").trim();
}

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
    const city = clean(body.city);
    const province = clean(body.province) || null;
    const cityName = clean(body.cityName ?? body.city_name) || null;
    const district = clean(body.district) || null;
    const address = clean(body.address) || null;
    const latitude = cleanOptionalNumber(body.latitude);
    const longitude = cleanOptionalNumber(body.longitude);
    const channelId = clean(body.channel_id) || null;
    const channelTypeFromBody = clean(body.channel_type) || null;

    if (!googlePlaceId || !name || !city) {
      return Response.json({ error: "Missing required fields: google_place_id, name, city" }, { status: 400 });
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
    if (!channelId && !channelTypeFromBody) {
      return Response.json({ error: "Missing required fields: channel_id or channel_type" }, { status: 400 });
    }

    let channelIdToSave = channelId;
    let channelType = channelTypeFromBody;
    if (channelIdToSave) {
      const { data: channel, error: channelError } = await supabase
        .from("channels")
        .select("id,code,type")
        .eq("id", channelIdToSave)
        .eq("type", "offline")
        .maybeSingle();
      if (channelError) {
        return Response.json({ error: channelError.message }, { status: 400 });
      }
      if (!channel) {
        return Response.json({ error: "Offline channel not found" }, { status: 404 });
      }
      channelType = channel.code;
    }
    if (!channelType) {
      return Response.json({ error: "Missing required fields: channel_id or channel_type" }, { status: 400 });
    }

    const assignment = await resolveOrganizationForRegion(supabase, { province, cityName, district });
    const organizationPatch = organizationAssignmentPatch(assignment);

    const insertResult = await supabase
      .from("offline_stores")
      .insert({
        name,
        city,
        province,
        city_name: cityName,
        district,
        google_place_id: googlePlaceId,
        channel_type: channelType,
        channel_id: channelIdToSave,
        address,
        latitude,
        longitude,
        created_by: auth.session.displayName,
        created_by_user_id: auth.session.id,
        created_by_name: auth.session.displayName,
        ...organizationPatch,
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
          city,
          province,
          city_name: cityName,
          district,
          google_place_id: googlePlaceId,
          channel_type: channelType,
          channel_id: channelIdToSave,
          address,
          latitude,
          longitude,
          created_by: auth.session.displayName,
          created_by_user_id: auth.session.id,
          created_by_name: auth.session.displayName,
          ...organizationPatch,
        })
        .select("id,name,city,province,city_name,district,google_place_id,channel_type,channel_id,address,latitude,longitude,location_accuracy_m,location_captured_at,status,disabled_at,deleted_at,created_by,created_by_user_id,created_by_name,created_at")
        .single();
      data = noChannelRelation.data as Record<string, unknown> | null;
      error = noChannelRelation.error;
    }

    if (isGooglePlaceColumnError(error)) {
      const legacy = await supabase
        .from("offline_stores")
        .insert({
          name,
          city,
          province,
          city_name: cityName,
          district,
          channel_type: channelType,
          channel_id: channelIdToSave,
          address,
          latitude,
          longitude,
          created_by: auth.session.displayName,
          created_by_user_id: auth.session.id,
          created_by_name: auth.session.displayName,
          ...organizationPatch,
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

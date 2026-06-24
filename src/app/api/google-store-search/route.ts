import { requireAppSession } from "@/lib/auth-session";
import { buildGoogleStoreCandidate } from "@/lib/google-store";
import { createSupabaseServiceClient, hasSupabaseServiceConfig } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const storeSelectFields = "id,name,city,province,city_name,district,google_place_id,channel_type,channel_id,address,latitude,longitude,location_accuracy_m,location_captured_at,status,disabled_at,deleted_at,created_by,created_by_user_id,created_by_name,created_at,channels(id,code,name,type)";
const storeSelectFieldsWithoutGooglePlaceId = "id,name,city,province,city_name,district,channel_type,channel_id,address,latitude,longitude,location_accuracy_m,location_captured_at,status,disabled_at,deleted_at,created_by,created_by_user_id,created_by_name,created_at,channels(id,code,name,type)";

function cleanText(value: string | null) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function cleanCoordinate(value: string | null, min: number, max: number) {
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) return null;
  return parsed;
}

function cleanLimit(value: string | null) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 10;
  return Math.max(1, Math.min(20, Math.floor(parsed)));
}

function isGooglePlaceColumnError(error: { message?: string } | null) {
  return (error?.message ?? "").includes("google_place_id");
}

function isChannelRelationError(error: { message?: string } | null) {
  const message = error?.message ?? "";
  return message.includes("channels") || message.includes("schema cache");
}

function mapsHeaders() {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) throw new Error("Google Maps API is not configured");
  return {
    "Content-Type": "application/json",
    "X-Goog-Api-Key": key,
    "X-Goog-FieldMask": [
      "places.id",
      "places.displayName",
      "places.formattedAddress",
      "places.location",
      "places.addressComponents",
      "places.primaryType",
      "places.types",
      "places.name",
    ].join(","),
  };
}

async function attachLocalStores(stores: ReturnType<typeof buildGoogleStoreCandidate>[]) {
  if (!hasSupabaseServiceConfig()) {
    return stores.map((store) => ({ ...store, local_store: null }));
  }

  const googlePlaceIds = Array.from(new Set(stores.map((store) => store.google_place_id).filter(Boolean)));
  if (googlePlaceIds.length === 0) {
    return stores.map((store) => ({ ...store, local_store: null }));
  }

  const supabase = createSupabaseServiceClient();
  const initial = await supabase
    .from("offline_stores")
    .select(storeSelectFields)
    .in("google_place_id", googlePlaceIds);

  if (isGooglePlaceColumnError(initial.error)) {
    return stores.map((store) => ({ ...store, local_store: null }));
  }

  let data = initial.data as Array<Record<string, unknown>> | null;
  let error = initial.error;

  if (isChannelRelationError(error)) {
    const legacy = await supabase
      .from("offline_stores")
      .select(storeSelectFieldsWithoutGooglePlaceId)
      .in("google_place_id", googlePlaceIds);
    data = legacy.data as Array<Record<string, unknown>> | null;
    error = legacy.error;
  }

  if (isGooglePlaceColumnError(error)) {
    return stores.map((store) => ({ ...store, local_store: null }));
  }

  if (error) {
    throw new Error(error.message);
  }

  const localStoreMap = new Map((data ?? []).map((store) => [String(store.google_place_id ?? ""), store]));
  return stores.map((store) => ({
    ...store,
    local_store: localStoreMap.get(store.google_place_id) ?? null,
  }));
}

async function searchNearby({ latitude, longitude, limit }: { latitude: number; longitude: number; limit: number }) {
  const response = await fetch("https://places.googleapis.com/v1/places:searchNearby", {
    method: "POST",
    headers: mapsHeaders(),
    body: JSON.stringify({
      maxResultCount: limit,
      rankPreference: "DISTANCE",
      locationRestriction: {
        circle: {
          center: { latitude, longitude },
          radius: 5000,
        },
      },
    }),
    cache: "no-store",
  });
  const data = (await response.json().catch(() => ({}))) as { places?: Record<string, unknown>[]; error?: { message?: string } };
  if (!response.ok) {
    return Response.json({ error: data.error?.message ?? "Google nearby search failed" }, { status: response.status });
  }

  const stores = (data.places ?? [])
    .map((place) => buildGoogleStoreCandidate(place, { latitude, longitude }))
    .filter((place) => place.google_place_id && place.name);

  return Response.json({
    stores: await attachLocalStores(stores),
  });
}

async function searchText({ query, latitude, longitude, limit }: { query: string; latitude: number | null; longitude: number | null; limit: number }) {
  const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: mapsHeaders(),
    body: JSON.stringify({
      textQuery: query,
      pageSize: limit,
      ...(latitude !== null && longitude !== null
        ? {
            locationBias: {
              circle: {
                center: { latitude, longitude },
                radius: 5000,
              },
            },
            rankPreference: "DISTANCE",
          }
        : {}),
    }),
    cache: "no-store",
  });
  const data = (await response.json().catch(() => ({}))) as { places?: Record<string, unknown>[]; error?: { message?: string } };
  if (!response.ok) {
    return Response.json({ error: data.error?.message ?? "Google text search failed" }, { status: response.status });
  }

  const stores = (data.places ?? [])
    .map((place) => buildGoogleStoreCandidate(place, { latitude, longitude }))
    .filter((place) => place.google_place_id && place.name);

  return Response.json({
    stores: await attachLocalStores(stores),
  });
}

export async function GET(request: Request) {
  const auth = await requireAppSession(request);
  if (auth.response) return auth.response;

  const { searchParams } = new URL(request.url);
  const query = cleanText(searchParams.get("query") ?? searchParams.get("q"));
  const latitude = cleanCoordinate(searchParams.get("lat"), -90, 90);
  const longitude = cleanCoordinate(searchParams.get("lon"), -180, 180);
  const limit = cleanLimit(searchParams.get("limit"));

  try {
    if (query) {
      return await searchText({ query, latitude, longitude, limit });
    }
    if (latitude === null || longitude === null) {
      return Response.json({ error: "Missing coordinates for nearby search" }, { status: 400 });
    }
    return await searchNearby({ latitude, longitude, limit });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Google place search failed" }, { status: 500 });
  }
}

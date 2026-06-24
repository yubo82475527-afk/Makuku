import { buildGoogleReverseLocationParts } from "@/lib/google-reverse-location";
import { buildLocationRegionParts } from "@/lib/location-region.mjs";

export const dynamic = "force-dynamic";

type LocationIqAddress = {
  city?: string;
  town?: string;
  village?: string;
  municipality?: string;
  city_district?: string;
  district?: string;
  county?: string;
  state_district?: string;
  state?: string;
  province?: string;
  region?: string;
  suburb?: string;
  neighbourhood?: string;
  quarter?: string;
  hamlet?: string;
  postcode?: string;
  country?: string;
  country_code?: string;
};

type LocationIqReverseResponse = {
  display_name?: string;
  address?: LocationIqAddress;
};

type GoogleReverseGeocodeResponse = {
  results?: Array<{
    formattedAddress?: string;
    addressComponents?: Array<{
      longText?: string;
      shortText?: string;
      types?: string[];
    }>;
  }>;
  error?: {
    message?: string;
  };
};

function cleanCoordinate(value: string | null, min: number, max: number) {
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) return null;
  return parsed;
}

function locationIqBaseUrl() {
  const region = process.env.LOCATIONIQ_REGION === "eu1" ? "eu1" : "us1";
  return `https://${region}.locationiq.com/v1/reverse`;
}

function googleReverseUrl(latitude: number, longitude: number) {
  const url = new URL("https://geocode.googleapis.com/v4/geocode/location");
  url.searchParams.set("location.latitude", String(latitude));
  url.searchParams.set("location.longitude", String(longitude));
  return url;
}

async function reverseWithGoogle(lat: number, lon: number) {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return null;

  const response = await fetch(googleReverseUrl(lat, lon), {
    cache: "no-store",
    headers: {
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": "results.formattedAddress,results.addressComponents",
    },
  });
  const data = (await response.json().catch(() => ({}))) as GoogleReverseGeocodeResponse;
  if (!response.ok) {
    throw new Error(data.error?.message ?? "Google reverse geocoding failed");
  }

  const region = buildGoogleReverseLocationParts(data);
  return {
    city: region.city,
    province: region.province,
    cityName: region.cityName,
    district: region.district,
    address: region.address,
    provider: "google",
  };
}

async function reverseWithLocationIq(lat: number, lon: number) {
  const key = process.env.LOCATIONIQ_API_KEY;
  if (!key) return null;

  const url = new URL(locationIqBaseUrl());
  url.searchParams.set("key", key);
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lon", String(lon));
  url.searchParams.set("format", "json");
  url.searchParams.set("addressdetails", "1");

  const response = await fetch(url, { cache: "no-store" });
  const data = (await response.json().catch(() => ({}))) as LocationIqReverseResponse & { error?: string };
  if (!response.ok) {
    throw new Error(data.error ?? "Reverse geocoding failed");
  }

  const region = buildLocationRegionParts(data, { latitude: lat, longitude: lon });

  return {
    city: region.region,
    province: region.province,
    cityName: region.cityName,
    district: region.district,
    address: data.display_name ?? null,
    provider: "locationiq",
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const lat = cleanCoordinate(searchParams.get("lat"), -90, 90);
  const lon = cleanCoordinate(searchParams.get("lon"), -180, 180);
  if (lat === null || lon === null) {
    return Response.json({ error: "Missing or invalid coordinates" }, { status: 400 });
  }

  try {
    try {
      const googleResult = await reverseWithGoogle(lat, lon);
      if (googleResult) return Response.json(googleResult);
    } catch {
      // Fallback to LocationIQ when Google is unavailable or times out.
    }

    const locationIqResult = await reverseWithLocationIq(lat, lon);
    if (locationIqResult) return Response.json(locationIqResult);

    return Response.json({ error: "Reverse geocoding is not configured" }, { status: 501 });
  } catch {
    return Response.json({ error: "Reverse geocoding failed" }, { status: 502 });
  }
}

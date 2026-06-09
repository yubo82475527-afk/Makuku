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

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const lat = cleanCoordinate(searchParams.get("lat"), -90, 90);
  const lon = cleanCoordinate(searchParams.get("lon"), -180, 180);
  if (lat === null || lon === null) {
    return Response.json({ error: "Missing or invalid coordinates" }, { status: 400 });
  }

  const key = process.env.LOCATIONIQ_API_KEY;
  if (!key) {
    return Response.json({ error: "LocationIQ is not configured" }, { status: 501 });
  }

  const url = new URL(locationIqBaseUrl());
  url.searchParams.set("key", key);
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lon", String(lon));
  url.searchParams.set("format", "json");
  url.searchParams.set("addressdetails", "1");

  try {
    const response = await fetch(url, { cache: "no-store" });
    const data = (await response.json().catch(() => ({}))) as LocationIqReverseResponse & { error?: string };
    if (!response.ok) {
      return Response.json({ error: data.error ?? "Reverse geocoding failed" }, { status: response.status });
    }

    const region = buildLocationRegionParts(data, { latitude: lat, longitude: lon });

    return Response.json({
      city: region.region,
      province: region.province,
      cityName: region.cityName,
      district: region.district,
      address: data.display_name ?? null,
      provider: "locationiq",
    });
  } catch {
    return Response.json({ error: "Reverse geocoding failed" }, { status: 502 });
  }
}

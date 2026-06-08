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
  region?: string;
  suburb?: string;
  neighbourhood?: string;
  quarter?: string;
  hamlet?: string;
  postcode?: string;
  country?: string;
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

function appendUnique(parts: string[], value: string | undefined) {
  const cleaned = value?.trim();
  if (!cleaned || parts.includes(cleaned)) return;
  parts.push(cleaned);
}

function buildAddressRegion(address: LocationIqAddress | undefined) {
  if (!address) return null;
  const parts: string[] = [];
  appendUnique(parts, address.state ?? address.region);
  appendUnique(parts, address.state_district);
  appendUnique(parts, address.county);
  appendUnique(parts, address.city ?? address.town ?? address.village ?? address.municipality);
  appendUnique(parts, address.city_district ?? address.district);
  appendUnique(parts, address.suburb ?? address.quarter ?? address.neighbourhood ?? address.hamlet);
  return parts.length > 0 ? parts.join(" / ") : null;
}

function isPostcode(value: string) {
  return /^[\d\s-]{3,}$/.test(value);
}

function buildDisplayRegion(displayName: string | undefined, address: LocationIqAddress | undefined) {
  if (!displayName) return null;
  const parts = displayName.split(",").map((part) => part.trim()).filter(Boolean);
  const removableTail = new Set(
    [address?.country, address?.postcode, address?.state, address?.region]
      .map((value) => value?.trim().toLowerCase())
      .filter(Boolean) as string[],
  );

  while (parts.length > 0) {
    const tail = parts[parts.length - 1].toLowerCase();
    if (!removableTail.has(tail) && !isPostcode(parts[parts.length - 1])) break;
    parts.pop();
  }

  const administrativeParts = parts.slice(1).slice(-3).reverse();
  return administrativeParts.length > 0 ? administrativeParts.join(" / ") : null;
}

function buildRegion(data: LocationIqReverseResponse) {
  return buildDisplayRegion(data.display_name, data.address) ?? buildAddressRegion(data.address);
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

    return Response.json({
      city: buildRegion(data),
      address: data.display_name ?? null,
      provider: "locationiq",
    });
  } catch {
    return Response.json({ error: "Reverse geocoding failed" }, { status: 502 });
  }
}

export type GoogleAddressComponent = {
  longText?: string;
  shortText?: string;
  types?: string[];
};

export type GoogleStoreCandidate = {
  google_place_id: string;
  name: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  distance_m: number | null;
  primary_type: string | null;
  types: string[];
  province: string | null;
  cityName: string | null;
  district: string | null;
  city: string;
};

function cleanText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function cleanNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function byType(components: GoogleAddressComponent[] | undefined, types: string[]) {
  for (const component of components ?? []) {
    const componentTypes = Array.isArray(component.types) ? component.types : [];
    if (types.some((type) => componentTypes.includes(type))) {
      return cleanText(component.longText) ?? cleanText(component.shortText);
    }
  }
  return null;
}

function joinRegion(parts: Array<string | null>) {
  const values = parts.filter(Boolean) as string[];
  return values.length > 0 ? values.join(" / ") : "";
}

export function buildGoogleStoreCandidate(place: Record<string, unknown>, origin?: { latitude: number | null; longitude: number | null }) {
  const addressComponents = Array.isArray(place.addressComponents)
    ? (place.addressComponents as GoogleAddressComponent[])
    : [];
  const location = (place.location ?? {}) as { latitude?: number; longitude?: number };
  const province = byType(addressComponents, ["administrative_area_level_1"]);
  const cityName = byType(addressComponents, ["locality", "administrative_area_level_2"]);
  const district = byType(addressComponents, ["sublocality", "sublocality_level_1", "administrative_area_level_3", "neighborhood"]);
  const latitude = cleanNumber(location.latitude);
  const longitude = cleanNumber(location.longitude);
  const distance_m = cleanNumber(place.distanceMeters) ?? (
    origin?.latitude !== null && origin?.latitude !== undefined && origin?.longitude !== null && origin?.longitude !== undefined && latitude !== null && longitude !== null
      ? haversineMeters(origin.latitude, origin.longitude, latitude, longitude)
      : null
  );

  return {
    google_place_id: cleanText(place.id) ?? "",
    name: cleanText((place.displayName as { text?: string } | undefined)?.text) ?? cleanText(place.displayName) ?? "",
    address: cleanText(place.formattedAddress),
    latitude,
    longitude,
    distance_m,
    primary_type: cleanText(place.primaryType),
    types: Array.isArray(place.types) ? place.types.map((item) => String(item).trim()).filter(Boolean) : [],
    province,
    cityName,
    district,
    city: joinRegion([province, cityName, district]),
  } satisfies GoogleStoreCandidate;
}

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(6371000 * c);
}

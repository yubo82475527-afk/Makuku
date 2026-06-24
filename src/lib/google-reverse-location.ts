type GoogleGeocodeAddressComponent = {
  longText?: string;
  shortText?: string;
  types?: string[];
};

type GoogleGeocodeResult = {
  formattedAddress?: string;
  addressComponents?: GoogleGeocodeAddressComponent[];
};

type GoogleReverseGeocodeResponse = {
  results?: GoogleGeocodeResult[];
};

function cleanText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function byType(components: GoogleGeocodeAddressComponent[] | undefined, types: string[]) {
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
  return values.length > 0 ? values.join(" / ") : null;
}

export function buildGoogleReverseLocationParts(data: GoogleReverseGeocodeResponse) {
  const result = Array.isArray(data.results) ? data.results[0] : null;
  const components = result?.addressComponents ?? [];
  const province = byType(components, ["administrative_area_level_1"]);
  const cityName = byType(components, ["locality", "administrative_area_level_2"]);
  const district = byType(components, ["sublocality", "sublocality_level_1", "administrative_area_level_3", "neighborhood"]);
  const city = joinRegion([province, cityName, district]);

  return {
    city,
    province,
    cityName,
    district,
    address: cleanText(result?.formattedAddress),
  };
}

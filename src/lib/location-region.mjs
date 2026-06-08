const INDONESIA_ISLAND_NAMES = new Set([
  "java",
  "jawa",
  "sumatra",
  "sulawesi",
  "kalimantan",
  "papua",
  "bali and nusa tenggara",
]);

function cleanText(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function countryCode(address) {
  return cleanText(address?.country_code)?.toLowerCase() ?? "";
}

function appendUnique(parts, value) {
  const cleaned = cleanText(value);
  if (!cleaned || parts.includes(cleaned)) return;
  parts.push(cleaned);
}

function isPostcode(value) {
  return /^[\d\s-]{3,}$/.test(value);
}

function isRtRwBlock(value) {
  return /^(rt|rw)\s*[\d./-]+$/i.test(value.trim());
}

function isIndonesiaIsland(value) {
  return INDONESIA_ISLAND_NAMES.has(value.trim().toLowerCase());
}

function truncateRegion(parts) {
  return parts.filter(Boolean).slice(0, 3);
}

function joinRegion(parts) {
  const regionParts = truncateRegion(parts);
  return regionParts.length > 0 ? regionParts.join(" / ") : null;
}

function splitDisplayName(displayName) {
  return cleanText(displayName)?.split(/[,，]/).map((part) => part.trim()).filter(Boolean) ?? [];
}

function dropKnownDisplayTail(parts, address) {
  const output = [...parts];
  const removableTail = new Set(
    [address?.country, address?.postcode]
      .map((value) => cleanText(value)?.toLowerCase())
      .filter(Boolean),
  );

  while (output.length > 0) {
    const tail = output[output.length - 1];
    const normalizedTail = tail.toLowerCase();
    if (!removableTail.has(normalizedTail) && !isPostcode(tail)) break;
    output.pop();
  }

  return output;
}

function isChinaAdminPart(value) {
  return /(省|市|自治区|特别行政区|区|县|自治县|旗|自治旗|州|自治州|盟)$/.test(value.trim());
}

function buildChinaAddressRegion(address) {
  const parts = [];
  appendUnique(parts, address?.province ?? address?.state);
  appendUnique(parts, address?.city ?? address?.town ?? address?.municipality);
  appendUnique(parts, address?.city_district ?? address?.district ?? address?.county ?? address?.state_district);
  return joinRegion(parts);
}

function buildChinaDisplayRegion(displayName, address) {
  const parts = dropKnownDisplayTail(splitDisplayName(displayName), address);
  const adminParts = parts.filter(isChinaAdminPart).slice(-3).reverse();
  return joinRegion(adminParts);
}

function buildIndonesiaAddressRegion(address) {
  const parts = [];
  const region = cleanText(address?.state ?? address?.province) ?? (
    address?.region && !isIndonesiaIsland(address.region) ? address.region : null
  );
  appendUnique(parts, region);
  appendUnique(parts, address?.city ?? address?.town ?? address?.municipality ?? address?.county);
  appendUnique(parts, address?.city_district ?? address?.district ?? address?.suburb);
  return joinRegion(parts.filter((part) => !isRtRwBlock(part)));
}

function buildIndonesiaDisplayRegion(displayName, address) {
  const parts = dropKnownDisplayTail(splitDisplayName(displayName), address)
    .filter((part) => !isRtRwBlock(part));

  while (parts.length > 0 && isIndonesiaIsland(parts[parts.length - 1])) {
    parts.pop();
  }

  return joinRegion(parts.slice(-3).reverse());
}

function buildGenericAddressRegion(address) {
  const parts = [];
  appendUnique(parts, address?.state ?? address?.province ?? address?.region);
  appendUnique(parts, address?.state_district ?? address?.county);
  appendUnique(parts, address?.city ?? address?.town ?? address?.village ?? address?.municipality);
  appendUnique(parts, address?.city_district ?? address?.district);
  return joinRegion(parts.filter((part) => !isRtRwBlock(part)));
}

function buildGenericDisplayRegion(displayName, address) {
  const parts = dropKnownDisplayTail(splitDisplayName(displayName), address)
    .filter((part) => !isRtRwBlock(part));
  return joinRegion(parts.slice(-3).reverse());
}

function regionDepth(region) {
  return region ? region.split(" / ").filter(Boolean).length : 0;
}

function pickBetterRegion(primary, fallback) {
  if (regionDepth(fallback) > regionDepth(primary)) return fallback;
  return primary ?? fallback;
}

export function buildLocationRegion(data) {
  const address = data?.address;
  const code = countryCode(address);

  if (code === "cn") {
    return pickBetterRegion(buildChinaAddressRegion(address), buildChinaDisplayRegion(data?.display_name, address));
  }

  if (code === "id") {
    return pickBetterRegion(buildIndonesiaAddressRegion(address), buildIndonesiaDisplayRegion(data?.display_name, address));
  }

  return pickBetterRegion(buildGenericAddressRegion(address), buildGenericDisplayRegion(data?.display_name, address));
}

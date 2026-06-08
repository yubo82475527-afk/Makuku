import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const storeVisitH5 = readFileSync("src/components/store-visit-h5.tsx", "utf8");
const reverseRoutePath = "src/app/api/location/reverse/route.ts";
const locationRegionPath = "src/lib/location-region.mjs";

test("new store sheet reverse geocodes browser location without exposing LocationIQ token", () => {
  assert.match(storeVisitH5, /\/api\/location\/reverse/);
  assert.match(storeVisitH5, /setCity\(/);
  assert.match(storeVisitH5, /setAddress\(/);
  assert.match(storeVisitH5, /reverseAddressFailed/);
  assert.match(storeVisitH5, /LocationIQ/);
  assert.doesNotMatch(storeVisitH5, /LOCATIONIQ_API_KEY/);
});

test("new store sheet puts required store identity fields before the bound location group", () => {
  const storeNameIndex = storeVisitH5.indexOf("placeholder={labels.storeNameRequired}");
  const channelTypeIndex = storeVisitH5.indexOf("labels.channelTypeRequired");
  const locationGroupIndex = storeVisitH5.indexOf("labels.storeLocationGroup");
  const cityIndex = storeVisitH5.indexOf("placeholder={labels.cityRequired}");
  const addressIndex = storeVisitH5.indexOf("placeholder={labels.addressOptional}");
  const locateIndex = storeVisitH5.indexOf("onClick={captureStoreLocation}");

  assert.ok(storeNameIndex >= 0, "store name should be the first required identity field");
  assert.ok(channelTypeIndex > storeNameIndex, "store type should follow store name");
  assert.ok(locationGroupIndex > channelTypeIndex, "city, address, and location should be grouped after store identity");
  assert.ok(cityIndex > locationGroupIndex, "city input should live inside the location group");
  assert.ok(addressIndex > cityIndex, "address input should sit with city input");
  assert.ok(locateIndex > addressIndex, "location action should be bound to the city/address group");
});

test("new store sheet labels location region as province city district", () => {
  assert.match(storeVisitH5, /cityRequired: "省\/市\/区 \*"/);
  assert.match(storeVisitH5, /city: "省\/市\/区"/);
  assert.match(storeVisitH5, /storeLocationGroup: "省\/市\/区与详细地址"/);
  assert.match(storeVisitH5, /自动填充省\/市\/区和详细地址/);
});

test("new visit store selection keeps the header minimal and create-store action fixed", () => {
  assert.doesNotMatch(storeVisitH5, /MobileLanguageSwitch/);
  assert.doesNotMatch(storeVisitH5, /copy\.newVisit/);
  assert.doesNotMatch(storeVisitH5, /selectedStore \? selectedStore\.name : labels\.selectStoreHint/);
  assert.doesNotMatch(storeVisitH5, /<p className="mt-1 text-sm leading-5 text-slate-500">\{labels\.selectStoreHint\}<\/p>/);
  assert.match(storeVisitH5, /setShowCreate\(true\)} className="fixed/);
  assert.match(storeVisitH5, /bottom-4/);
  assert.match(storeVisitH5, /pb-24/);
});

test("LocationIQ reverse API proxies coordinates through a server-only token", () => {
  assert.equal(existsSync(reverseRoutePath), true, "reverse geocode route should exist");
  assert.equal(existsSync(locationRegionPath), true, "region parser should exist");
  const reverseRoute = readFileSync(reverseRoutePath, "utf8");
  const locationRegion = readFileSync(locationRegionPath, "utf8");

  assert.match(reverseRoute, /export const dynamic = "force-dynamic"/);
  assert.match(reverseRoute, /process\.env\.LOCATIONIQ_API_KEY/);
  assert.match(reverseRoute, /LOCATIONIQ_REGION/);
  assert.match(reverseRoute, /addressdetails/);
  assert.match(reverseRoute, /buildLocationRegion/);
  assert.doesNotMatch(reverseRoute, /normalizeaddress/);
  assert.doesNotMatch(reverseRoute, /normalizecity/);
  assert.match(locationRegion, /export function buildLocationRegion/);
  assert.match(locationRegion, /city/);
  assert.match(locationRegion, /town/);
  assert.match(locationRegion, /village/);
  assert.match(locationRegion, /municipality/);
  assert.match(locationRegion, /county/);
  assert.match(locationRegion, /state/);
  assert.match(locationRegion, /state_district/);
  assert.match(locationRegion, /city_district/);
  assert.match(locationRegion, /district/);
  assert.match(locationRegion, /suburb/);
  assert.match(locationRegion, /region/);
  assert.match(locationRegion, /display_name/);
  assert.match(locationRegion, /\[,\s*，\]/);
  assert.match(locationRegion, /pickBetterRegion/);
  assert.match(locationRegion, /postcode/);
  assert.match(locationRegion, /country/);
  assert.match(locationRegion, /country_code/);
  assert.match(locationRegion, /cn/);
  assert.match(locationRegion, /id/);
  assert.match(locationRegion, /isRtRwBlock/);
  assert.match(locationRegion, /isIndonesiaIsland/);
  assert.doesNotMatch(reverseRoute, /raw:/);
});

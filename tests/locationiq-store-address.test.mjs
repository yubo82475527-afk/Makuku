import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const storeVisitH5 = readFileSync("src/components/store-visit-h5.tsx", "utf8");
const reverseRoutePath = "src/app/api/location/reverse/route.ts";
const locationRegionPath = "src/lib/location-region.mjs";

test("new store sheet reverse geocodes browser location through the server without exposing provider keys", () => {
  assert.match(storeVisitH5, /\/api\/location\/reverse/);
  assert.match(storeVisitH5, /setCity\(/);
  assert.match(storeVisitH5, /setAddress\(/);
  assert.match(storeVisitH5, /reverseAddressFailed/);
  assert.match(storeVisitH5, /LocationIQ/);
  assert.doesNotMatch(storeVisitH5, /LOCATIONIQ_API_KEY/);
  assert.doesNotMatch(storeVisitH5, /GOOGLE_MAPS_API_KEY/);
});

test("new store location evidence is required separately from reverse address fill", () => {
  assert.match(storeVisitH5, /const \[storeLocation, setStoreLocation\] = useState<StoreLocationEvidence \| null>\(initialLocation\)/);
  assert.match(storeVisitH5, /if \(!storeLocation\) \{\s*setError\(labels\.entryLocationDenied\);/s);
  assert.match(storeVisitH5, /disabled=\{loading \|\| !selectedDealer \|\| !selectedExternalStore \|\| !storeLocation\}/);
  assert.match(storeVisitH5, /setLocationStatus\(labels\.reverseAddressFailed\)/);
  assert.match(storeVisitH5, /setLocationStatus\(data\.city \|\| data\.address \? "" : labels\.reverseAddressMissing\)/);
});

test("new store sheet puts required store identity fields before the bound location group", () => {
  const createStoreSheetIndex = storeVisitH5.indexOf("function CreateStoreSheet");
  const createStoreSheetSource = storeVisitH5.slice(createStoreSheetIndex);
  const dealerStepIndex = createStoreSheetSource.indexOf("<DealerStoreSelector");
  const locationGroupIndex = createStoreSheetSource.indexOf("labels.storeLocationGroup");
  const cityIndex = createStoreSheetSource.indexOf("placeholder={labels.cityRequired}");
  const addressIndex = createStoreSheetSource.indexOf("placeholder={labels.addressOptional}");
  const locateIndex = createStoreSheetSource.indexOf("onClick={captureStoreLocation}");

  assert.ok(dealerStepIndex >= 0, "dealer selection should be the first required identity field");
  assert.ok(locationGroupIndex > dealerStepIndex, "city, address, and location should be grouped after external store identity");
  assert.ok(cityIndex > locationGroupIndex, "city input should live inside the location group");
  assert.ok(addressIndex > cityIndex, "address input should sit with city input");
  assert.ok(locateIndex > addressIndex, "location action should be bound to the city/address group");
});

test("new store sheet labels location region as province city district", () => {
  assert.match(storeVisitH5, /cityRequired: "\\u7701 \/ \\u5e02 \/ \\u533a \*"/);
  assert.match(storeVisitH5, /city: "\\u7701 \/ \\u5e02 \/ \\u533a"/);
  assert.match(storeVisitH5, /storeLocationGroup: "\\u7701 \/ \\u5e02 \/ \\u533a\\u4e0e\\u8be6\\u7ec6\\u5730\\u5740"/);
  assert.match(storeVisitH5, /LocationIQ \\u81ea\\u52a8\\u586b\\u5199\\u7701 \/ \\u5e02 \/ \\u533a\\u548c\\u5730\\u5740/);
});

test("new visit store selection keeps the header minimal and only shows create-store after empty google results", () => {
  assert.doesNotMatch(storeVisitH5, /MobileLanguageSwitch/);
  assert.doesNotMatch(storeVisitH5, /copy\.newVisit/);
  assert.doesNotMatch(storeVisitH5, /selectedStore \? selectedStore\.name : labels\.selectStoreHint/);
  assert.match(storeVisitH5, /searchMode === "history" \? labels\.selectStoreHint : labels\.newStoreFlowHint/);
  assert.match(storeVisitH5, /searchMode === "history" \? labels\.selectStore : labels\.createStore/);
  assert.match(storeVisitH5, /googleSearchEmpty/);
  assert.match(storeVisitH5, /onClick=\{\(\) => setShowCreate\(true\)\}/);
  assert.doesNotMatch(storeVisitH5, /className="fixed bottom-4 left-1\/2 z-40 flex h-12/);
});

test("reverse geocoding API uses Google first and keeps LocationIQ as fallback", () => {
  assert.equal(existsSync(reverseRoutePath), true, "reverse geocode route should exist");
  assert.equal(existsSync(locationRegionPath), true, "region parser should exist");
  const reverseRoute = readFileSync(reverseRoutePath, "utf8");
  const locationRegion = readFileSync(locationRegionPath, "utf8");

  assert.match(reverseRoute, /export const dynamic = "force-dynamic"/);
  assert.match(reverseRoute, /process\.env\.GOOGLE_MAPS_API_KEY/);
  assert.match(reverseRoute, /geocode\.googleapis\.com\/v4\/geocode\/location/);
  assert.match(reverseRoute, /X-Goog-FieldMask/);
  assert.match(reverseRoute, /provider: "google"/);
  assert.match(reverseRoute, /process\.env\.LOCATIONIQ_API_KEY/);
  assert.match(reverseRoute, /LOCATIONIQ_REGION/);
  assert.match(reverseRoute, /provider: "locationiq"/);
  assert.match(reverseRoute, /addressdetails/);
  assert.match(reverseRoute, /buildGoogleReverseLocationParts/);
  assert.match(reverseRoute, /buildLocationRegionParts/);
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
  assert.match(locationRegion, /split\(\/\[,，\]\/\)/);
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

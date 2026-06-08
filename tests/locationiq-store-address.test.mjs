import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const storeVisitH5 = readFileSync("src/components/store-visit-h5.tsx", "utf8");
const reverseRoutePath = "src/app/api/location/reverse/route.ts";

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

test("LocationIQ reverse API proxies coordinates through a server-only token", () => {
  assert.equal(existsSync(reverseRoutePath), true, "reverse geocode route should exist");
  const reverseRoute = readFileSync(reverseRoutePath, "utf8");

  assert.match(reverseRoute, /export const dynamic = "force-dynamic"/);
  assert.match(reverseRoute, /process\.env\.LOCATIONIQ_API_KEY/);
  assert.match(reverseRoute, /LOCATIONIQ_REGION/);
  assert.match(reverseRoute, /addressdetails/);
  assert.match(reverseRoute, /normalizeaddress/);
  assert.match(reverseRoute, /city/);
  assert.match(reverseRoute, /town/);
  assert.match(reverseRoute, /village/);
  assert.match(reverseRoute, /municipality/);
  assert.match(reverseRoute, /county/);
  assert.match(reverseRoute, /state/);
  assert.match(reverseRoute, /display_name/);
  assert.doesNotMatch(reverseRoute, /raw:/);
});

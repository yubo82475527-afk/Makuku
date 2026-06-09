import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const storeVisitH5 = readFileSync("src/components/store-visit-h5.tsx", "utf8");
const storeVisitsListH5 = readFileSync("src/components/store-visits-list-h5.tsx", "utf8");
const storeVisitApi = readFileSync("src/app/api/store-visit/route.ts", "utf8");
const offlineStoresApi = readFileSync("src/app/api/offline-stores/route.ts", "utf8");
const typesFile = readFileSync("src/lib/types.ts", "utf8");

test("new H5 store visit requires selecting store master data before capture", () => {
  assert.match(storeVisitH5, /selectedStore/);
  assert.match(storeVisitH5, /fetch\(`\/api\/offline-stores\?\$\{params\.toString\(\)\}`\)/);
  assert.match(storeVisitH5, /params\.set\("scope", "master"\)/);
  assert.match(storeVisitH5, /params\.set\("limit", query\.trim\(\) \? "50" : "20"\)/);
  assert.match(storeVisitH5, /StoreSearchStep/);
  assert.match(storeVisitH5, /CreateStoreSheet/);
  assert.match(storeVisitH5, /storeInfoIncomplete/);

  assert.doesNotMatch(storeVisitH5, /placeholder=\{copy\.region\}/);
  assert.doesNotMatch(storeVisitH5, /value=\{channel\}/);
  assert.doesNotMatch(storeVisitH5, /onChange=\{\(e\) => setPromoter/);
});

test("new H5 store visit uses logged-in user and blocks anonymous capture", () => {
  assert.match(storeVisitH5, /makuku_app_user/);
  assert.match(storeVisitH5, /signInFirst/);
  assert.match(storeVisitH5, /goToCapture/);
  assert.match(storeVisitH5, /user\?\.displayName/);
  assert.doesNotMatch(storeVisitH5, /placeholder=\{copy\.promoter\}/);
});

test("new H5 store visit keeps browser location inside create-store master data", () => {
  assert.match(storeVisitH5, /navigator\.geolocation/);
  assert.match(storeVisitH5, /location_accuracy_m/);
  assert.match(storeVisitH5, /location_captured_at/);
  assert.match(storeVisitH5, /CreateStoreSheet[\s\S]+navigator\.geolocation/);
  assert.match(storeVisitH5, /fetch\("\/api\/offline-stores"/);
  assert.doesNotMatch(storeVisitH5, /location\?\.latitude/);
  assert.doesNotMatch(storeVisitH5, /labels\.locationTitle/);
  assert.doesNotMatch(storeVisitH5, /google\.maps|amap|qq\.maps|mapbox/i);
});

test("new store sheet loads offline channel master data for store type", () => {
  assert.match(storeVisitH5, /\/api\/channels/);
  assert.match(storeVisitH5, /\.filter\(\(channel\) => channel\.type === "offline"\)/);
  assert.match(storeVisitH5, /setChannels/);
  assert.match(storeVisitH5, /channel_id: selectedChannel\?\.id/);
  assert.match(storeVisitH5, /channel_type: selectedChannel\?\.code/);
  assert.doesNotMatch(storeVisitH5, /<option value="modern_trade">Modern Trade<\/option>/);
  assert.doesNotMatch(storeVisitH5, /<option value="baby_store">Baby Store<\/option>/);
});

test("new H5 store visit keeps visit date compact instead of a full store-info card", () => {
  assert.match(storeVisitH5, /labels\.visitDate/);
  assert.doesNotMatch(storeVisitH5, /<h2 className="font-semibold">\{copy\.storeInformation\}<\/h2>/);
});

test("selected store card wraps long mobile region and address values", () => {
  assert.match(storeVisitH5, /overflow-hidden rounded-2xl/);
  assert.match(storeVisitH5, /grid-cols-\[5\.5rem_minmax\(0,1fr\)\]/);
  assert.match(storeVisitH5, /break-words text-right/);
  assert.doesNotMatch(storeVisitH5, /min-w-0 truncate text-sm font-medium text-slate-900/);
});

test("mobile visit list uses top settings menu for language and logout", () => {
  assert.match(storeVisitsListH5, /MobileCaptureSettingsMenu/);
  assert.match(storeVisitsListH5, /localStorage\.removeItem\(storageKey\)/);
  assert.match(storeVisitsListH5, /setUser\(null\)/);
  assert.match(storeVisitsListH5, /replacePathLocale/);
  assert.match(storeVisitsListH5, /Settings/);
  assert.match(storeVisitsListH5, /LogOut/);
  assert.doesNotMatch(storeVisitsListH5, /\{copy\.new\}/);
});

test("store visit API accepts selected store and optional location fields", () => {
  assert.match(storeVisitApi, /store_id/);
  assert.match(storeVisitApi, /channel_id/);
  assert.match(storeVisitApi, /latitude/);
  assert.match(storeVisitApi, /longitude/);
  assert.match(storeVisitApi, /location_accuracy_m/);
  assert.match(storeVisitApi, /location_captured_at/);
});

test("offline stores API and types preserve location-capable store master data", () => {
  assert.match(offlineStoresApi, /latitude/);
  assert.match(offlineStoresApi, /longitude/);
  assert.match(offlineStoresApi, /scope.*master/s);
  assert.match(offlineStoresApi, /readStoreMasterOptions/);
  assert.match(offlineStoresApi, /\.limit\(limit\)/);
  assert.match(typesFile, /latitude\?: number \| null/);
  assert.match(typesFile, /location_accuracy_m\?: number \| null/);
});

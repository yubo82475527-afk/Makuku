import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const storeVisitH5 = readFileSync("src/components/store-visit-h5.tsx", "utf8");
const storeVisitsListH5 = readFileSync("src/components/store-visits-list-h5.tsx", "utf8");
const storeVisitDetailH5 = readFileSync("src/components/store-visit-detail-h5.tsx", "utf8");
const storeVisitApi = readFileSync("src/app/api/store-visit/route.ts", "utf8");
const storeVisitImagesApi = readFileSync("src/app/api/store-visit/[id]/images/route.ts", "utf8");
const storeVisitAiDebug = readFileSync("src/lib/store-visit-ai-debug.ts", "utf8");
const offlineStoresApi = readFileSync("src/app/api/offline-stores/route.ts", "utf8");
const typesFile = readFileSync("src/lib/types.ts", "utf8");
const dataFile = readFileSync("src/lib/data.ts", "utf8");
const demoData = readFileSync("src/lib/demo-data.ts", "utf8");
const competitorExcelMigration = readFileSync("supabase/migrations/202606130001_competitor_master_excel_import.sql", "utf8");

test("new H5 store visit requires selecting store master data before capture", () => {
  assert.match(storeVisitH5, /selectedStore/);
  assert.match(storeVisitH5, /fetch\(`\/api\/offline-stores\?\$\{params\.toString\(\)\}`\)/);
  assert.match(storeVisitH5, /params\.set\("scope", "master"\)/);
  assert.match(storeVisitH5, /params\.set\("limit", query\.trim\(\) \? "50" : "20"\)/);
  assert.match(storeVisitH5, /StoreSearchStep/);
  assert.match(storeVisitH5, /CreateStoreSheet/);
  assert.match(storeVisitH5, /storeInfoIncomplete/);
  assert.match(storeVisitH5, /<StoreSearchStep locale=\{locale\} user=\{user\}/);
  assert.match(storeVisitH5, /created_by_user_id: user\.id/);
  assert.match(storeVisitH5, /created_by_name: user\.displayName/);

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
  assert.match(dataFile, /\.eq\("active", true\)/);
  assert.match(storeVisitH5, /setChannels/);
  assert.match(storeVisitH5, /channel_id: selectedChannel\?\.id/);
  assert.match(storeVisitH5, /channel_type: selectedChannel\?\.code/);
  assert.doesNotMatch(storeVisitH5, /<option value="modern_trade">Modern Trade<\/option>/);
  assert.doesNotMatch(storeVisitH5, /<option value="baby_store">Baby Store<\/option>/);
  assert.match(demoData, /"BABY SHOP"/);
  assert.match(demoData, /"MT-LKA-SUPERMARKET"/);
  assert.match(competitorExcelMigration, /update public\.channels[\s\S]*set active = false[\s\S]*where type = 'offline'/);
  assert.match(competitorExcelMigration, /'MT-LKA-SUPERMARKET'/);
});

test("new H5 store visit keeps visit date compact instead of a full store-info card", () => {
  assert.match(storeVisitH5, /labels\.visitDate/);
  assert.match(storeVisitH5, /function localDateInputValue/);
  assert.match(storeVisitH5, /getFullYear/);
  assert.match(storeVisitH5, /getMonth\(\) \+ 1/);
  assert.doesNotMatch(storeVisitH5, /useState\(new Date\(\)\.toISOString\(\)\.slice\(0, 10\)\)/);
  assert.match(storeVisitApi, /function jakartaDateInputValue/);
  assert.match(storeVisitApi, /timeZone: "Asia\/Jakarta"/);
  assert.doesNotMatch(storeVisitApi, /clean\(body\.visit_date\) \|\| new Date\(\)\.toISOString\(\)\.slice\(0, 10\)/);
  assert.doesNotMatch(storeVisitH5, /<h2 className="font-semibold">\{copy\.storeInformation\}<\/h2>/);
});

test("selected store card wraps long mobile region and address values", () => {
  assert.match(storeVisitH5, /overflow-hidden rounded-2xl/);
  assert.match(storeVisitH5, /grid-cols-1/);
  assert.match(storeVisitH5, /sm:grid-cols-\[7\.5rem_minmax\(0,1fr\)\]/);
  assert.match(storeVisitH5, /break-words text-left/);
  assert.doesNotMatch(storeVisitH5, /min-w-0 truncate text-sm font-medium text-slate-900/);
});

test("new H5 store visit allows up to 20 uploaded photos", () => {
  assert.match(storeVisitH5, /const maxImages = 20/);
  assert.match(storeVisitH5, /slice\(0, maxImages - totalImageCount\)/);
  assert.match(storeVisitH5, /flattenedImages\.length > maxImages/);
  assert.match(storeVisitH5, /totalImageCount}\/{maxImages}/);
  assert.match(storeVisitH5, /disabled=\{totalImageCount >= maxImages\}/);
});

test("new H5 store visit submits photos with limited concurrency after creating the visit", () => {
  assert.match(storeVisitH5, /const uploadConcurrency = 3/);
  assert.match(storeVisitH5, /async function uploadImagesWithConcurrency/);
  assert.match(storeVisitH5, /await uploadImagesWithConcurrency\(\{\s*visitId,\s*images: flattenedImages,\s*concurrency: uploadConcurrency,/s);
  assert.match(storeVisitH5, /completedCount \+= 1/);
  assert.match(storeVisitH5, /setSubmitStatus\(`\$\{labels\.processingPhotos\} \$\{completedCount\}\/\$\{flattenedImages\.length\}`\)/);

  const createVisitIndex = storeVisitH5.indexOf('fetch("/api/store-visit"');
  const uploadIndex = storeVisitH5.indexOf("await uploadImagesWithConcurrency");
  const analyzeIndex = storeVisitH5.indexOf('fetch("/api/store-visit/analyze"');
  const listRedirectIndex = storeVisitH5.indexOf('router.replace(`/${locale}/mobile/offline-capture`)');
  assert.ok(createVisitIndex >= 0, "visit should be created before image upload");
  assert.ok(uploadIndex > createVisitIndex, "image upload should start after visit creation");
  assert.equal(analyzeIndex, -1, "submit page should not wait for analysis after image upload");
  assert.ok(listRedirectIndex > uploadIndex, "list redirect should happen after all image uploads complete");
  assert.doesNotMatch(storeVisitH5, /const compressedImages = \[\];[\s\S]+Uploading photo \$\{index \+ 1\}/);
});

test("store visit image API allows the same 20-photo cap as the H5 client", () => {
  assert.match(storeVisitImagesApi, /const maxImages = 20/);
  assert.match(storeVisitImagesApi, /Upload up to 20 images/);
  assert.match(storeVisitImagesApi, /offline_visit_images\(id\)/);
  assert.match(storeVisitImagesApi, /legacyImageCount \+ tableImageCount/);
  assert.doesNotMatch(storeVisitImagesApi, /const maxImages = 6/);
  assert.doesNotMatch(storeVisitImagesApi, /Upload up to 6 images/);
});

test("store visit image API stores concurrent uploads as image rows instead of racing on arrays", () => {
  assert.match(storeVisitImagesApi, /const bucketName = "offline-visit-images"/);
  assert.match(storeVisitImagesApi, /function toOfflineImageType/);
  assert.match(storeVisitImagesApi, /\.from\("offline_visit_images"\)/);
  assert.match(storeVisitImagesApi, /\.insert\(\{/);
  assert.match(storeVisitImagesApi, /visit_id: id/);
  assert.match(storeVisitImagesApi, /image_path: path/);
  assert.doesNotMatch(storeVisitImagesApi, /image_urls: nextImageUrls/);
  assert.doesNotMatch(storeVisitImagesApi, /image_categories: nextCategories/);
});

test("store visit AI analysis reads new image rows and legacy image arrays", () => {
  assert.match(storeVisitAiDebug, /offline_visit_images\(\*\)/);
  assert.match(storeVisitAiDebug, /offline-visit-images/);
  assert.match(storeVisitAiDebug, /store-visits/);
  assert.match(storeVisitAiDebug, /fromOfflineImageType/);
  assert.match(storeVisitAiDebug, /\.\.\.tableImagePaths,\s*\.\.\.legacyImagePaths/s);
  assert.match(storeVisitAiDebug, /\.\.\.tableImageCategories,\s*\.\.\.legacyImageCategories/s);
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

test("mobile visit list and detail expose retry analysis for failed or uploaded visits", () => {
  assert.match(storeVisitsListH5, /function canRetryAnalysis/);
  assert.match(storeVisitsListH5, /retryAnalyze/);
  assert.match(storeVisitsListH5, /reanalyzeVisit/);
  assert.match(storeVisitsListH5, /fetch\("\/api\/store-visit\/analyze"/);
  assert.match(storeVisitsListH5, /analysis_status.*failed|failed.*analysis_status/s);
  assert.match(storeVisitDetailH5, /canRetryAnalysis/);
  assert.match(storeVisitDetailH5, /copy\.retryAnalyze/);
  assert.match(storeVisitDetailH5, /analysis_status\?:/);
  assert.match(storeVisitDetailH5, /visit_status\?:/);
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

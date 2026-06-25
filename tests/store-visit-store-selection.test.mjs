import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const storeVisitH5 = readFileSync("src/components/store-visit-h5.tsx", "utf8");
const storeVisitsListH5 = readFileSync("src/components/store-visits-list-h5.tsx", "utf8");
const storeVisitDetailH5 = readFileSync("src/components/store-visit-detail-h5.tsx", "utf8");
const storeVisitApi = readFileSync("src/app/api/store-visit/route.ts", "utf8");
const storeVisitsApi = readFileSync("src/app/api/store-visits/route.ts", "utf8");
const storeVisitImagesApi = readFileSync("src/app/api/store-visit/[id]/images/route.ts", "utf8");
const storeVisitAiDebug = readFileSync("src/lib/store-visit-ai-debug.ts", "utf8");
const offlineStoresApi = readFileSync("src/app/api/offline-stores/route.ts", "utf8");
const mobileOfflineApp = readFileSync("src/components/mobile-offline-app.tsx", "utf8");
const offlineUploadsPage = readFileSync("src/app/[locale]/offline-uploads/page.tsx", "utf8");
const offlineUploadsDetailPage = readFileSync("src/app/[locale]/offline-uploads/[id]/page.tsx", "utf8");
const storeVisitAiDebugClient = readFileSync("src/components/store-visit-ai-debug-client.tsx", "utf8");
const storeVisitHistoryStoresApiPath = "src/app/api/store-visit-history-stores/route.ts";
const storeVisitHistoryStoresApi = existsSync(storeVisitHistoryStoresApiPath) ? readFileSync(storeVisitHistoryStoresApiPath, "utf8") : "";
const googleStoreSearchApiPath = "src/app/api/google-store-search/route.ts";
const googleStoreSelectApiPath = "src/app/api/google-store-select/route.ts";
const googleStoreSearchApi = existsSync(googleStoreSearchApiPath) ? readFileSync(googleStoreSearchApiPath, "utf8") : "";
const googleStoreSelectApi = existsSync(googleStoreSelectApiPath) ? readFileSync(googleStoreSelectApiPath, "utf8") : "";
const typesFile = readFileSync("src/lib/types.ts", "utf8");
const dataFile = readFileSync("src/lib/data.ts", "utf8");
const demoData = readFileSync("src/lib/demo-data.ts", "utf8");
const competitorExcelMigration = readFileSync("supabase/migrations/202606130001_competitor_master_excel_import.sql", "utf8");
const visitChannelMigration = readFileSync("supabase/migrations/202606170003_relax_store_visit_channel_type.sql", "utf8");

test("new H5 store visit requires selecting store master data before capture", () => {
  assert.match(storeVisitH5, /selectedStore/);
  assert.match(storeVisitH5, /fetch\(`\/api\/store-visit-history-stores\?\$\{params\.toString\(\)\}`\)/);
  assert.match(storeVisitH5, /historyStores/);
  assert.match(storeVisitH5, /loadHistoryStores/);
  assert.match(storeVisitH5, /chooseGoogleStore/);
  assert.match(storeVisitH5, /materializeSelectedGoogleStore/);
  assert.match(storeVisitH5, /GoogleStoreTypeSheet/);
  assert.match(storeVisitH5, /pendingGoogleStore/);
  assert.match(storeVisitH5, /StoreSearchStep/);
  assert.match(storeVisitH5, /NewStoreSearchFlow/);
  assert.match(storeVisitH5, /CreateStoreSheet/);
  assert.match(storeVisitH5, /storeInfoIncomplete/);
  assert.match(storeVisitH5, /<StoreSearchStep locale=\{locale\} user=\{user\}/);
  assert.match(storeVisitH5, /created_by_user_id: user\.id/);
  assert.match(storeVisitH5, /created_by_name: user\.displayName/);
  assert.doesNotMatch(storeVisitH5, /params\.set\("scope", "master"\)/);
  assert.doesNotMatch(storeVisitH5, /labels\.backToHistory/);

  assert.doesNotMatch(storeVisitH5, /placeholder=\{copy\.region\}/);
  assert.doesNotMatch(storeVisitH5, /value=\{channel\}/);
  assert.doesNotMatch(storeVisitH5, /onChange=\{\(e\) => setPromoter/);
});

test("new H5 store visit uses logged-in user and blocks anonymous capture", () => {
  assert.match(storeVisitH5, /makuku_app_user/);
  assert.match(storeVisitH5, /signInFirst/);
  assert.match(storeVisitH5, /goToCapture/);
  assert.match(storeVisitH5, /user\?\.displayName/);
  assert.match(storeVisitH5, /Loading the visit form|正在加载巡店表单/);
  assert.doesNotMatch(storeVisitH5, /placeholder=\{copy\.promoter\}/);
});

test("new H5 store visit keeps browser location inside create-store master data", () => {
  assert.match(storeVisitH5, /navigator\.geolocation/);
  assert.match(storeVisitH5, /location_accuracy_m/);
  assert.match(storeVisitH5, /location_captured_at/);
  assert.match(storeVisitH5, /CreateStoreSheet[\s\S]+navigator\.geolocation/);
  assert.match(storeVisitH5, /fetch\("\/api\/offline-stores"/);
  assert.match(storeVisitH5, /fetch\(`\/api\/google-store-search\?\$\{params\.toString\(\)\}`\)/);
  assert.match(storeVisitH5, /setSearchMode\("new_store"\)/);
  assert.doesNotMatch(storeVisitH5, /location\?\.latitude/);
  assert.doesNotMatch(storeVisitH5, /labels\.locationTitle/);
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

test("offline store writes keep city as a deprecated mirror of city_name", () => {
  assert.match(offlineStoresApi, /const legacyCity = cityName;/);
  assert.match(offlineStoresApi, /insert\(\{[\s\S]*city: legacyCity,[\s\S]*city_name: cityName,/);
  assert.match(googleStoreSelectApi, /const legacyCity = cityName;/);
  assert.match(googleStoreSelectApi, /insert\(\{[\s\S]*city: legacyCity,[\s\S]*city_name: cityName,/);
});

test("history-first store search loads current user's visited stores before offering google search", () => {
  assert.equal(existsSync(storeVisitHistoryStoresApiPath), true, "history store route should exist");
  assert.match(storeVisitHistoryStoresApi, /user_id is required/);
  assert.match(storeVisitHistoryStoresApi, /store_id\.not\.is\.null|not\("store_id", "is", null\)/);
  assert.match(storeVisitHistoryStoresApi, /uploader_user_id/);
  assert.match(storeVisitHistoryStoresApi, /last_visit_at/);
  assert.match(storeVisitHistoryStoresApi, /visit_count/);
  assert.match(storeVisitHistoryStoresApi, /offline_stores/);
  assert.match(storeVisitH5, /historyStoresLoading/);
  assert.match(storeVisitH5, /historyStoresError/);
  assert.match(storeVisitH5, /historyStoresEmpty/);
  assert.match(storeVisitH5, /historyResults/);
  assert.match(storeVisitH5, /loadHistoryStores/);
  assert.match(storeVisitH5, /fetch\(`\/api\/store-visit-history-stores\?\$\{params\.toString\(\)\}`\)/);
  assert.match(storeVisitH5, /searchMode === "history" \? labels\.selectStore : labels\.createStore/);
  assert.match(storeVisitH5, /searchMode === "history" \? labels\.selectStoreHint : labels\.newStoreFlowHint/);
  assert.match(storeVisitHistoryStoresApi, /formatStoreRegion/);
  assert.match(storeVisitH5, /formatStoreRegionText/);
  assert.doesNotMatch(storeVisitH5, /useEffect\(\(\) => \{\s*locateStores\(\);/s);
});

test("google store first-time selection uses the same offline store type dropdown before materializing", () => {
  assert.match(storeVisitH5, /confirmGoogleStoreTypeTitle/);
  assert.match(storeVisitH5, /confirmGoogleStoreTypeHint/);
  assert.match(storeVisitH5, /function GoogleStoreTypeSheet/);
  assert.match(storeVisitH5, /value=\{selectedChannelId\}/);
  assert.match(storeVisitH5, /pendingGoogleStore && !pendingGoogleStore\.local_store/);
  assert.match(storeVisitH5, /<GoogleStoreTypeSheet/);
  assert.match(storeVisitH5, /disabled=\{loading \|\| channelsLoading \|\| !selectedChannel \|\| !store\}/);
  assert.match(storeVisitH5, /channel_id: selectedChannel\.id/);
  assert.match(storeVisitH5, /channel_type: selectedChannel\.code/);
  assert.match(storeVisitH5, /onClick=\{\(\) => chooseGoogleStore\(store\)\}/);
  assert.doesNotMatch(storeVisitH5, /onClick=\{\(\) => materializeSelectedGoogleStore\(store\)\}/);
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
  assert.match(storeVisitH5, /ReadOnlyRow label=\{labels\.city\} value=\{formatStoreRegionText\(selectedStore\) \|\| "-"\}/);
  assert.doesNotMatch(storeVisitH5, /ReadOnlyRow label=\{labels\.city\} value=\{selectedStore\.city \|\| "-"\}/);
  assert.doesNotMatch(storeVisitH5, /min-w-0 truncate text-sm font-medium text-slate-900/);
});

test("legacy mobile and review pages prefer structured region labels over raw city", () => {
  assert.match(mobileOfflineApp, /function formatRegionLabel\(region:/);
  assert.match(mobileOfflineApp, /formatRegionLabel\(store\)/);
  assert.match(mobileOfflineApp, /formatRegionLabel\(visit\)/);
  assert.match(offlineUploadsPage, /function formatVisitRegion\(visit: OfflineStoreVisit\)/);
  assert.match(offlineUploadsPage, /formatVisitRegion\(visit\)\} \/ \{visit\.channel_type\}/);
  assert.match(offlineUploadsDetailPage, /function formatVisitRegion\(visit:/);
  assert.match(offlineUploadsDetailPage, /formatVisitRegion\(visit\)\} \/ \{visit\.channel_type\}/);
  assert.match(storeVisitAiDebugClient, /function formatVisitRegion\(visit: OfflineStoreVisit \| null \| undefined\)/);
  assert.match(storeVisitAiDebugClient, /formatVisitRegion\(visit\)/);
});

test("store visit list and debug responses expose structured region labels before legacy city", () => {
  assert.match(storeVisitsApi, /function formatVisitRegion\(visit: OfflineStoreVisit\)/);
  assert.match(storeVisitsApi, /region: formatVisitRegion\(visit\)/);
  assert.match(storeVisitsApi, /city: formatVisitRegion\(visit\)/);
  assert.match(storeVisitAiDebug, /const structuredRegion = \[typedVisit\.province, typedVisit\.city_name, typedVisit\.district\]/);
  assert.match(storeVisitAiDebug, /const region = typedVisit\.region \?\? \(structuredRegion \|\| typedVisit\.city\)/);
  assert.match(readFileSync("src/app/api/store-visit-ai-debug/run/route.ts", "utf8"), /city: \[result\.visit\.province, result\.visit\.city_name, result\.visit\.district\]/);
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
  assert.match(storeVisitH5, /redirectingToList/);
  assert.match(storeVisitH5, /Returning to the visit list|正在返回巡店列表/);
  assert.doesNotMatch(storeVisitH5, /const compressedImages = \[\];[\s\S]+Uploading photo \$\{index \+ 1\}/);
});

test("mobile visit list login and new-visit entry expose explicit loading states", () => {
  assert.match(storeVisitsListH5, /LoadingOverlay/);
  assert.match(storeVisitsListH5, /const \[loginPhase, setLoginPhase\]/);
  assert.match(storeVisitsListH5, /const \[startingVisit, setStartingVisit\]/);
  assert.match(storeVisitsListH5, /startNewVisit/);
  assert.match(storeVisitsListH5, /Opening the visit form|正在打开巡店表单/);
  assert.match(storeVisitsListH5, /Verifying account|正在验证账号/);
  assert.match(storeVisitsListH5, /Entering the app|正在进入系统/);
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
  assert.doesNotMatch(storeVisitsListH5, /riskClass/);
  assert.doesNotMatch(storeVisitsListH5, /stock_risk/);
  assert.doesNotMatch(storeVisitsListH5, /\{copy\.new\}/);
});

test("mobile visit list and detail expose retry analysis for failed or uploaded visits", () => {
  assert.match(storeVisitsListH5, /function canRetryAnalysis/);
  assert.match(storeVisitsListH5, /retryAnalyze/);
  assert.match(storeVisitsListH5, /reanalyzeVisit/);
  assert.match(storeVisitsListH5, /withMinimumDelay/);
  assert.match(storeVisitsListH5, /fetch\("\/api\/store-visit\/analyze"/);
  assert.match(storeVisitsListH5, /analysis_status.*failed|failed.*analysis_status/s);
  assert.match(storeVisitDetailH5, /canRetryAnalysis/);
  assert.match(storeVisitDetailH5, /withMinimumDelay/);
  assert.match(storeVisitDetailH5, /LoadingOverlay/);
  assert.match(storeVisitDetailH5, /const \[analysisPhase, setAnalysisPhase\]/);
  assert.match(storeVisitDetailH5, /Re-analyzing the visit|正在重新分析巡店/);
  assert.match(storeVisitDetailH5, /This visit record could not be found|没有找到这条巡店记录/);
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

test("store visit channel type supports channel master codes instead of legacy enum only", () => {
  assert.match(visitChannelMigration, /drop constraint if exists offline_store_visits_channel_type_check/i);
  assert.doesNotMatch(visitChannelMigration, /add constraint offline_store_visits_channel_type_check/i);
  assert.match(visitChannelMigration, /'MT-LKA-SUPERMARKET'/);
  assert.match(storeVisitApi, /isVisitChannelTypeCheckError/);
  assert.match(storeVisitApi, /insertVisitPayload/);
  assert.match(storeVisitApi, /channel_type:\s*"other"/);
});

test("offline stores API and types preserve location-capable store master data", () => {
  assert.match(offlineStoresApi, /latitude/);
  assert.match(offlineStoresApi, /longitude/);
  assert.match(offlineStoresApi, /scope.*master/s);
  assert.match(offlineStoresApi, /readStoreMasterOptions/);
  assert.match(offlineStoresApi, /\.limit\(limit\)/);
  assert.match(typesFile, /latitude\?: number \| null/);
  assert.match(typesFile, /location_accuracy_m\?: number \| null/);
  assert.match(typesFile, /google_place_id\?: string \| null/);
});

test("google store APIs search places and materialize selected place into local offline stores", () => {
  assert.equal(existsSync(googleStoreSearchApiPath), true, "google store search route should exist");
  assert.equal(existsSync(googleStoreSelectApiPath), true, "google store select route should exist");
  assert.match(googleStoreSearchApi, /process\.env\.GOOGLE_MAPS_API_KEY/);
  assert.match(googleStoreSearchApi, /places:searchNearby/);
  assert.match(googleStoreSearchApi, /places:searchText/);
  assert.match(googleStoreSearchApi, /X-Goog-FieldMask/);
  assert.match(googleStoreSearchApi, /addressComponents/);
  assert.doesNotMatch(googleStoreSearchApi, /distanceMeters/);
  assert.match(googleStoreSearchApi, /google_place_id/);
  assert.match(googleStoreSearchApi, /local_store/);
  assert.match(googleStoreSearchApi, /\.in\("google_place_id"/);
  assert.match(googleStoreSearchApi, /isGooglePlaceColumnError/);
  assert.match(googleStoreSearchApi, /return stores\.map\(\(store\) => \(\{ \.\.\.store, local_store: null \}\)\)/);

  assert.match(googleStoreSelectApi, /\.from\("offline_stores"\)/);
  assert.match(googleStoreSelectApi, /\.from\("channels"\)/);
  assert.match(googleStoreSelectApi, /google_place_id/);
  assert.match(googleStoreSelectApi, /channel_id/);
  assert.match(googleStoreSelectApi, /created_by_user_id/);
  assert.match(googleStoreSelectApi, /created_by_name/);
  assert.match(googleStoreSelectApi, /\.eq\("type", "offline"\)/);
  assert.match(googleStoreSelectApi, /eq\("google_place_id"/);
  assert.match(googleStoreSelectApi, /isGooglePlaceColumnError/);
  assert.match(googleStoreSelectApi, /legacy/i);
  assert.doesNotMatch(googleStoreSelectApi, /channel_type:\s*"other"/);
});

test("store search shows manual create only after google search returns no reliable place", () => {
  assert.match(storeVisitH5, /historyEntryAction/);
  assert.match(storeVisitH5, /setSearchMode\("new_store"\)/);
  assert.match(storeVisitH5, /googleSearchEmpty/);
  assert.match(storeVisitH5, /showCreate/);
  assert.match(storeVisitH5, /!loading && googleResults\.length === 0/);
  assert.match(storeVisitH5, /onClick=\{\(\) => setShowCreate\(true\)\}/);
  assert.match(storeVisitH5, /className="pointer-events-none fixed inset-x-0 bottom-0 z-20 mx-auto max-w-md px-4 pb-4/);
  assert.match(storeVisitH5, /className="mt-4 space-y-2 pb-24"/);
});

test("store search location button keeps icon and label on one line", () => {
  assert.match(storeVisitH5, /labels\.useCurrentLocation/);
  assert.match(storeVisitH5, /rounded-xl border border-slate-200 bg-slate-50 px-3 py-2/);
  assert.doesNotMatch(storeVisitH5, /text-\[11px\] font-semibold text-slate-700/);
  assert.match(storeVisitH5, /truncate text-\[11px\] leading-4 text-slate-500/);
  assert.match(storeVisitH5, /flex h-6 w-6 shrink-0 items-center justify-center rounded-full/);
  assert.match(storeVisitH5, /inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full/);
});

test("mobile store visit detail header does not render a language switch", () => {
  assert.doesNotMatch(storeVisitDetailH5, /MobileLanguageSwitch/);
});

test("store visits list API counts photo rows even when legacy image_urls is empty", () => {
  assert.match(storeVisitsApi, /function photoCount/);
  assert.match(storeVisitsApi, /offline_visit_images\?\.length/);
  assert.match(storeVisitsApi, /Math\.max\(/);
  assert.doesNotMatch(storeVisitsApi, /if \(Array\.isArray\(visit\.image_urls\)\) return visit\.image_urls\.length;/);
});

test("mobile visit list summarizes parsed brands by sku count", () => {
  assert.match(storeVisitsListH5, /function summarizeVisitBrandCounts/);
  assert.match(storeVisitsListH5, /price_insights\?\.key_sku_prices/);
  assert.match(storeVisitsListH5, /new Map<string, \{ label: string; skus: Set<string> \}>/);
  assert.match(storeVisitsListH5, /skus\.size/);
  assert.match(storeVisitsListH5, /toLowerCase\(\)/);
  assert.match(storeVisitsListH5, /isAllUpperCase/);
  assert.match(storeVisitsListH5, /const summary = summarizeVisitBrandCounts\(visit\.ai_result, locale\)/);
});

import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const storeVisitH5 = readFileSync("src/components/store-visit-h5.tsx", "utf8");
const storeVisitsListH5 = readFileSync("src/components/store-visits-list-h5.tsx", "utf8");
const storeVisitDetailH5 = readFileSync("src/components/store-visit-detail-h5.tsx", "utf8");
const storeVisitApi = readFileSync("src/app/api/store-visit/route.ts", "utf8");
const storeVisitsApi = readFileSync("src/app/api/store-visits/route.ts", "utf8");
const offlineStoreVisitsApi = readFileSync("src/app/api/offline-store-visits/route.ts", "utf8");
const storeVisitImagesApi = readFileSync("src/app/api/store-visit/[id]/images/route.ts", "utf8");
const offlineStoreVisitImagesApi = readFileSync("src/app/api/offline-store-visits/[id]/images/route.ts", "utf8");
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
const externalMdDealersApiPath = "src/app/api/external-md/dealers/route.ts";
const externalMdStoresApiPath = "src/app/api/external-md/stores/route.ts";
const googleStoreSearchApi = existsSync(googleStoreSearchApiPath) ? readFileSync(googleStoreSearchApiPath, "utf8") : "";
const googleStoreSelectApi = existsSync(googleStoreSelectApiPath) ? readFileSync(googleStoreSelectApiPath, "utf8") : "";
const externalMdDealersApi = existsSync(externalMdDealersApiPath) ? readFileSync(externalMdDealersApiPath, "utf8") : "";
const externalMdStoresApi = existsSync(externalMdStoresApiPath) ? readFileSync(externalMdStoresApiPath, "utf8") : "";
const typesFile = readFileSync("src/lib/types.ts", "utf8");
const demoData = readFileSync("src/lib/demo-data.ts", "utf8");
const competitorExcelMigration = readFileSync("supabase/migrations/202606130001_competitor_master_excel_import.sql", "utf8");
const visitChannelMigration = readFileSync("supabase/migrations/202606170003_relax_store_visit_channel_type.sql", "utf8");
const visitListIndexMigrationPath = "supabase/migrations/202607160002_store_visit_h5_list_indexes.sql";
const visitListIndexMigration = existsSync(visitListIndexMigrationPath) ? readFileSync(visitListIndexMigrationPath, "utf8") : "";

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

test("new store sheet uses external md dealer and store selection instead of store type", () => {
  assert.match(storeVisitH5, /\/api\/external-md\/dealers/);
  assert.match(storeVisitH5, /\/api\/external-md\/stores/);
  assert.match(storeVisitH5, /dealerUserId/);
  assert.match(storeVisitH5, /external_md_id/);
  assert.match(storeVisitH5, /external_store_id/);
  assert.match(storeVisitH5, /external_org_name/);
  assert.match(storeVisitH5, /function H5SearchEntrySheet/);
  assert.match(storeVisitH5, /window\.visualViewport/);
  assert.match(storeVisitH5, /100dvh/);
  assert.match(storeVisitH5, /min-h-0 flex-1 overflow-y-auto overscroll-contain/);
  assert.match(storeVisitH5, /autoFocus/);
  assert.match(storeVisitH5, /activePicker === "dealer"/);
  assert.match(storeVisitH5, /activePicker === "store"/);
  assert.match(storeVisitH5, /setActivePicker\("dealer"\)/);
  assert.match(storeVisitH5, /setActivePicker\("store"\)/);
  assert.match(storeVisitH5, /disabled=\{!selectedDealer \|\| loading\}/);
  assert.match(storeVisitH5, /setSelectedExternalStore\(null\)/);
  assert.match(storeVisitH5, /setStoreQuery\(""\)/);
  assert.match(storeVisitH5, /\}, \[activePicker, dealerSearchKey, labels\.createFailed, onAuthFailure\]\)/);
  assert.match(storeVisitH5, /\}, \[activePicker, labels\.createFailed, onAuthFailure, selectedDealer, storeSearchKey\]\)/);
  assert.doesNotMatch(storeVisitH5, /onFocus=\{\(\) => setDealerPickerOpen\(true\)\}/);
  assert.doesNotMatch(storeVisitH5, /onFocus=\{\(\) => \{\s*if \(!selectedDealer\) return;\s*setStorePickerOpen\(true\);/s);
  assert.doesNotMatch(storeVisitH5, /showDealerResults \? \(/);
  assert.doesNotMatch(storeVisitH5, /showStoreResults \? \(/);
  assert.doesNotMatch(storeVisitH5, /\/api\/channels/);
  assert.doesNotMatch(storeVisitH5, /channelTypeRequired/);
  assert.doesNotMatch(storeVisitH5, /setChannels/);
  assert.doesNotMatch(storeVisitH5, /selectedChannelId/);
  assert.match(demoData, /"BABY SHOP"/);
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

test("google store first-time selection uses external md dealer and store selection before materializing", () => {
  assert.match(storeVisitH5, /confirmGoogleStoreTypeTitle/);
  assert.match(storeVisitH5, /confirmGoogleStoreTypeHint/);
  assert.match(storeVisitH5, /function GoogleStoreTypeSheet/);
  assert.match(storeVisitH5, /pendingGoogleStore && !pendingGoogleStore\.local_store/);
  assert.match(storeVisitH5, /<GoogleStoreTypeSheet/);
  assert.match(storeVisitH5, /selectedDealer/);
  assert.match(storeVisitH5, /selectedExternalStore/);
  assert.match(storeVisitH5, /\/api\/external-md\/dealers/);
  assert.match(storeVisitH5, /\/api\/external-md\/stores/);
  assert.match(storeVisitH5, /external_md_id: selectedExternalStore\.dealerUserId/);
  assert.match(storeVisitH5, /external_store_id: selectedExternalStore\.code/);
  assert.doesNotMatch(storeVisitH5, /channel_id: selectedChannel\.id/);
  assert.doesNotMatch(storeVisitH5, /channel_type: selectedChannel\.code/);
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
  assert.match(storeVisitH5, /disabled=\{totalImageCount >= maxImages \|\| pendingPhotoSelection !== null\}/);
});

test("new H5 store visit add-photo action sheet separates camera and album selection", () => {
  assert.match(storeVisitH5, /photoSourceSheet/);
  assert.match(storeVisitH5, /activePhotoCategory/);
  assert.match(storeVisitH5, /pendingPhotoSelection/);
  assert.match(storeVisitH5, /sourceStatus/);
  assert.match(storeVisitH5, /cameraInputRef/);
  assert.match(storeVisitH5, /albumInputRef/);
  assert.match(storeVisitH5, /showPhotoSourceSheet/);
  assert.match(storeVisitH5, /beginPhotoSelection/);
  assert.match(storeVisitH5, /handleSourcePickerCancel/);
  assert.match(storeVisitH5, /labels\.takePhoto/);
  assert.match(storeVisitH5, /labels\.chooseFromAlbum/);
  assert.match(storeVisitH5, /labels\.cameraPermissionHint/);
  assert.match(storeVisitH5, /labels\.albumSelectionHint/);
  assert.match(storeVisitH5, /onOpenSourceSheet=\{\(\) => showPhotoSourceSheet\(category\)\}/);
  assert.match(storeVisitH5, /setActivePhotoCategory\(category\)/);
  assert.match(storeVisitH5, /if \(!activePhotoCategory\) return/);
  assert.match(storeVisitH5, /addFiles\(activePhotoCategory, files\)/);
  assert.match(storeVisitH5, /capture="environment"/);
  assert.match(storeVisitH5, /multiple\s+className="sr-only"/);
  assert.match(storeVisitH5, /window\.setTimeout/);
  assert.ok(storeVisitH5.indexOf("cameraInputRef") < storeVisitH5.indexOf('capture="environment"'), "camera input should still use capture");
  assert.match(storeVisitH5, /ref=\{albumInputRef\}[\s\S]*multiple/);
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
  assert.ok(analyzeIndex > uploadIndex, "submit flow should enqueue AI after image upload finishes");
  assert.ok(analyzeIndex < listRedirectIndex, "submit flow should enqueue AI before returning to the list");
  assert.ok(listRedirectIndex > uploadIndex, "list redirect should happen after all image uploads complete");
  assert.match(storeVisitH5, /redirectingToList/);
  assert.match(storeVisitH5, /Returning to the visit list|正在返回巡店列表/);
  assert.doesNotMatch(storeVisitH5, /const compressedImages = \[\];[\s\S]+Uploading photo \$\{index \+ 1\}/);
});

test("store visit create APIs reuse the latest empty draft instead of inserting duplicate zero-image visits", () => {
  assert.match(storeVisitApi, /async function findReusableEmptyDraft/);
  assert.match(storeVisitApi, /return \{ supabase, visit: reusableDraft \}/);
  assert.match(storeVisitApi, /offline_visit_images\(id\)/);
  assert.match(offlineStoreVisitsApi, /async function findReusableEmptyDraft/);
  assert.match(offlineStoreVisitsApi, /return Response\.json\(\{ visit: reusableDraft \}\)/);
});

test("store visit photo uploads allow 20MB originals before high quality compression", () => {
  assert.match(storeVisitH5, /const maxUploadBytes = 20 \* 1024 \* 1024/);
  assert.match(storeVisitH5, /const compressionMaxSide = 3000/);
  assert.match(storeVisitH5, /const compressionQuality = 0\.9/);
  assert.match(storeVisitH5, /async function prepareImageForUpload/);
  assert.match(storeVisitH5, /if \(file\.size <= maxUploadBytes\) return file/);
  assert.match(storeVisitH5, /const file = await prepareImageForUpload\(image\.file\)/);
  assert.doesNotMatch(storeVisitH5, /const maxUploadBytes = 8 \* 1024 \* 1024/);
  assert.doesNotMatch(storeVisitH5, /const compressionMaxSide = 1600/);
  assert.doesNotMatch(storeVisitH5, /const compressionQuality = 0\.78/);
});

test("store visit retake uploads reuse the same image preparation policy as first upload", () => {
  assert.match(storeVisitDetailH5, /async function prepareImageForUpload/);
  assert.match(storeVisitDetailH5, /const file = await prepareImageForUpload\(params\.file\)/);
  assert.match(storeVisitDetailH5, /formData\.set\("image", file\)/);
  assert.doesNotMatch(storeVisitDetailH5, /formData\.set\("image", params\.file\)/);
});

test("store visit image APIs allow 20MB photos and no longer mention 8MB", () => {
  for (const source of [storeVisitApi, storeVisitImagesApi, offlineStoreVisitImagesApi]) {
    assert.match(source, /const maxFileSizeBytes = 20 \* 1024 \* 1024/);
    assert.match(source, /20MB or smaller/);
    assert.doesNotMatch(source, /const maxFileSizeBytes = 8 \* 1024 \* 1024/);
    assert.doesNotMatch(source, /8MB or smaller/);
  }
});

test("mobile visit list login stays explicit while new-visit navigation avoids extra overlay flash", () => {
  assert.match(storeVisitsListH5, /LoadingOverlay/);
  assert.match(storeVisitsListH5, /const \[loginPhase, setLoginPhase\]/);
  assert.match(storeVisitsListH5, /href=\{newVisitHref\}/);
  assert.doesNotMatch(storeVisitsListH5, /startNewVisit/);
  assert.doesNotMatch(storeVisitsListH5, /const \[startingVisit, setStartingVisit\]/);
  assert.doesNotMatch(storeVisitsListH5, /Opening the visit form|正在打开巡店表单/);
  assert.doesNotMatch(storeVisitsListH5, /setStartingVisit\(true\)/);
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

test("mobile visit list and detail keep whole-visit analysis limited to the initial run", () => {
  assert.doesNotMatch(storeVisitsListH5, /function canRetryAnalysis/);
  assert.doesNotMatch(storeVisitsListH5, /retryAnalyze/);
  assert.doesNotMatch(storeVisitsListH5, /reanalyzeVisit/);
  assert.match(storeVisitsListH5, /fetch\("\/api\/store-visit\/analyze"/);
  assert.match(storeVisitsListH5, /analysis_status.*failed|failed.*analysis_status/s);
  assert.match(storeVisitDetailH5, /LoadingOverlay/);
  assert.match(storeVisitDetailH5, /const \[analysisPhase, setAnalysisPhase\]/);
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
  assert.match(offlineStoresApi, /external_store_id/);
  assert.match(offlineStoresApi, /external_md_id/);
  assert.match(offlineStoresApi, /external_org_name/);
  assert.match(typesFile, /latitude\?: number \| null/);
  assert.match(typesFile, /location_accuracy_m\?: number \| null/);
  assert.match(typesFile, /google_place_id\?: string \| null/);
  assert.match(typesFile, /external_store_id\?: string \| null/);
  assert.match(typesFile, /external_md_name\?: string \| null/);
});

test("external md store creation uses a channel type allowed by offline store constraints", () => {
  assert.match(offlineStoresApi, /const externalMdFallbackChannelType = "BABY SHOP"/);
  assert.match(offlineStoresApi, /function resolveOfflineStoreChannelType/);
  assert.match(offlineStoresApi, /return channelType && channelType !== "other" \? channelType : externalMdFallbackChannelType/);
  assert.match(offlineStoresApi, /const channelType = resolveOfflineStoreChannelType\(channelTypeFromBody\)/);
  assert.match(googleStoreSelectApi, /const externalMdFallbackChannelType = "BABY SHOP"/);
  assert.match(googleStoreSelectApi, /const channelType = externalMdFallbackChannelType/);
  assert.match(competitorExcelMigration, /'BABY SHOP'/);
  assert.match(competitorExcelMigration, /offline_stores_channel_type_check/);
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
  assert.match(googleStoreSelectApi, /google_place_id/);
  assert.match(googleStoreSelectApi, /external_store_id/);
  assert.match(googleStoreSelectApi, /external_md_id/);
  assert.match(googleStoreSelectApi, /external_org_name/);
  assert.match(googleStoreSelectApi, /created_by_user_id/);
  assert.match(googleStoreSelectApi, /created_by_name/);
  assert.match(googleStoreSelectApi, /eq\("google_place_id"/);
  assert.match(googleStoreSelectApi, /eq\("external_source",\s*"external_md"\)/);
  assert.match(googleStoreSelectApi, /eq\("external_store_id",\s*externalStoreId\)/);
  assert.match(googleStoreSelectApi, /externalExisting\.data/);
  assert.match(googleStoreSelectApi, /isGooglePlaceColumnError/);
  assert.match(googleStoreSelectApi, /legacy/i);
  assert.doesNotMatch(googleStoreSelectApi, /\.from\("channels"\)/);
});

test("external md APIs proxy dealer and md customer store queries", () => {
  assert.equal(existsSync(externalMdDealersApiPath), true, "external md dealers route should exist");
  assert.equal(existsSync(externalMdStoresApiPath), true, "external md stores route should exist");
  assert.match(externalMdDealersApi, /proxyExternalMdJson/);
  assert.match(externalMdDealersApi, /dealersInfo\/page/);
  assert.match(externalMdDealersApi, /if \(code\) params\.set\("code", code\);/);
  assert.match(externalMdDealersApi, /else if \(q\) params\.set\("name", q\);/);
  assert.doesNotMatch(externalMdDealersApi, /if \(!code && q\) params\.set\("code", q\);/);
  assert.match(externalMdDealersApi, /pageNo/);
  assert.match(externalMdDealersApi, /pageSize/);
  assert.match(externalMdStoresApi, /getMdCustomerPage\/page/);
  assert.match(externalMdStoresApi, /dealerUserId/);
  assert.match(externalMdStoresApi, /const code = searchParams\.get\("code"\)\?\.trim\(\) \?\? ""/);
  assert.match(externalMdStoresApi, /if \(code\) params\.set\("code", code\);/);
  assert.match(externalMdStoresApi, /else if \(q\) params\.set\("name", q\);/);
  assert.doesNotMatch(externalMdStoresApi, /params\.set\("code", q\);/);
  assert.match(externalMdStoresApi, /Missing required fields: dealerUserId/);
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

test("store visits list API hides draft visits so users only see submitted visits", () => {
  assert.match(storeVisitsApi, /\.neq\("visit_status", "draft"\)/);
});

test("store visits list API uses index-friendly pagination and separate photo counts", () => {
  assert.match(storeVisitsApi, /loadVisitPageRows/);
  assert.match(storeVisitsApi, /loadPhotoCountsByVisitId/);
  assert.match(storeVisitsApi, /pageFetchLimit/);
  assert.match(storeVisitsApi, /rows\.slice\(from, from \+ pageSize\)/);
  assert.match(storeVisitsApi, /hasNext = rows\.length > fetchTo/);
  assert.doesNotMatch(storeVisitsApi, /\.select\("[^"]*offline_visit_images\(id\)[^"]*", \{ count: "exact" \}\)/);
  assert.doesNotMatch(storeVisitsApi, /\.or\(`user_id\.eq\.\$\{userId\},uploader_user_id\.eq\.\$\{userId\}`\)/);
  assert.match(visitListIndexMigration, /idx_offline_store_visits_h5_uploader_created/i);
  assert.match(visitListIndexMigration, /idx_offline_visit_images_visit_id/i);
});

test("mobile visit list summarizes parsed brands by sku count", () => {
  assert.match(storeVisitsListH5, /function summarizeVisitBrandCounts/);
  assert.match(storeVisitsListH5, /price_insights\?\.key_sku_prices/);
  assert.match(storeVisitsListH5, /summarizeBrandSkuCounts\(priceRows, locale\)/);
  assert.match(storeVisitsListH5, /const summary = summarizeVisitBrandCounts\(visit\.ai_result, locale\)/);
});

test("mobile visit list completion state is not derived from analysis_status alone", () => {
  assert.match(storeVisitsListH5, /visit_status/);
  assert.match(storeVisitsListH5, /photo_count/);
  assert.match(storeVisitsListH5, /function visitDisplayStatus/);
  assert.match(storeVisitsListH5, /const status = visitDisplayStatus\(visit\)/);
});

test("store visits API counts today's unique stores instead of raw visit rows", () => {
  assert.match(storeVisitsApi, /function storeDedupKey/);
  assert.match(storeVisitsApi, /visit\.store_id/);
  assert.match(storeVisitsApi, /new Set/);
  assert.match(storeVisitsApi, /todayRows\.map\(storeDedupKey\)/);
  assert.match(storeVisitsApi, /today_count: new Set\(todayRows\.map\(storeDedupKey\)\)\.size/);
  assert.doesNotMatch(storeVisitsApi, /today_count: visitDateCountResult\.count \+ legacyCountResult\.count/);
  assert.doesNotMatch(storeVisitsApi, /todayCount = visits\.filter\(\(visit\) => visit\.created_at >= start && visit\.created_at < end\)\.length/);
});

test("mobile visit list refreshes counts when the page becomes active again", () => {
  assert.match(storeVisitsListH5, /window\.addEventListener\("focus"/);
  assert.match(storeVisitsListH5, /window\.addEventListener\("pageshow"/);
  assert.match(storeVisitsListH5, /document\.addEventListener\("visibilitychange"/);
  assert.match(storeVisitsListH5, /document\.visibilityState === "visible"/);
  assert.match(storeVisitsListH5, /void loadVisits\(1, false, user\)/);
});

test("offline uploads dashboard uses analysis_status for analysis outcomes instead of visit_status result shortcuts", () => {
  assert.match(offlineUploadsPage, /visit\.analysis_status === "completed"/);
  assert.match(offlineUploadsPage, /visit\.analysis_status === "failed"/);
  assert.doesNotMatch(offlineUploadsPage, /visit\.visit_status === "analyzed"/);
  assert.doesNotMatch(offlineUploadsPage, /visit\.visit_status === "failed"/);
});

test("new H5 store visit clears stale local user when server session is gone", () => {
  assert.match(storeVisitH5, /\/api\/auth\/session/);
  assert.match(storeVisitH5, /localStorage\.removeItem\(storageKey\)/);
  assert.match(storeVisitH5, /payload\.user\?\.id/);
  assert.match(storeVisitH5, /setUser\(null\)/);
  assert.match(storeVisitH5, /setUserLoaded\(true\)/);
});

test("new H5 store visit resets to signed-out state when protected APIs return auth failures", () => {
  assert.match(storeVisitH5, /function handleAuthFailure\(/);
  assert.match(storeVisitH5, /response\.status !== 401/);
  assert.match(storeVisitH5, /localStorage\.removeItem\(storageKey\)/);
  assert.match(storeVisitH5, /setSelectedStore\(null\)/);
  assert.match(storeVisitH5, /setError\(copy\.signInFirst\)/);
  assert.match(storeVisitH5, /handleAuthFailure\(res, typeof data\.error === "string" \? data\.error : null\)/);
});

test("new H5 store search children receive auth failure handling through props", () => {
  assert.match(storeVisitH5, /<StoreSearchStep locale=\{locale\} user=\{user\} onAuthFailure=\{handleAuthFailure\}/);
  assert.match(storeVisitH5, /function StoreSearchStep\(\{\s*locale,\s*user,\s*onAuthFailure,/s);
  assert.match(storeVisitH5, /<NewStoreSearchFlow locale=\{locale\} user=\{user\} query=\{query\} onAuthFailure=\{onAuthFailure\}/);
  assert.match(storeVisitH5, /function NewStoreSearchFlow\(\{\s*locale,\s*user,\s*query,\s*onAuthFailure,/s);
  assert.match(storeVisitH5, /function GoogleStoreTypeSheet\(\{\s*locale,\s*store,\s*locationReady,\s*loading,\s*onClose,\s*onAuthFailure,/s);
  assert.match(storeVisitH5, /function CreateStoreSheet\(\{\s*locale,\s*user,\s*onClose,\s*onAuthFailure,/s);
  assert.match(storeVisitH5, /onAuthFailure\(res, typeof data\.error === "string" \? data\.error : null\)/);
  assert.doesNotMatch(storeVisitH5, /function NewStoreSearchFlow[\s\S]*?function ReadOnlyRow[\s\S]*?handleAuthFailure\(res,/);
});

test("new store sheet actively checks location permission before allowing manual store creation", () => {
  assert.match(storeVisitH5, /function CreateStoreSheet/);
  assert.match(storeVisitH5, /const \[entryLocationReady, setEntryLocationReady\] = useState\(Boolean\(initialLocation\)\)/);
  assert.match(storeVisitH5, /const \[entryLocationChecking, setEntryLocationChecking\] = useState\(false\)/);
  assert.match(storeVisitH5, /const \[entryLocationAttempted, setEntryLocationAttempted\] = useState\(Boolean\(initialLocation\)\)/);
  assert.match(storeVisitH5, /const \[entryLocationError, setEntryLocationError\] = useState<string \| null>\(null\)/);
  assert.match(storeVisitH5, /const ensureEntryLocation = useCallback\(\(\) => \{/);
  assert.match(storeVisitH5, /setEntryLocationAttempted\(true\)/);
  assert.match(storeVisitH5, /setEntryLocationError\(labels\.entryLocationUnsupported\)/);
  assert.match(storeVisitH5, /setEntryLocationError\(labels\.entryLocationDenied\)/);
  assert.match(storeVisitH5, /useEffect\(\(\) => \{\s*if \(entryLocationReady \|\| entryLocationChecking \|\| entryLocationAttempted\) return;/s);
  assert.match(storeVisitH5, /\}, \[ensureEntryLocation, entryLocationAttempted, entryLocationChecking, entryLocationReady\]\)/);
  assert.match(storeVisitH5, /if \(!entryLocationReady\) \{/);
  assert.match(storeVisitH5, /labels\.entryLocationRequiredTitle/);
  assert.match(storeVisitH5, /labels\.entryLocationRequiredBody/);
  assert.match(storeVisitH5, /labels\.entryLocationRetry/);
  assert.match(storeVisitH5, /onClick=\{\(\) => setShowCreate\(true\)\}/);
  assert.match(storeVisitH5, /if \(!storeLocation\) \{\s*setError\(labels\.entryLocationDenied\);/s);
  assert.match(storeVisitH5, /disabled=\{loading \|\| !selectedDealer \|\| !selectedExternalStore \|\| !storeLocation\}/);
  assert.doesNotMatch(storeVisitH5, /if \(!user \|\| entryLocationReady \|\| entryLocationChecking\) return/);
});

test("H5 google store creation requires and saves current H5 location evidence", () => {
  assert.match(storeVisitH5, /function NewStoreSearchFlow/);
  assert.match(storeVisitH5, /function requireCurrentLocation\(\) \{\s*setError\(labels\.locationFailed\);\s*setLocationStatus\(labels\.locationFailed\);/s);
  assert.match(storeVisitH5, /if \(!storeLocation\) \{\s*requireCurrentLocation\(\);[\s\S]*?return;\s*\}/);
  assert.match(storeVisitH5, /latitude: storeLocation\.latitude/);
  assert.match(storeVisitH5, /longitude: storeLocation\.longitude/);
  assert.match(storeVisitH5, /location_accuracy_m: storeLocation\.location_accuracy_m/);
  assert.match(storeVisitH5, /location_captured_at: storeLocation\.location_captured_at/);
  assert.doesNotMatch(storeVisitH5, /function materializeSelectedGoogleStore[\s\S]*?latitude: store\.latitude \?\? null/);
  assert.match(storeVisitH5, /initialLocation=\{storeLocation\}/);
  assert.match(storeVisitH5, /locationReady=\{Boolean\(storeLocation\)\}/);
  assert.match(storeVisitH5, /onNeedLocation=\{\(\) => \{\s*requireCurrentLocation\(\);/s);
});

test("new store modal stays inside the mobile webview when the keyboard opens", () => {
  assert.match(storeVisitH5, /max-h-\[100dvh\]/);
  assert.match(storeVisitH5, /overflow-y-auto overscroll-contain/);
  assert.match(storeVisitH5, /sticky top-0/);
  assert.match(storeVisitH5, /sticky bottom-0/);
  assert.match(storeVisitH5, /pb-\[max\(1rem,env\(safe-area-inset-bottom\)\)\]/);
  assert.doesNotMatch(storeVisitH5, /function CreateStoreSheet[\s\S]*?return \(\s*<div className="fixed inset-0 z-50 flex items-end/s);
  assert.doesNotMatch(storeVisitH5, /function GoogleStoreTypeSheet[\s\S]*?function CreateStoreSheet[\s\S]*?mx-auto w-full max-w-md rounded-t-2xl bg-white p-5/);
});

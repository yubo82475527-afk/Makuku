import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const migrationPath = "supabase/migrations/202607080001_store_visit_image_thumbnails.sql";
const helperPath = "src/lib/store-visit-image-variants.ts";
const backfillScriptPath = "scripts/backfill-store-visit-thumbnails.mjs";

const migration = existsSync(migrationPath) ? readFileSync(migrationPath, "utf8") : "";
const helperFile = existsSync(helperPath) ? readFileSync(helperPath, "utf8") : "";
const typesFile = readFileSync("src/lib/types.ts", "utf8");
const packageFile = readFileSync("package.json", "utf8");
const storeVisitImageRoute = readFileSync("src/app/api/store-visit/[id]/images/route.ts", "utf8");
const offlineVisitImageRoute = readFileSync("src/app/api/offline-store-visits/[id]/images/route.ts", "utf8");
const createVisitRoute = readFileSync("src/app/api/store-visit/route.ts", "utf8");
const storeVisitDetailRoute = readFileSync("src/app/api/store-visit/[id]/route.ts", "utf8");
const offlineVisitDetailRoute = readFileSync("src/app/api/offline-store-visits/[id]/route.ts", "utf8");
const storeVisitDetailH5 = readFileSync("src/components/store-visit-detail-h5.tsx", "utf8");
const mobileOfflineApp = readFileSync("src/components/mobile-offline-app.tsx", "utf8");
const thumbnailGallery = readFileSync("src/components/store-visit-thumbnail-gallery.tsx", "utf8");
const aiPriceCandidatesWorkbench = readFileSync("src/components/ai-price-candidates-workbench.tsx", "utf8");
const backfillScript = existsSync(backfillScriptPath) ? readFileSync(backfillScriptPath, "utf8") : "";
const storeVisitOriginalRoutePath = "src/app/api/store-visit/[id]/image-url/route.ts";
const offlineVisitOriginalRoutePath = "src/app/api/offline-store-visits/[id]/image-url/route.ts";
const storeVisitThumbnailProxyRoutePath = "src/app/api/store-visit/[id]/images/[imageId]/thumbnail/route.ts";
const thumbnailTokenPath = "src/lib/store-visit-thumbnail-token.ts";
const storeVisitOriginalRoute = existsSync(storeVisitOriginalRoutePath) ? readFileSync(storeVisitOriginalRoutePath, "utf8") : "";
const offlineVisitOriginalRoute = existsSync(offlineVisitOriginalRoutePath) ? readFileSync(offlineVisitOriginalRoutePath, "utf8") : "";
const storeVisitThumbnailProxyRoute = existsSync(storeVisitThumbnailProxyRoutePath) ? readFileSync(storeVisitThumbnailProxyRoutePath, "utf8") : "";
const thumbnailTokenFile = existsSync(thumbnailTokenPath) ? readFileSync(thumbnailTokenPath, "utf8") : "";

test("thumbnail migration persists paths for current and legacy store visit images", () => {
  assert.ok(existsSync(migrationPath), "thumbnail migration should exist");
  assert.match(migration, /alter table public\.offline_visit_images\s+add column if not exists thumbnail_path text/i);
  assert.match(migration, /alter table public\.offline_store_visits\s+add column if not exists image_thumbnail_paths text\[\]/i);
  assert.match(typesFile, /thumbnail_path\?: string \| null;/);
  assert.match(typesFile, /image_thumbnail_paths\?: string\[\] \| null;/);
});

test("upload routes generate and persist thumbnails for new images", () => {
  assert.match(packageFile, /"sharp":/);
  assert.ok(existsSync(helperPath), "thumbnail helper should exist");
  assert.match(helperFile, /export async function createStoreVisitThumbnail/);
  assert.match(helperFile, /export function buildStoreVisitThumbnailPath/);
  assert.match(helperFile, /storeVisitThumbnailContentType = "image\/jpeg"/);
  assert.match(helperFile, /\.jpeg\(\{ quality: thumbnailQuality, mozjpeg: true \}\)/);
  assert.doesNotMatch(helperFile, /\.webp\(/);
  assert.match(storeVisitImageRoute, /thumbnail_path:/);
  assert.match(offlineVisitImageRoute, /thumbnail_path:/);
  assert.match(createVisitRoute, /image_thumbnail_paths:/);
});

test("detail routes sign thumbnails first and expose per-image original URL endpoints", () => {
  assert.match(storeVisitDetailRoute, /thumbnail_path/);
  assert.match(storeVisitDetailRoute, /createSignedThumbnailUrl/);
  assert.match(storeVisitDetailRoute, /thumbnailPath,/);
  assert.match(storeVisitDetailRoute, /requireAppSession\(request\)/);
  assert.match(offlineVisitDetailRoute, /thumbnail_path/);
  assert.match(offlineVisitDetailRoute, /requireAppSession\(request\)/);
  assert.ok(existsSync(storeVisitOriginalRoutePath), "store visit original image endpoint should exist");
  assert.ok(existsSync(offlineVisitOriginalRoutePath), "offline visit original image endpoint should exist");
  assert.match(storeVisitOriginalRoute, /requireAppSession\(request\)/);
  assert.match(storeVisitOriginalRoute, /searchParams\.get\("image_id"\)/);
  assert.match(offlineVisitOriginalRoute, /requireAppSession\(request\)/);
  assert.match(offlineVisitOriginalRoute, /searchParams\.get\("image_id"\)/);
});

test("thumbnail UIs lazy-load originals only when the user opens a preview", () => {
  assert.match(storeVisitDetailH5, /fetchOriginalImageUrl/);
  assert.match(storeVisitDetailH5, /setActiveImage\(\{ status: "loading"/);
  assert.match(mobileOfflineApp, /fetchOriginalImageUrl/);
  assert.match(thumbnailGallery, /fetchOriginalImageUrl/);
  assert.match(aiPriceCandidatesWorkbench, /fetchOriginalImageUrl/);
  assert.match(aiPriceCandidatesWorkbench, /setActiveImage\(\{ status: "loading"/);
});

test("H5 price thumbnails are served through same-origin thumbnail proxy", () => {
  assert.ok(existsSync(storeVisitThumbnailProxyRoutePath), "same-origin thumbnail proxy should exist");
  assert.ok(existsSync(thumbnailTokenPath), "thumbnail token helper should exist");
  assert.match(storeVisitThumbnailProxyRoute, /requireAppSession\(request\)/);
  assert.match(storeVisitThumbnailProxyRoute, /readStoreVisitThumbnailToken/);
  assert.match(storeVisitThumbnailProxyRoute, /thumbnail_path/);
  assert.match(storeVisitThumbnailProxyRoute, /buildStoreVisitThumbnailPath/);
  assert.match(storeVisitThumbnailProxyRoute, /Cache-Control/);
  assert.match(storeVisitThumbnailProxyRoute, /retryDelaysMs/);
  assert.match(thumbnailTokenFile, /createStoreVisitThumbnailToken/);
  assert.match(storeVisitDetailRoute, /createStoreVisitThumbnailToken/);
  assert.match(storeVisitDetailH5, /thumbnailSrcForImage/);
  assert.match(storeVisitDetailH5, /thumbnailRetryVersions/);
  assert.match(storeVisitDetailH5, /onRetryThumbnail/);
  assert.doesNotMatch(storeVisitDetailH5, /const previewUrl = sectionLocalUpload\?\.previewUrl \?\? section\.signedImage\?\.url \?\? null;/);
});

test("detail thumbnails never silently fall back to originals inside the page", () => {
  assert.doesNotMatch(storeVisitDetailRoute, /fallbackPath:\s*path/);
  assert.doesNotMatch(storeVisitDetailRoute, /fallbackPath:\s*image\.image_path/);
  assert.doesNotMatch(offlineVisitDetailRoute, /thumbnailResult\.data\?\.signedUrl\s*\?\?\s*data\?\.signedUrl/);
  assert.doesNotMatch(storeVisitDetailH5, /setStoredPreviewOverrides/);
  assert.doesNotMatch(storeVisitDetailH5, /const originalUrl = await fetchOriginalImageUrl/);
  assert.doesNotMatch(mobileOfflineApp, /image\.thumbnail_url\s*\?\?\s*image\.image_url/);
});

test("waiting-screen polling stays lightweight and a backfill script exists for history", () => {
  assert.match(offlineVisitDetailRoute, /if \(mode === "status"\)/);
  assert.ok(existsSync(backfillScriptPath), "thumbnail backfill script should exist");
  assert.match(backfillScript, /offline_visit_images/);
  assert.match(backfillScript, /image_thumbnail_paths/);
  assert.match(backfillScript, /createStoreVisitThumbnail/);
  assert.match(backfillScript, /replaceWebp/);
  assert.match(backfillScript, /image\/jpeg/);
  assert.match(backfillScript, /const pageStart = apply \? 0 : from;/);
  assert.match(backfillScript, /\.range\(pageStart, pageStart \+ PAGE_SIZE - 1\)/);
});

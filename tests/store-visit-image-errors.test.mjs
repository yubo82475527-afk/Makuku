import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const helperPath = "src/lib/store-visit-image-errors.ts";
const helperFile = existsSync(helperPath) ? readFileSync(helperPath, "utf8") : "";
const imageRoute = readFileSync("src/app/api/store-visit/[id]/images/route.ts", "utf8");
const refreshRoute = readFileSync("src/app/api/store-visit/[id]/refresh/route.ts", "utf8");
const detailH5 = readFileSync("src/components/store-visit-detail-h5.tsx", "utf8");

test("store visit image helper defines supported upload formats and summarizes provider image errors", () => {
  assert.ok(existsSync(helperPath), "image error helper should exist");
  assert.match(helperFile, /supportedStoreVisitImageMimeTypes/);
  assert.match(helperFile, /image\/jpeg/);
  assert.match(helperFile, /image\/png/);
  assert.match(helperFile, /image\/gif/);
  assert.match(helperFile, /image\/webp/);
  assert.match(helperFile, /isSupportedStoreVisitImageFile/);
  assert.match(helperFile, /summarizeStoreVisitImageError/);
  assert.match(helperFile, /HEIC/i);
  assert.match(helperFile, /JPG\/PNG\/WebP\/GIF/);
});

test("store visit image upload rejects unsupported image formats before storage", () => {
  assert.match(imageRoute, /isSupportedStoreVisitImageFile/);
  assert.match(imageRoute, /unsupportedStoreVisitImageFormatMessage/);
  assert.doesNotMatch(imageRoute, /if \(!file\.type\.startsWith\("image\/"\)\) \{/);
});

test("store visit refresh rejects unsupported stored image formats before reanalysis", () => {
  assert.match(refreshRoute, /content_type/);
  assert.match(refreshRoute, /file_name/);
  assert.match(refreshRoute, /isSupportedStoreVisitImageFile/);
  assert.match(refreshRoute, /unsupportedStoreVisitImageFormatMessage/);
});

test("H5 detail summarizes system image errors instead of dumping raw provider payloads", () => {
  assert.match(detailH5, /summarizeStoreVisitImageError/);
  assert.match(detailH5, /const message = summarizeStoreVisitImageError/);
  assert.doesNotMatch(detailH5, /const systemError = image\.analysis_error \?\? image\.error_message \?\? ""/);
});

test("H5 detail groups repeated summarized system errors into shared sections", () => {
  assert.match(detailH5, /groupedSystemFailedImages/);
  assert.match(detailH5, /new Map<string, \{ message: string; images: OfflineVisitImage\[\] \}>/);
  assert.match(detailH5, /images\.length > 1/);
  assert.match(detailH5, /text\.systemError\} \{index \+ 1\}/);
  assert.doesNotMatch(detailH5, /systemFailedImages\.map\(\(image, index\)/);
});

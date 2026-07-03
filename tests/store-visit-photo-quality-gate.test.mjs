import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const storeVisitAi = readFileSync("src/lib/store-visit-ai.ts", "utf8");
const storeVisitAiDebug = readFileSync("src/lib/store-visit-ai-debug.ts", "utf8");
const storeVisitH5 = readFileSync("src/components/store-visit-h5.tsx", "utf8");
const storeVisitDetailH5 = readFileSync("src/components/store-visit-detail-h5.tsx", "utf8");
const storeVisitsListH5 = readFileSync("src/components/store-visits-list-h5.tsx", "utf8");
const typesFile = readFileSync("src/lib/types.ts", "utf8");

test("price image prompt includes the two-state photo quality gate without adding OCR precheck calls", () => {
  assert.match(storeVisitAi, /photo_quality/);
  assert.match(storeVisitAi, /pass\|retake_required/);
  assert.match(storeVisitAi, /wide shelf overview/);
  assert.match(storeVisitAi, /rows must be \[\]/i);
  assert.match(storeVisitAi, /front-facing or nearly front-facing/);
  assert.match(storeVisitAi, /background labels are unreadable/);
  assert.match(storeVisitAi, /severe perspective distortion/);
  assert.doesNotMatch(storeVisitAi, /OCR|optical character recognition|precheck/i);
  assert.doesNotMatch(storeVisitAi, /\/api\/.*precheck|photo-quality|quality-gate/i);
});

test("price image prompt forces package-level amounts and forbids per-piece outputs in price fields", () => {
  assert.match(storeVisitAi, /list_price_idr, package_price_idr, and net_price_idr must ALWAYS represent WHOLE PACKAGE prices/i);
  assert.match(storeVisitAi, /Never divide package prices by piece_count/i);
  assert.match(storeVisitAi, /Do not output 1400, 3210, or any other per-piece value in list_price_idr, package_price_idr, or net_price_idr/i);
});

test("price image prompt forces same-row Pcs bonus extraction instead of truncating to base quantity", () => {
  assert.match(storeVisitAi, /read the original Pcs cell/i);
  assert.match(storeVisitAi, /60\+6 -> 66/i);
  assert.match(storeVisitAi, /42\+4 -> 46/i);
  assert.match(storeVisitAi, /80\+10 -> 90/i);
  assert.match(storeVisitAi, /bonus digits are unreadable, set piece_count=null and add PARSE_RISK/i);
  assert.match(storeVisitAi, /Never discard visible bonus quantity/i);
});

test("price image prompt requires row-level evidence and Indonesian handwritten 7 handling", () => {
  assert.match(storeVisitAi, /piece_count_text/);
  assert.match(storeVisitAi, /list_price_text/);
  assert.match(storeVisitAi, /package_price_text/);
  assert.match(storeVisitAi, /net_price_text/);
  assert.match(storeVisitAi, /visible_price_per_piece_text/);
  assert.match(storeVisitAi, /SAME row/);
  assert.match(storeVisitAi, /handwritten digit 7 may contain a horizontal middle stroke/i);
  assert.match(storeVisitAi, /2\.678 -> visible_price_per_piece_text=/i);
  assert.match(storeVisitAi, /visible_price_per_piece_idr=2678/i);
});

test("price image prompt keeps promo package and promo per-piece evidence together", () => {
  assert.match(storeVisitAi, /both NORMAL and PROMO price sections/i);
  assert.match(storeVisitAi, /package_price_text, net_price_text, and visible_price_per_piece_text should come from the visible PROMO section/i);
  assert.match(storeVisitAi, /PROMO evidence is valid ONLY when the PROMO\/PACK or PROMO\/PCS cell is visibly printed in the SAME row/i);
  assert.match(storeVisitAi, /Never copy, inherit, carry down, or repeat PROMO package price or PROMO per-piece price from another row/i);
  assert.match(storeVisitAi, /same-row PROMO cell is blank, hidden, cropped, or unclear/i);
});

test("price image analysis has enough token budget for row-level evidence fields", () => {
  assert.match(storeVisitAi, /maxTokens: Math\.min\(config\.max_tokens, 6000\)/);
  assert.doesNotMatch(storeVisitAi, /maxTokens: Math\.min\(config\.max_tokens, 2500\)/);
});

test("price image analysis type carries photo_quality two-state result", () => {
  assert.match(typesFile, /photo_quality: StoreVisitPhotoQuality/);
  assert.match(typesFile, /status: "pass" \| "retake_required"/);
  assert.match(typesFile, /"price_unclear"[\s\S]*"angled_affects_reading"[\s\S]*"price_obstructed"/);
  assert.match(typesFile, /message: string/);
});

test("normalization defaults malformed photo quality to pass and only accepts whitelisted retake reasons", () => {
  assert.match(storeVisitAi, /normalizePhotoQuality/);
  assert.match(storeVisitAi, /photoQualityReasonValues/);
  assert.match(storeVisitAi, /\? "retake_required"\s*: "pass"/);
  assert.match(storeVisitAi, /retake_required/);
  assert.match(storeVisitAi, /reasons\.length > 0/);
});

test("analysis accepts retake-required empty-row results and excludes them from price aggregation", () => {
  assert.match(storeVisitAiDebug, /isRetakeRequiredPriceImageResult/);
  assert.match(storeVisitAiDebug, /photo_quality\?\.status === "retake_required"/);
  assert.match(storeVisitAiDebug, /priceImageResults\.filter\(\(item\) => item\.result\.photo_quality\?\.status !== "retake_required"\)/);
  assert.match(storeVisitAiDebug, /price_image_retake_required/);
});

test("H5 capture page exposes photo examples for price-tag sections", () => {
  assert.match(storeVisitH5, /photoExampleImages = \{/);
  assert.match(storeVisitH5, /photoExampleCorrectTitle/);
  assert.match(storeVisitH5, /photoExampleWrongTitle/);
  assert.match(storeVisitH5, /photoExampleCorrectCaptions/);
  assert.match(storeVisitH5, /photoExampleWrongCaptions/);
  assert.match(storeVisitH5, /Correct Examples/);
  assert.match(storeVisitH5, /Wrong Examples/);
  assert.match(storeVisitH5, /store-visit-photo-examples\/correct-1\.jpeg/);
  assert.match(storeVisitH5, /store-visit-photo-examples\/correct-2\.jpg/);
  assert.match(storeVisitH5, /store-visit-photo-examples\/correct-3\.jpg/);
  assert.match(storeVisitH5, /store-visit-photo-examples\/wrong-1\.jpg/);
  assert.match(storeVisitH5, /store-visit-photo-examples\/wrong-2\.jpeg/);
  assert.match(storeVisitH5, /store-visit-photo-examples\/wrong-3\.jpeg/);
  assert.doesNotMatch(storeVisitH5, /photoExampleLabel\?: string \| null/);
  assert.doesNotMatch(storeVisitH5, /onOpenPhotoExample\?: \(\) => void/);
});

test("H5 capture page shows a compact red Photo Example tag beside Visit Photos instead of per-card pills", () => {
  assert.match(storeVisitH5, /copy\.shelfPhotos/);
  assert.match(storeVisitH5, /setPhotoExampleSheet\("makuku_shelf"\)/);
  assert.match(storeVisitH5, /bg-red-50/);
  assert.match(storeVisitH5, /text-red-700/);
  assert.match(storeVisitH5, /ring-1 ring-inset ring-red-200/);
  assert.match(storeVisitH5, /h-5 items-center/);
  assert.match(storeVisitH5, /text-\[10px\]/);
  assert.match(storeVisitH5, /shadow-sm shadow-red-100\/60/);
  assert.doesNotMatch(storeVisitH5, /inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0\.5 text-\[11px\] font-semibold text-slate-600/);
});

test("H5 photo example sheet supports vertical scrolling when content exceeds the viewport", () => {
  assert.match(storeVisitH5, /max-h-\[85vh\]/);
  assert.match(storeVisitH5, /overflow-y-auto/);
  assert.match(storeVisitH5, /overscroll-contain/);
});

test("H5 detail separates retake-required business failures from system errors", () => {
  assert.match(storeVisitDetailH5, /isRetakeRequiredPriceImage/);
  assert.match(storeVisitDetailH5, /请重新上传该图片/);
  assert.match(storeVisitDetailH5, /retakePhoto/);
  assert.match(storeVisitDetailH5, /replaceFromAlbum/);
  assert.match(storeVisitDetailH5, /businessRetakeImages/);
  assert.match(storeVisitDetailH5, /systemFailedImages/);
  assert.match(storeVisitDetailH5, /needsRetake && !isProcessingRetake && !isAnalyzingImage/);
});

test("H5 list guides users into visits that have price-tag photos requiring retake", () => {
  assert.match(storeVisitsListH5, /pricePhotoRetakeRequired:/);
  assert.match(storeVisitsListH5, /Open details to retake or replace it./);
  assert.match(storeVisitsListH5, /status === "partial" \|\| status === "action_required" \|\| status === "failed"/);
  assert.doesNotMatch(storeVisitsListH5, /function hasPricePhotoRetakeRequired/);
});

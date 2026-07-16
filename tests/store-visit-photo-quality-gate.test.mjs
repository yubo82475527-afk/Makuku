import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const storeVisitAi = readFileSync("src/lib/store-visit-ai.ts", "utf8");
const storeVisitAiDebug = readFileSync("src/lib/store-visit-ai-debug.ts", "utf8");
const storeVisitH5 = readFileSync("src/components/store-visit-h5.tsx", "utf8");
const storeVisitDetailH5 = readFileSync("src/components/store-visit-detail-h5.tsx", "utf8");
const storeVisitsListH5 = readFileSync("src/components/store-visits-list-h5.tsx", "utf8");
const typesFile = readFileSync("src/lib/types.ts", "utf8");

test("price image prompt uses a majority-readable photo quality gate without adding OCR precheck calls", () => {
  assert.match(storeVisitAi, /photo_quality/);
  assert.match(storeVisitAi, /pass\|retake_required/);
  assert.match(storeVisitAi, /rows must be \[\]/i);
  assert.match(storeVisitAi, /PHOTO QUALITY:/);
  assert.match(storeVisitAi, /primary price board, price tag, or promotion card/i);
  assert.match(storeVisitAi, /clear majority of visible rows are readable/i);
  assert.match(storeVisitAi, /One or two isolated readable rows are not enough/i);
  assert.match(storeVisitAi, /other distant, cropped, or unrelated boards/i);
  assert.match(storeVisitAi, /actual effect on digit readability and same-row binding/i);
  assert.match(storeVisitAi, /Do not treat handwriting or strike-throughs as price_obstructed/i);
  assert.doesNotMatch(storeVisitAi, /at least one product-price relationship is visually reliable/);
  assert.doesNotMatch(storeVisitAi, /long side-angle shelf shot/i);
  assert.doesNotMatch(storeVisitAi, /OCR|optical character recognition|precheck/i);
  assert.doesNotMatch(storeVisitAi, /\/api\/.*precheck|photo-quality|quality-gate/i);
});

test("price image prompt scopes promotion-card titles and handwritten evidence to the same visual section", () => {
  assert.match(storeVisitAi, /TITLE AND PRODUCT CONTEXT:/);
  assert.match(storeVisitAi, /applies to all following rows inside that same visual card or section/i);
  assert.match(storeVisitAi, /until the next title, card boundary, or board boundary/i);
  assert.match(storeVisitAi, /Do not apply it to a neighboring card, board, or section/i);
  assert.match(storeVisitAi, /crossed-out handwritten price in the same row is the original\/list price/i);
  assert.match(storeVisitAi, /following visible price in that same row is the promotion price/i);
  assert.match(storeVisitAi, /Do not require retake because a price is handwritten or crossed out/i);
});

test("price image prompt is evidence-only and does not ask vision to output business price fields", () => {
  assert.match(storeVisitAi, /PRIMARY PRINCIPLE/i);
  assert.match(storeVisitAi, /evidence extractor, not a pricing engine/i);
  assert.match(storeVisitAi, /must never perform business reasoning, promotion selection, price reconciliation, value propagation, or price calculation/i);
  assert.match(storeVisitAi, /Evidence Completeness is NOT required/i);
  assert.doesNotMatch(storeVisitAi, /BUSINESS FIELD COMPATIBILITY/i);
  assert.doesNotMatch(storeVisitAi, /"list_price_text":"129\.900"/);
  assert.doesNotMatch(storeVisitAi, /"package_price_text":"119\.900"/);
  assert.doesNotMatch(storeVisitAi, /"net_price_text":"119\.900"/);
  assert.doesNotMatch(storeVisitAi, /"visible_price_per_piece_text":"2\.725"/);
  assert.doesNotMatch(storeVisitAi, /"list_price_idr":129900/);
  assert.doesNotMatch(storeVisitAi, /"package_price_idr":119900/);
  assert.doesNotMatch(storeVisitAi, /"net_price_idr":119900/);
  assert.doesNotMatch(storeVisitAi, /"visible_price_per_piece_idr":2725/);
});

test("price image prompt forbids calculated or pattern-filled board prices", () => {
  assert.match(storeVisitAi, /CELL TRANSCRIPTION RULE/i);
  assert.match(storeVisitAi, /copy each visible cell exactly as printed or handwritten in that same row/i);
  assert.match(storeVisitAi, /Do not calculate, infer, complete, average, normalize, or propagate prices across rows/i);
  assert.match(storeVisitAi, /never replace it with a value from another row, a computed value, or a repeated pattern/i);
  assert.match(storeVisitAi, /Never derive HARGA\/PCS by dividing HARGA\/PACK by PCS/i);
});

test("price image prompt forces same-row Pcs bonus extraction instead of truncating to base quantity", () => {
  assert.match(storeVisitAi, /read the original Pcs cell from the SAME row/i);
  assert.match(storeVisitAi, /60\+6 -> 66/i);
  assert.match(storeVisitAi, /80\+10 -> 90/i);
  assert.match(storeVisitAi, /bonus digits are unreadable, piece_count=null and add PARSE_RISK/i);
});

test("price image prompt requires row-level evidence and Indonesian handwritten 7 handling", () => {
  assert.match(storeVisitAi, /source_type/);
  assert.match(storeVisitAi, /PRICE_BOARD_ROW/);
  assert.match(storeVisitAi, /PRICE_TAG/);
  assert.match(storeVisitAi, /group_id/);
  assert.match(storeVisitAi, /section_title/);
  assert.match(storeVisitAi, /row_anchor/);
  assert.match(storeVisitAi, /piece_count_text/);
  assert.match(storeVisitAi, /normal_package_text/);
  assert.match(storeVisitAi, /normal_piece_text/);
  assert.match(storeVisitAi, /promo_package_text/);
  assert.match(storeVisitAi, /promo_piece_text/);
  assert.match(storeVisitAi, /promo_label/);
  assert.match(storeVisitAi, /same visual evidence group/i);
  assert.match(storeVisitAi, /same horizontal row/i);
  assert.match(storeVisitAi, /same individual tag/i);
  assert.match(storeVisitAi, /handwritten digit 7 may contain a horizontal middle stroke/i);
  assert.match(storeVisitAi, /2\.678.*means 2678/i);
});

test("price image prompt retains the complete compact JSON output contract", () => {
  assert.match(storeVisitAi, /Return ONLY valid compact JSON/i);
  assert.match(storeVisitAi, /No markdown/i);
  assert.match(storeVisitAi, /No explanation/i);
  assert.match(storeVisitAi, /"photo_quality":\{"status":"pass\|retake_required"/);
  assert.match(storeVisitAi, /"source_type":"PRICE_BOARD_ROW\|PRICE_TAG"/);
  assert.match(storeVisitAi, /"normal_package_price_confidence":0\.9/);
  assert.match(storeVisitAi, /"product_identity_confidence":0\.9/);
  assert.match(storeVisitAi, /"warnings":\[\]/);
});

test("price image prompt keeps promo package and promo per-piece evidence together", () => {
  assert.match(storeVisitAi, /HARGA PROMO \/ PACK -> promo_package_text/i);
  assert.match(storeVisitAi, /Empty visible promo cells must remain empty/i);
  assert.match(storeVisitAi, /Do not copy promo price from another row/i);
  assert.match(storeVisitAi, /Do not carry down promo price/i);
  assert.match(storeVisitAi, /Do not infer promo from normal price/i);
  assert.match(storeVisitAi, /If the evidence field is empty, its confidence must be null/i);
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

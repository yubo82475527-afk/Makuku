import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const candidatesPage = readFileSync("src/app/[locale]/offline-price-candidates/page.tsx", "utf8");
const workbenchPath = "src/components/ai-price-candidates-workbench.tsx";
const workbench = readFileSync(workbenchPath, "utf8");
const storeVisitRoute = readFileSync("src/app/api/store-visit/[id]/route.ts", "utf8");
const storeVisitRefreshRoute = readFileSync("src/app/api/store-visit/[id]/refresh/route.ts", "utf8");
const storeVisitDetailH5 = readFileSync("src/components/store-visit-detail-h5.tsx", "utf8");
const candidateRoute = readFileSync("src/app/api/ai-price-candidates/[id]/route.ts", "utf8");
const storeVisitCandidateRoute = readFileSync("src/app/api/store-visit/price-candidates/[id]/route.ts", "utf8");
const candidateListRoute = readFileSync("src/app/api/ai-price-candidates/route.ts", "utf8");
const aiPriceReview = readFileSync("src/lib/ai-price-review.ts", "utf8");
const dataFile = readFileSync("src/lib/data.ts", "utf8");
const typesFile = readFileSync("src/lib/types.ts", "utf8");
const materialMasterRoute = readFileSync("src/app/api/material-master/route.ts", "utf8");
const competitorsRoute = readFileSync("src/app/api/competitors/route.ts", "utf8");
const storeVisitMatchOptionsRoute = readFileSync("src/app/api/store-visit/match-options/route.ts", "utf8");
const candidateExportRoute = readFileSync("src/app/api/ai-price-candidates/export/route.ts", "utf8");

test("photo price review keeps compact date filter and export action", () => {
  assert.doesNotMatch(candidatesPage, /SelectInput/);
  assert.doesNotMatch(candidatesPage, /name="status"/);
  assert.match(candidatesPage, /DateRangeFilter/);
  assert.match(candidatesPage, /aria-label=\{label\}/);
  assert.match(candidatesPage, /<Card className="mb-4">/);
  assert.match(candidatesPage, /<form className="grid gap-3/);
  assert.match(candidatesPage, /Export CSV/);
  assert.doesNotMatch(candidatesPage, /TextInput name="date_from"/);
  assert.doesNotMatch(candidatesPage, /TextInput name="date_to"/);
});

test("photo price review uses a paginated review table instead of evidence cards", () => {
  assert.match(candidatesPage, /AiPriceCandidatesWorkbench/);
  assert.match(candidatesPage, /pageParam/);
  assert.match(candidatesPage, /perPageParam/);
  assert.match(candidatesPage, /total/);
  assert.doesNotMatch(candidatesPage, /<article/);
  assert.doesNotMatch(candidatesPage, /space-y-3/);
});

test("photo price review uses status tabs instead of top status dropdown", () => {
  assert.match(workbench, /function StatusTabs/);
  assert.match(workbench, /pending.*approved.*rejected.*all/s);
  assert.match(workbench, /statusTabs/);
  assert.match(workbench, /URLSearchParams/);
  assert.match(candidatesPage, /status:\s*currentStatus/);
  assert.match(workbench, /params\.set\("status", status\)/);
  assert.doesNotMatch(candidatesPage, /statusHref/);
  assert.doesNotMatch(candidatesPage, /tabClass/);
});

test("photo price review removes auto-approval configuration and shows read-only rule explanation", () => {
  assert.doesNotMatch(workbench, /ReviewRuleModal/);
  assert.doesNotMatch(workbench, /ruleModalOpen/);
  assert.doesNotMatch(workbench, /setRuleModalOpen/);
  assert.match(workbench, /RejectReasonDialog/);
  assert.match(workbench, /rejectDialog/);
  assert.match(workbench, /onJobCreated/);
  assert.match(workbench, /await rejectSelected\(reason, \(\) => \{/);
  assert.match(workbench, /dialogClosed = true;\s*setRejectDialog\(null\);/);
  assert.doesNotMatch(workbench, /setRejectDialog\(null\);\s*try \{/);
  assert.match(workbench, /autoApprovalExplanation/);
  assert.match(workbench, /自动通过规则说明/);
  assert.match(workbench, /价格证据清晰且无异常/);
  assert.doesNotMatch(workbench, /系统审核建议=自动通过/);
  assert.doesNotMatch(workbench, /异常数=0/);
  assert.doesNotMatch(workbench, /价格证据=CLEAR/);
  assert.doesNotMatch(workbench, /\/api\/ai-price-review-rules/);
  assert.doesNotMatch(workbench, /min_ai_confidence.*onChange/s);
  assert.doesNotMatch(workbench, /min_match_score.*onChange/s);
  assert.doesNotMatch(workbench, /ReviewRulePanel/);
  assert.doesNotMatch(workbench, /placeholder=\{copy\.rejectReason\} className="h-9 min-w-64/);
});

test("photo price review keeps bulk toolbar hidden until pending rows are selected", () => {
  assert.match(workbench, /BulkReviewToolbar/);
  assert.match(workbench, /selectedCount > 0/);
  assert.match(workbench, /filters\.status === "pending"/);
  assert.match(workbench, /approveSelected/);
  assert.match(workbench, /rejectSelected/);
  assert.doesNotMatch(workbench, /onApproveFiltered/);
  assert.doesNotMatch(workbench, /Approve filtered/);
  assert.doesNotMatch(workbench, /approveFiltered/);
});

test("photo price review shows approved and rejected audit columns", () => {
  assert.match(workbench, /reviewed_at/);
  assert.match(workbench, /review_method/);
  assert.match(workbench, /created_at/);
  assert.match(workbench, /approvedAt/);
  assert.match(workbench, /reviewMethod/);
  assert.match(workbench, /rejection_reason/);
  assert.match(workbench, /rejectedAt/);
  assert.match(workbench, /rejectionReason/);
  assert.match(workbench, /createdAtLabel\(locale\)/);
  assert.match(workbench, /formatJakartaTimestamp\(candidate\.created_at\)/);
  assert.match(workbench, /second: "2-digit"/);
});

test("photo price review table headers expose help tooltips for AI and match score", () => {
  assert.match(workbench, /function HeaderHelp/);
  assert.match(workbench, /type HeaderHelpState = \{ title: string; body: string \} \| null/);
  assert.match(workbench, /const \[headerHelp, setHeaderHelp\] = useState<HeaderHelpState>\(null\)/);
  assert.match(workbench, /<button[\s\S]+aria-label=\{title\}[\s\S]+onClick=\{\(event\) => \{[\s\S]+onOpen\(\{ title, body \}\)/);
  assert.match(workbench, /<HeaderHelpDialog help=\{headerHelp\} closeLabel=\{copy\.close\} onClose=\{\(\) => setHeaderHelp\(null\)\} \/>/);
  assert.match(workbench, /\{copy\.table\.aiConfidence\}<HeaderHelp title=\{copy\.table\.aiConfidence\} body=\{aiConfidenceHelp\} onOpen=\{setHeaderHelp\} \/>/);
  assert.match(workbench, /\{copy\.table\.match\}<HeaderHelp title=\{copy\.table\.match\} body=\{matchScoreHelp\} onOpen=\{setHeaderHelp\} \/>/);
  assert.match(workbench, /function HeaderHelpDialog\(\{ help, closeLabel, onClose \}/);
  assert.match(workbench, /role="dialog" aria-modal="true"/);
  assert.match(workbench, /AI 置信度 = AI 对品牌、商品、价格识别结果的整体把握/);
  assert.match(workbench, /商品命中度 = 自动匹配商品的算法分数/);
});

test("photo price review merges risk issue columns and keeps review decision in the drawer", () => {
  assert.doesNotMatch(workbench, /<th className="px-3 py-2">\{copy\.table\.reviewDecision\}<\/th>/);
  assert.doesNotMatch(workbench, /<th className="px-3 py-2">\{copy\.table\.issueCount\}<\/th>/);
  assert.doesNotMatch(workbench, /<th className="px-3 py-2">\{copy\.table\.warnings\}<\/th>/);
  assert.match(workbench, /copy\.table\.riskIssues/);
  assert.match(workbench, /copy\.table\.priceEvidence/);
  assert.match(workbench, /formatReviewDecision/);
  assert.match(workbench, /getRiskIssues/);
  assert.match(workbench, /countEvidenceIssues/);
  assert.match(workbench, /formatPriceEvidenceStatus/);
  assert.match(workbench, /formatAiConfidence\(candidate\.ai_confidence, candidate\.legacy_confidence_fallback/);
  assert.match(workbench, /price_evidence_detail/);
  assert.match(workbench, /conflicts/);
  assert.match(workbench, /识别置信度/);
  assert.match(workbench, /审核建议/);
  assert.match(workbench, /异常数/);
  assert.match(workbench, /价格证据/);
  assert.match(candidateExportRoute, /"review_decision"/);
  assert.match(candidateExportRoute, /"issue_count"/);
  assert.match(candidateExportRoute, /"price_evidence_status"/);
  assert.match(candidateExportRoute, /legacy_confidence_fallback/);
});

test("photo price review and export expose store visit batch codes", () => {
  assert.match(workbench, /copy\.table\.batch/);
  assert.match(workbench, /visit\?\.visit_code/);
  assert.match(workbench, /copy\.batchCode/);
  assert.match(dataFile, /visit_code/);
  assert.match(candidateExportRoute, /"visit_code"/);
  assert.match(candidateExportRoute, /visit\?\.visit_code/);
});

test("photo price review filters by fuzzy store visit batch code", () => {
  assert.match(candidatesPage, /const visitCode = getFilter\("visit_code"\)/);
  assert.match(candidatesPage, /name="visit_code"/);
  assert.match(candidatesPage, /defaultValue=\{visitCode\}/);
  assert.match(candidatesPage, /exportParams\.set\("visit_code", visitCode\)/);
  assert.match(candidatesPage, /visitCode: visitCode \|\| undefined/);
  assert.match(candidateListRoute, /visitCode: searchParams\.get\("visit_code"\)\?\.trim\(\) \|\| undefined/);
  assert.match(candidateExportRoute, /const visitCode = searchParams\.get\("visit_code"\)\?\.trim\(\)/);
  assert.match(candidateExportRoute, /visitCode: visitCode \|\| undefined/);
  assert.match(dataFile, /visitCode\?: string/);
  assert.match(dataFile, /\.ilike\("offline_store_visits\.visit_code", `%\$\{escapeIlikePattern\(filters\.visitCode\)\}%`\)/);
});

test("photo price review filters by source image id and shows it in the list", () => {
  assert.match(candidatesPage, /const imageId = getFilter\("image_id"\)\.trim\(\)/);
  assert.match(candidatesPage, /name="image_id"/);
  assert.match(candidatesPage, /defaultValue=\{imageId\}/);
  assert.match(candidatesPage, /exportParams\.set\("image_id", imageId\)/);
  assert.match(candidatesPage, /imageId: imageId \|\| undefined/);
  assert.match(workbench, /copy\.table\.imageId/);
  assert.match(workbench, /<td className="px-3 py-3 font-medium text-slate-700">\{formatShortImageId\(candidate\.source_image_id\)\}<\/td>/);
  assert.match(candidateListRoute, /imageId: searchParams\.get\("image_id"\)\?\.trim\(\) \|\| undefined/);
  assert.match(candidateExportRoute, /const imageId = searchParams\.get\("image_id"\)\?\.trim\(\)/);
  assert.match(candidateExportRoute, /imageId: imageId \|\| undefined/);
  assert.match(dataFile, /imageId\?: string/);
  assert.match(dataFile, /matchesAiPriceCandidateImageId/);
  assert.match(dataFile, /normalizedSourceImageId\.endsWith\(normalizedQuery\)/);
  assert.match(dataFile, /formatShortImageId\(candidate\.source_image_id\) === normalizedQuery/);
});

test("photo price review image filter no longer falls back to 5000-row client filtering", () => {
  assert.doesNotMatch(dataFile, /limit:\s*Math\.max\(page \* perPage, 5000\)/);
  assert.doesNotMatch(dataFile, /const imageFilteredResult = await getAiPriceCandidates\(/);
  assert.doesNotMatch(dataFile, /if \(filters\.imageId\) query = query\.ilike\("source_image_id",/);
  assert.match(dataFile, /const pageRows = \(data \?\? \[\]\) as AiPriceCandidate\[\];/);
  assert.match(dataFile, /const imageFilteredRows = filters\.imageId\s*\?\s*pageRows\.filter\(\(candidate\) => matchesAiPriceCandidateImageId\(candidate, filters\.imageId!\)\)\s*:\s*pageRows;/);
  assert.match(dataFile, /const candidates = await attachAiPriceCandidateMatchLabels\(supabase, imageFilteredRows\);/);
  assert.match(dataFile, /return \{ data: candidates, total: count \?\? 0, page, perPage/);
});

test("photo price review keeps Chinese copy keys for table headers and actions", () => {
  assert.match(workbench, /locale === "zh"/);
  assert.match(workbench, /approveSelected/);
  assert.match(workbench, /rejectSelected/);
  assert.match(workbench, /reviewRule/);
  assert.match(workbench, /approvedAt/);
  assert.match(workbench, /reviewMethod/);
  assert.match(workbench, /创建时间/);
});

test("photo price review appends submitter as the last table column", () => {
  assert.match(workbench, /<th className="px-3 py-2">\{createdAtLabel\(locale\)\}<\/th>\s*<th className="px-3 py-2">\{submitterLabel\(locale\)\}<\/th>/);
  assert.match(workbench, /<td className="whitespace-nowrap px-3 py-3 text-slate-600">\{formatJakartaTimestamp\(candidate\.created_at\)\}<\/td>\s*<td className="px-3 py-3 text-slate-600">\{submitterNameForCandidate\(candidate\)\}<\/td>/);
  assert.match(dataFile, /const visitColumns = "id,visit_code,store_name,city,province,city_name,district,channel_type,visit_date,created_at,uploader_name"/);
  assert.match(typesFile, /offline_store_visits\?: Pick<OfflineStoreVisit, "id" \| "visit_code" \| "store_name" \| "city" \| "province" \| "city_name" \| "district" \| "channel_type" \| "visit_date" \| "created_at" \| "uploader_name"> \| null;/);
});

test("pending photo price review rows allow package price and piece count correction", () => {
  assert.match(workbench, /reviewInputs/);
  assert.match(workbench, /savedReviewInputs/);
  assert.match(workbench, /updateReviewInput/);
  assert.match(workbench, /current\[candidate\.id\] \?\? defaultReviewInput\(candidate\)/);
  assert.match(workbench, /maybeSaveReviewInput/);
  assert.match(workbench, /onBlur=\{\(\) => maybeSaveReviewInput\(candidate\)\}/);
  assert.match(workbench, /action: "save_review_input"/);
  assert.match(workbench, /window\.confirm/);
  assert.match(workbench, /name="net_price_idr"/);
  assert.match(workbench, /name="piece_count"/);
  assert.match(workbench, /calculateReviewedPricePerPiece/);
  assert.match(workbench, /review_overrides/);
});

test("photo price review table uses package price and net price business labels", () => {
  assert.match(workbench, /packagePrice: "标价"/);
  assert.match(workbench, /promoType: "活动类型"/);
  assert.match(workbench, /discountAmount: "折扣金额"/);
  assert.match(workbench, /netPrice: "到手价"/);
  assert.match(workbench, /candidatePackagePrice\(candidate\)/);
  assert.match(workbench, /calculateDiscountAmount\(rowPackagePrice, rowNetPrice\)/);
  assert.match(workbench, /return packagePrice - netPrice/);
  assert.doesNotMatch(workbench, /aiPackage: "AI 到手价"/);
});

test("photo price review carries net price and activity type into price snapshots", () => {
  assert.match(workbench, /net_price_idr/);
  assert.match(workbench, /promo_type/);
  assert.match(workbench, /copy\.netPrice/);
  assert.match(workbench, /copy\.promoType/);
  assert.match(candidateRoute, /net_price_idr/);
  assert.match(candidateRoute, /promo_type/);
  assert.match(aiPriceReview, /candidateRow\.net_price_idr/);
  assert.match(aiPriceReview, /promo_type: normalizeCandidatePromoType/);
});

test("Chinese photo price review copy renders as readable UTF-8 text", () => {
  assert.match(candidatesPage, /照片价格复核/);
  assert.match(candidatesPage, /巡店日期范围/);
  assert.match(workbench, /通过选中/);
  assert.match(workbench, /驳回选中/);
  assert.match(workbench, /AI ≥/);
  assert.doesNotMatch(candidatesPage, /鏆|鐓|宸|寮|閫|椹|鈮/);
  assert.doesNotMatch(workbench, /鏆|鐓|宸|寮|閫|椹|鈮/);
});

test("photo price review exposes evidence drawer and readable warning details", () => {
  assert.match(workbench, /viewEvidence/);
  assert.match(workbench, /getRiskIssues/);
  assert.match(workbench, /candidate\.warnings/);
  assert.match(workbench, /candidate\.conflicts/);
  assert.match(workbench, /setActiveCandidate\(candidate\)/);
  assert.match(workbench, /visitPhotos/);
  assert.match(workbench, /\/api\/store-visit\/\$\{candidate\.visit_id\}/);
});

test("photo price review highlights the photo that produced the candidate price", () => {
  assert.match(workbench, /VisitEvidenceImage/);
  assert.match(workbench, /findCandidateSourcePhoto/);
  assert.match(workbench, /source_image_id/);
  assert.match(workbench, /source_image_path/);
  assert.match(workbench, /sourcePhotoBadge/);
  assert.doesNotMatch(workbench, /candidateImageRowScore/);
  assert.doesNotMatch(workbench, /likelySourcePhotoBadge/);
  assert.doesNotMatch(storeVisitRoute, /vision_result: image\.vision_result/);
});

test("photo price review shows and edits matched SKU on pending candidates", () => {
  assert.match(workbench, /matchedSkuLabel/);
  assert.match(workbench, /copy\.editMatch/);
  assert.match(workbench, /MatchEditorDialog/);
  assert.match(workbench, /candidate\.status === "pending"/);
  assert.match(workbench, /whitespace-normal break-words/);
  assert.doesNotMatch(workbench, /max-w-52 truncate text-xs text-slate-500/);
  assert.match(workbench, /action: "update_match"/);
  assert.match(workbench, /action: "create_competitor_match"/);
  assert.match(workbench, /createCompetitorMatch/);
  assert.match(workbench, /createCompetitorProduct/);
  assert.match(workbench, /candidate\?\.matched_sku_label \?\? candidate\?\.matched_label \?\? ""/);
  assert.match(workbench, /fetch\("\/api\/material-master"\)/);
  assert.doesNotMatch(workbench, /\/api\/material-master\/export/);
  assert.match(workbench, /withSelectedMaterialOption/);
  assert.match(workbench, /withSelectedProductOption/);
  assert.match(dataFile, /materialMatchesByCode/);
  assert.match(dataFile, /competitorMatchesById/);
});

test("match editor option APIs return JSON data for current matched SKU selection", () => {
  assert.match(materialMasterRoute, /export async function GET\(request: Request\)/);
  assert.match(materialMasterRoute, /\.from\("material_master"\)/);
  assert.match(materialMasterRoute, /Response\.json\(\{ items: data \?\? \[\] \}\)/);
  assert.match(competitorsRoute, /export async function GET\(request: Request\)/);
  assert.match(competitorsRoute, /\.select\("\*, brands\(id,name\)"\)/);
  assert.match(competitorsRoute, /Response\.json\(\{ products: data \?\? \[\] \}\)/);
});

test("photo price candidate API updates pending match without touching snapshots or sku matches", () => {
  assert.match(candidateRoute, /action === "update_match"/);
  assert.match(candidateRoute, /action === "create_competitor_match"/);
  assert.match(candidateRoute, /ensureCompetitorProduct/);
  assert.match(candidateRoute, /matched_entity_type/);
  assert.match(candidateRoute, /match_score: matchType === "unmatched" \? 0 : 1/);
  assert.match(candidateRoute, /\.eq\("status", "pending"\)/);
  assert.doesNotMatch(candidateRoute, /\.from\("price_snapshots"\)[\s\S]*action === "update_match"/);
  assert.doesNotMatch(candidateRoute, /\.from\("sku_matches"\)[\s\S]*action === "update_match"/);
});

test("photo price candidates must be matched before approval", () => {
  assert.match(workbench, /candidateCanBeApproved/);
  assert.match(workbench, /copy\.matchRequiredBeforeApprove/);
  assert.doesNotMatch(workbench, /create_competitor_if_unmatched/);
  assert.doesNotMatch(workbench, /confirmCreateCompetitorBeforeApprove/);
  assert.doesNotMatch(candidateRoute, /createCompetitorIfUnmatched/);
  assert.match(aiPriceReview, /Please match a product before approving this candidate/);
});

test("photo price review uses row click drawer with compact risk indicators and image preview", () => {
  assert.match(workbench, /openCandidateDrawer/);
  assert.match(workbench, /onClick=\{\(\) => openCandidateDrawer\(candidate\)\}/);
  assert.match(workbench, /stopReviewRowClick/);
  assert.match(workbench, /riskIndicatorLabel/);
  assert.match(workbench, /!<\/span>/);
  assert.doesNotMatch(workbench, /warningMessages\.join\("；"\)/);
  assert.match(workbench, /onBackdropClick/);
  assert.match(workbench, /activeImage/);
  assert.match(workbench, /activeVisitImages/);
  assert.match(workbench, /replacedVisitImages/);
  assert.match(workbench, /payload\.visit\?\.active_signed_images/);
  assert.match(workbench, /payload\.visit\?\.replaced_signed_images/);
  assert.match(workbench, /copy\.replacedPhotos/);
  assert.match(workbench, /setActiveImage/);
});

test("store visit detail route returns signed photos from new image table and legacy arrays", () => {
  assert.match(storeVisitRoute, /const aiPriceCandidateSelect = /);
  assert.match(storeVisitRoute, /attachAiPriceCandidateMatchLabels/);
  assert.match(storeVisitRoute, /ai_price_candidates: await attachAiPriceCandidateMatchLabels\(supabase, signedVisit\.ai_price_candidates \?\? \[\]\)/);
  assert.match(storeVisitRoute, /const visitSelect = `id,visit_code,[\s\S]+offline_visit_images\(id,visit_id,replaces_image_id,replaced_by_image_id,deleted_at,deletion_reason,image_type,image_path,image_url,file_name,content_type,file_size,analysis_status,vision_result,analysis_error,error_message,uploaded_at,created_at\),ai_price_candidates\(\$\{aiPriceCandidateSelect\}\)`/);
  assert.match(storeVisitRoute, /const legacyVisitSelect = `id,visit_code,[\s\S]+offline_visit_images\(id,visit_id,image_type,image_path,image_url,file_name,content_type,file_size,analysis_status,vision_result,analysis_error,error_message,uploaded_at,created_at\),ai_price_candidates\(\$\{aiPriceCandidateSelect\}\)`/);
  assert.match(storeVisitRoute, /offline-visit-images/);
  assert.match(storeVisitRoute, /store-visits/);
  assert.match(storeVisitRoute, /active_signed_images/);
  assert.match(storeVisitRoute, /replaced_signed_images/);
  assert.match(storeVisitRoute, /signed_images/);
  assert.match(storeVisitRoute, /own_shelf[\s\S]+makuku_shelf/);
  assert.match(storeVisitRoute, /toStoreVisitImageCategory/);
  assert.match(storeVisitRoute, /isMissingImageLifecycleColumnsError/);
  assert.match(storeVisitRoute, /replaced_offline_visit_images/);
});

test("mobile store visit detail can preview photos from the thumbnail grid", () => {
  assert.match(storeVisitDetailH5, /activeImage/);
  assert.match(storeVisitDetailH5, /setActiveImage/);
  assert.match(storeVisitDetailH5, /previewPhoto: "预览照片"/);
  assert.match(storeVisitDetailH5, /expandPhoto: "放大照片"/);
  assert.match(storeVisitDetailH5, /previewPhoto: "Preview photo"/);
  assert.match(storeVisitDetailH5, /expandPhoto: "Preview photo"/);
  assert.match(storeVisitDetailH5, /aria-label=\{text\.previewPhoto\}/);
  assert.match(storeVisitDetailH5, /aria-label=\{text\.expandPhoto\}/);
  assert.match(storeVisitDetailH5, /role="dialog"/);
  assert.match(storeVisitDetailH5, /max-h-\[82vh\]/);
});

test("mobile store visit detail shows price parsing sections and display analysis only", () => {
  assert.doesNotMatch(storeVisitDetailH5, /StoreVisitResultCard/);
  assert.match(storeVisitDetailH5, /priceParseSections|priceParseImages|priceParseResults/);
  assert.match(storeVisitDetailH5, /displayAnalysis/);
  assert.match(storeVisitDetailH5, /list_price|net_price|promo_type|piece_count/);
  assert.doesNotMatch(storeVisitDetailH5, /validation/);
  assert.doesNotMatch(storeVisitDetailH5, /shelf_understanding/);
  assert.doesNotMatch(storeVisitDetailH5, /stock_risk/);
  assert.doesNotMatch(storeVisitDetailH5, /promotion_insights/);
});

test("mobile store visit detail keeps each parsed SKU row compact", () => {
  assert.match(storeVisitDetailH5, /function PriceMetricRow/);
  assert.match(storeVisitDetailH5, /line-clamp-1/);
  assert.match(storeVisitDetailH5, /grid-cols-\[minmax\(0,1fr\)_auto\]/);
  assert.match(storeVisitDetailH5, /truncate text-\[11px\]/);
  assert.doesNotMatch(storeVisitDetailH5, /<Metric label=\{text\.listPrice\}/);
});

test("mobile store visit detail displays list price separately from net price", () => {
  assert.match(storeVisitDetailH5, /function candidateDisplayListPrice/);
  assert.match(storeVisitDetailH5, /function candidateDisplayNetPrice/);
  assert.match(storeVisitDetailH5, /const listPrice = candidateDisplayListPrice\(candidate, row\.list_price_idr \?\? row\.package_price_idr \?\? null\);/);
  assert.match(storeVisitDetailH5, /const netPrice = candidateDisplayNetPrice\(candidate, row\.net_price_idr \?\? null\);/);
  assert.match(storeVisitDetailH5, /<PriceMetricRow label=\{text\.listPrice\} value=\{formatMoney\(listPrice\)\}/);
  assert.match(storeVisitDetailH5, /<PriceMetricRow label=\{text\.netPrice\} value=\{formatMoney\(netPrice\)\}/);
  assert.doesNotMatch(storeVisitDetailH5, /<PriceMetricRow label=\{text\.listPrice\} value=\{formatMoney\(packagePrice\)\}/);
});

test("mobile store visit detail shows need-confirm as a row tag without hiding parsed prices", () => {
  assert.match(storeVisitDetailH5, /needsConfirmationText: "需确认"/);
  assert.match(storeVisitDetailH5, /row\.review_decision === "NEED_REVIEW"/);
  assert.match(storeVisitDetailH5, /price_evidence_status/);
  assert.match(storeVisitDetailH5, /candidate\?\.status === "approved"/);
  assert.match(storeVisitDetailH5, /needsConfirmation \? \(/);
  assert.match(storeVisitDetailH5, /\{text\.needsConfirmationText\}/);
  assert.doesNotMatch(storeVisitDetailH5, /formatReviewableMoney\(listPrice, needsConfirmation/);
  assert.doesNotMatch(storeVisitDetailH5, /formatReviewablePieceCount\(displayPieceCount, needsConfirmation/);
  assert.doesNotMatch(storeVisitDetailH5, />低置信</);
  assert.doesNotMatch(storeVisitDetailH5, />CONFLICT</);
  assert.doesNotMatch(storeVisitDetailH5, />DERIVED</);
  assert.doesNotMatch(storeVisitDetailH5, />Legacy</);
});

test("mobile store visit detail hides price rows while analysis is still running", () => {
  assert.match(storeVisitDetailH5, /const hasAnalyzingPriceImage = \(visit\?\.offline_visit_images \?\? \[\]\)\.some\(\(image\) => image\.analysis_status === "analyzing"\);/);
  assert.match(storeVisitDetailH5, /const visitAnalysisInProgress = analyzing \|\| fullVisitReanalyzing \|\| \(status === "analyzing" && !hasAnalyzingPriceImage\);/);
  assert.match(storeVisitDetailH5, /visitAnalysisInProgress=\{visitAnalysisInProgress\}/);
  assert.match(storeVisitDetailH5, /const priceRowsPending = visitAnalysisInProgress \|\| retryingImageIds\.includes\(section\.image\.id\) \|\| isAnalyzingImage \|\| \(isProcessingRetake && sectionLocalUpload\?\.status === "analyzing"\);/);
  assert.doesNotMatch(storeVisitDetailH5, /const visitAnalysisInProgress = status === "analyzing" \|\| analysisPhase !== "idle";/);
  assert.match(storeVisitDetailH5, /isAnalyzingImage && !isProcessingRetake \? \(/);
  assert.match(storeVisitDetailH5, /priceRowsPending \? null :/);
  assert.doesNotMatch(storeVisitDetailH5, /priceRowsPending \? \([\s\S]+<Loader2 className="h-3\.5 w-3\.5 animate-spin" \/>[\s\S]+\{text\.analyzingOne\}/);
});

test("mobile store visit detail uses Edit entry instead of activity type and pcs badge", () => {
  assert.match(storeVisitDetailH5, /editRow: "Edit"/);
  assert.match(storeVisitDetailH5, /text-blue-600/);
  assert.match(storeVisitDetailH5, /<button/);
  assert.match(storeVisitDetailH5, /\{text\.editRow\}/);
  assert.match(storeVisitDetailH5, /onClick=\{\(\) => onOpenRowEditor\(/);
  assert.match(storeVisitDetailH5, /pieceCount: "Pcs"/);
  assert.match(storeVisitDetailH5, /<PriceMetricRow label=\{text\.pieceCount\} value=\{displayPieceCount \? String\(displayPieceCount\) : "-"\}/);
  assert.doesNotMatch(storeVisitDetailH5, /<PriceMetricRow label=\{text\.promoType\}/);
});

test("mobile store visit detail supports one-tap confirmation for complete matched rows", () => {
  assert.match(storeVisitDetailH5, /confirmRow: "确认"/);
  assert.match(storeVisitDetailH5, /confirmRow: "Confirm"/);
  assert.match(storeVisitDetailH5, /function canQuickConfirmRow/);
  assert.match(storeVisitDetailH5, /onConfirmRow/);
  assert.match(storeVisitDetailH5, /action: "confirm_h5_row"/);
  assert.match(storeVisitDetailH5, /candidate\.status === "pending"/);
  assert.match(storeVisitDetailH5, /candidate\.matched_entity_type !== "unmatched"/);
  assert.match(storeVisitDetailH5, /\{text\.confirmRow\}/);
  assert.match(storeVisitCandidateRoute, /approveAiPriceCandidate/);
  assert.match(storeVisitCandidateRoute, /action === "confirm_h5_row"/);
});

test("mobile store visit detail loads candidate review data and H5 match options", () => {
  assert.match(storeVisitRoute, /ai_price_candidates/);
  assert.match(storeVisitDetailH5, /matchCandidateForRow/);
  assert.match(storeVisitDetailH5, /candidateDisplayPieceCount/);
  assert.match(storeVisitDetailH5, /candidateDisplayPricePerPiece/);
  assert.match(storeVisitDetailH5, /RowEditSheet/);
  assert.match(storeVisitDetailH5, /matchedEntityType: candidate\?\.matched_entity_type \?\? "unmatched"/);
  assert.match(storeVisitDetailH5, /matchedEntityId: candidate\?\.matched_entity_id \?\? ""/);
  assert.match(storeVisitDetailH5, /selectedMatchLabel: candidate\?\.matched_sku_label \?\? candidate\?\.matched_label \?\? ""/);
  assert.match(storeVisitDetailH5, /fetch\("\/api\/store-visit\/match-options"\)/);
  assert.match(storeVisitMatchOptionsRoute, /requireAppSession/);
  assert.match(storeVisitMatchOptionsRoute, /\.from\("material_master"\)/);
  assert.match(storeVisitMatchOptionsRoute, /\.from\("competitor_products"\)/);
});

test("mobile store visit detail displays matched SKU status in each parsed price row", () => {
  assert.match(storeVisitDetailH5, /function candidateMatchDisplay/);
  assert.match(storeVisitDetailH5, /candidate\?\.matched_sku_label \?\? candidate\?\.matched_label \?\? candidate\?\.matched_entity_id/);
  assert.match(storeVisitDetailH5, /candidate\.matched_entity_type !== "unmatched"/);
  assert.match(storeVisitDetailH5, /rowUnmatched: "未匹配"/);
  assert.match(storeVisitDetailH5, /matchInfo\.matched/);
  assert.match(storeVisitDetailH5, /text-\[10px\]/);
  assert.match(storeVisitDetailH5, /break-words text-\[10px\] leading-4/);
  assert.match(storeVisitDetailH5, /matchInfo\.matched \? "text-slate-500" : "font-semibold text-red-600"/);
  assert.match(storeVisitDetailH5, /\{matchInfo\.matched \? matchInfo\.label : text\.rowUnmatched\}/);
  assert.doesNotMatch(storeVisitDetailH5, /matchSkuPrefix/);
  assert.doesNotMatch(storeVisitDetailH5, /truncate text-\[11px\] font-semibold \$\{matchInfo\.matched/);
});

test("mobile store visit detail hides competitor product UUIDs from SKU match labels", () => {
  assert.match(storeVisitDetailH5, /function formatCompetitorOptionLabel/);
  assert.match(storeVisitDetailH5, /return \[item\?\.brands\?\.name, item\?\.normalized_name\]\.filter\(Boolean\)\.join\(" \/ "\);/);
  assert.match(storeVisitDetailH5, /const value = competitorOptionValue\(item\);/);
  assert.doesNotMatch(storeVisitDetailH5, /return \[item\?\.brands\?\.name, item\?\.normalized_name, value\]\.filter\(Boolean\)\.join\(" \/ "\);/);
});

test("mobile store visit detail loads SKU options only when the user changes SKU match", () => {
  assert.match(storeVisitDetailH5, /originalMatchedEntityType: candidate\?\.matched_entity_type \?\? "unmatched"/);
  assert.match(storeVisitDetailH5, /originalMatchedEntityId: candidate\?\.matched_entity_id \?\? ""/);
  assert.match(storeVisitDetailH5, /const loadMatchOptions = useCallback/);
  assert.match(storeVisitDetailH5, /onRequestMatchOptions=\{\(\) => void loadMatchOptions\(\)\}/);
  assert.doesNotMatch(storeVisitDetailH5, /useEffect\(\(\) => \{\s*if \(!rowEdit \|\| matchOptions\.materials\.length/);
});

test("mobile store visit detail no longer sends a second match update from H5 save", () => {
  assert.match(storeVisitDetailH5, /action: "save_h5_row"/);
  assert.doesNotMatch(storeVisitDetailH5, /const matchChanged = rowEdit\.matchedEntityType !== rowEdit\.originalMatchedEntityType/);
  assert.doesNotMatch(storeVisitDetailH5, /if \(matchChanged\) \{/);
  assert.doesNotMatch(storeVisitDetailH5, /action: "update_match"/);
});

test("mobile store visit detail saves H5 row edits through one request", () => {
  assert.match(storeVisitDetailH5, /action: "save_h5_row"/);
  assert.match(storeVisitDetailH5, /matched_entity_type: rowEdit\.matchedEntityType/);
  assert.match(storeVisitDetailH5, /matched_entity_id: rowEdit\.matchedEntityType === "unmatched" \? null : rowEdit\.matchedEntityId/);
  assert.match(storeVisitDetailH5, /matched_label: resolveMatchLabel\(rowEdit, matchOptions\)/);
  assert.doesNotMatch(storeVisitDetailH5, /action: "save_review_input"/);
  assert.doesNotMatch(storeVisitDetailH5, /const matchChanged = rowEdit\.matchedEntityType !== rowEdit\.originalMatchedEntityType/);
  assert.doesNotMatch(storeVisitDetailH5, /action: "update_match"/);
});

test("mobile store visit row editor shows a compact sku header and auto-calculated per-piece preview", () => {
  assert.match(storeVisitDetailH5, /pricePerPieceAuto:/);
  assert.match(storeVisitDetailH5, /autoCalculated:/);
  assert.match(storeVisitDetailH5, /const computedRowPricePerPiece = Number\.isFinite\(previewNetPrice\) && previewNetPrice > 0 && Number\.isFinite\(previewPieceCount\) && previewPieceCount > 0/);
  assert.match(storeVisitDetailH5, /line-clamp-2 text-\[13px\] leading-5 text-slate-500/);
  assert.match(storeVisitDetailH5, /value=\{computedRowPricePerPiece === null \? "-" : formatMoney\(computedRowPricePerPiece\)\}/);
  assert.match(storeVisitDetailH5, /readOnly/);
});

test("mobile store visit detail closes row editor before refreshing full visit data", () => {
  assert.match(storeVisitDetailH5, /applySavedRowCandidate\(candidate as AiPriceCandidate\)/);
  assert.match(storeVisitDetailH5, /setRowEdit\(null\)/);
  assert.match(storeVisitDetailH5, /void loadVisit\(\{ preserveLoading: true \}\)/);
  assert.doesNotMatch(storeVisitDetailH5, /await loadVisit\(\{ preserveLoading: true \}\);\s*setRowEdit\(null\)/);
});

test("mobile store visit detail exposes admin-only full visit reanalysis", () => {
  assert.match(storeVisitDetailH5, /const \[appUserRole, setAppUserRole\]/);
  assert.match(storeVisitDetailH5, /fetch\("\/api\/auth\/session"\)/);
  assert.match(storeVisitDetailH5, /const canRunFullVisitReanalysis = appUserRole === "admin"/);
  assert.match(storeVisitDetailH5, /body: JSON\.stringify\(\{ full_visit: true \}\)/);
  assert.match(storeVisitDetailH5, /aria-label=\{text\.reanalyzeFullVisit\}/);
  assert.match(storeVisitDetailH5, /confirmFullVisitReanalyzeTitle:/);
  assert.match(storeVisitDetailH5, /confirmFullVisitReanalyzeDescription:/);
  assert.match(storeVisitDetailH5, /confirmFullVisitReanalyzeAction:/);
  assert.match(storeVisitDetailH5, /const \[fullVisitReanalyzeConfirmOpen, setFullVisitReanalyzeConfirmOpen\] = useState\(false\)/);
  assert.match(storeVisitDetailH5, /onClick=\{\(\) => setFullVisitReanalyzeConfirmOpen\(true\)\}/);
  assert.doesNotMatch(storeVisitDetailH5, /onClick=\{reanalyzeFullVisit\}/);
  assert.match(storeVisitDetailH5, /fullVisitReanalyzeConfirmOpen \? \(/);
  assert.match(storeVisitDetailH5, /onClick=\{\(\) => \{\s*void reanalyzeFullVisit\(\)\.then\(\(\) => \{\s*setFullVisitReanalyzeConfirmOpen\(false\);/s);
});

test("store visit refresh API supports admin-only full visit reanalysis", () => {
  assert.match(storeVisitRefreshRoute, /const fullVisit = body\.full_visit === true/);
  assert.match(storeVisitRefreshRoute, /auth\.session\.role !== "admin"/);
  assert.match(storeVisitRefreshRoute, /Full visit re-analysis requires admin account/);
  assert.match(storeVisitRefreshRoute, /const refreshImageIds = fullVisit \? fullVisitImageIds : affectedImageIds/);
  assert.match(storeVisitRefreshRoute, /affectedImageIds: refreshImageIds/);
  assert.match(storeVisitRefreshRoute, /\.eq\("visit_id", id\)[\s\S]*\.in\("image_type", \["own_shelf", "competitor_shelf"\]\)/);
});

test("mobile store visit detail does not crash when selected SKU option is missing", () => {
  assert.match(storeVisitDetailH5, /function formatMaterialOptionLabel\(item: MaterialMaster \| null \| undefined\)/);
  assert.match(storeVisitDetailH5, /String\(item\?\.tenant_sku_code \?\? ""\)\.trim\(\)/);
  assert.match(storeVisitDetailH5, /return value \|\| null;/);
  assert.match(storeVisitDetailH5, /function resolveMatchLabel/);
  assert.match(storeVisitDetailH5, /rowEdit\.selectedMatchLabel \|\| null/);
  assert.match(storeVisitDetailH5, /const options = filterValidMatchOptions\(/);
  assert.match(storeVisitDetailH5, /matched_label: resolveMatchLabel\(rowEdit, matchOptions\)/);
  assert.doesNotMatch(storeVisitDetailH5, /"tenant_sku_code" in item/);
});

test("mobile store visit detail shows loading text before match options fail", () => {
  assert.match(storeVisitDetailH5, /loadingMatchOptions: "Loading SKU match options"/);
  assert.match(storeVisitDetailH5, /matchOptionsError/);
  assert.match(storeVisitDetailH5, /matchOptionsError \?\? \(matchOptionsLoading \? text\.loadingMatchOptions : text\.searchMatch\)/);
  assert.doesNotMatch(storeVisitDetailH5, /matchOptionsLoading \? text\.loadMatchOptionsFailed : text\.searchMatch/);
});

test("mobile store visit detail shows current matched SKU before options finish loading", () => {
  assert.match(storeVisitDetailH5, /const selectedMatchOptionLabel = rowEdit\.matchedEntityId/);
  assert.match(storeVisitDetailH5, /rowEdit\.selectedMatchLabel \|\| rowEdit\.matchedEntityId/);
  assert.match(storeVisitDetailH5, /const selectedMatchOption = selectedMatchOptionLabel/);
  assert.match(storeVisitDetailH5, /const hasSelectedMatchOption = selectedMatchOption/);
  assert.match(storeVisitDetailH5, /const selectedMatchOption = selectedMatchOptionLabel/);
  assert.match(storeVisitDetailH5, /selectedMatchOption && !hasSelectedMatchOption \? \[selectedMatchOption, \.\.\.optionItems\] : optionItems/);
});

test("mobile store visit detail keeps selected SKU separate from clearable search text", () => {
  assert.match(storeVisitDetailH5, /matchSearchQuery: ""/);
  assert.match(storeVisitDetailH5, /selectedMatchLabel: candidate\?\.matched_sku_label \?\? candidate\?\.matched_label \?\? ""/);
  assert.match(storeVisitDetailH5, /const matchQueryValue = rowEdit\.matchSearchQuery;/);
  assert.match(storeVisitDetailH5, /Current SKU/);
  assert.match(storeVisitDetailH5, /selectedMatchLabel: item\.label/);
  assert.match(storeVisitDetailH5, /matchSearchQuery: ""/);
  assert.doesNotMatch(storeVisitDetailH5, /const matchQueryValue = rowEdit\.matchQuery \|\| selectedMatchOptionLabel \|\| ""/);
  assert.doesNotMatch(storeVisitDetailH5, /onChange=\{\(event\) => onChange\(\(current\) => current \? \{ \.\.\.current, matchQuery: event\.target\.value \} : current\)\}/);
});

test("mobile store visit detail uses fuzzy searchable SKU match picker", () => {
  assert.match(storeVisitDetailH5, /function normalizeSkuSearchText/);
  assert.match(storeVisitDetailH5, /function fuzzyMatchSkuOption/);
  assert.match(storeVisitDetailH5, /const visibleMatchOptions =/);
  assert.match(storeVisitDetailH5, /matchQueryValue/);
  assert.match(storeVisitDetailH5, /function H5SkuMatchSearchSheet/);
  assert.match(storeVisitDetailH5, /window\.visualViewport/);
  assert.match(storeVisitDetailH5, /100dvh/);
  assert.match(storeVisitDetailH5, /min-h-0 flex-1 overflow-y-auto overscroll-contain/);
  assert.match(storeVisitDetailH5, /autoFocus/);
  assert.match(storeVisitDetailH5, /const \[matchPickerOpen, setMatchPickerOpen\] = useState\(false\)/);
  assert.match(storeVisitDetailH5, /setMatchPickerOpen\(true\)/);
  assert.match(storeVisitDetailH5, /role="option"/);
  assert.doesNotMatch(storeVisitDetailH5, /role="listbox"/);
  assert.doesNotMatch(storeVisitDetailH5, /<select\s+value=\{rowEdit\.matchedEntityId\}/);
});

test("mobile store visit detail keeps SKU search usable above mobile keyboard", () => {
  assert.match(storeVisitDetailH5, /max-h-\[calc\(100dvh-24px\)\]/);
  assert.match(storeVisitDetailH5, /overflow-y-auto/);
  assert.match(storeVisitDetailH5, /sticky bottom-0/);
  assert.doesNotMatch(storeVisitDetailH5, /max-h-\[32dvh\]/);
});

test("mobile store visit detail matches approved candidate rows before falling back to unmatched", () => {
  const matchCandidateFunction = storeVisitDetailH5.match(/function matchCandidateForRow\([\s\S]*?\n\}/)?.[0] ?? "";
  assert.doesNotMatch(matchCandidateFunction, /candidate\.status === "pending"/);
  assert.match(storeVisitDetailH5, /candidate\.source_image_id === imageId/);
  assert.match(storeVisitDetailH5, /normalizeMatchText\(candidate\.raw_product\) === normalizedSku/);
  assert.match(storeVisitDetailH5, /const aPieceMatch = candidateDisplayPieceCount\(a, row\.piece_count\) === rowPieceCount \? 1 : 0;/);
  assert.match(storeVisitDetailH5, /const rowNetPrice = row\.net_price_idr \?\? null;/);
  assert.match(storeVisitDetailH5, /const aPriceMatch = \(a\.net_price_idr \?\? a\.parsed_price_idr \?\? null\) === rowNetPrice \? 1 : 0;/);
  assert.match(storeVisitDetailH5, /sort\(\(a, b\) =>/);
});

test("mobile store visit detail renders the normalized row sku title", () => {
  assert.match(storeVisitDetailH5, /className="line-clamp-1 min-w-0 text-sm font-semibold leading-5 text-slate-900">\{row\.sku\}/);
});

test("H5 price candidate API updates approved matches and syncs linked snapshots", () => {
  assert.match(storeVisitCandidateRoute, /action === "update_match"/);
  assert.match(storeVisitCandidateRoute, /action === "save_review_input"/);
  assert.match(storeVisitCandidateRoute, /\.in\("status", \["pending", "approved"\]\)/);
  assert.match(storeVisitCandidateRoute, /syncCandidateMatchToPriceSnapshot/);
  assert.match(storeVisitCandidateRoute, /syncCandidateReviewInputToPriceSnapshot/);
  assert.match(storeVisitCandidateRoute, /if \(candidate\.price_snapshot_id\) \{/);
  assert.match(aiPriceReview, /export async function syncCandidateMatchToPriceSnapshot/);
  assert.match(aiPriceReview, /export async function syncCandidateReviewInputToPriceSnapshot/);
  assert.match(aiPriceReview, /Price snapshot not found/);
  assert.match(aiPriceReview, /source_matched_entity_type/);
  assert.match(aiPriceReview, /source_matched_entity_id/);
  assert.match(aiPriceReview, /competitor_product_id: null/);
  assert.match(aiPriceReview, /sku_master_id: skuMasterId/);
  assert.match(aiPriceReview, /material_sku_code: materialSkuCode/);
  assert.match(aiPriceReview, /competitor_product_id: competitorProduct\.id/);
  assert.match(aiPriceReview, /sku_master_id: null/);
  assert.match(aiPriceReview, /material_sku_code: null/);
});

test("H5 price candidate API combines H5 row price and match save into one action", () => {
  assert.match(storeVisitCandidateRoute, /action === "save_h5_row"/);
  assert.match(storeVisitCandidateRoute, /const h5RowPatch = buildReviewInputPatch/);
  assert.match(storeVisitCandidateRoute, /buildMatchPatch/);
  assert.match(storeVisitCandidateRoute, /syncCandidateReviewInputToPriceSnapshot/);
  assert.match(storeVisitCandidateRoute, /syncCandidateMatchToPriceSnapshot/);
  assert.match(storeVisitCandidateRoute, /return Response\.json\(\{ candidate \}\)/);
});

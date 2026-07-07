import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import ts from "typescript";

function transpileModule(path) {
  return ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
  }).outputText;
}

function loadPriceUtils() {
  const transpiled = transpileModule("src/lib/price-utils.ts");
  const testModule = { exports: {} };
  vm.runInNewContext(transpiled, {
    module: testModule,
    exports: testModule.exports,
  });
  return testModule.exports;
}

function loadStoreVisitAi(priceUtils) {
  const transpiled = transpileModule("src/lib/store-visit-ai.ts");
  const testModule = { exports: {} };
  const sandbox = {
    module: testModule,
    exports: testModule.exports,
    console,
    require: (id) => {
      if (id === "@/lib/ai-client") {
        return {
          createJsonChatCompletion: async () => {
            throw new Error("AI client should not be used in amount-scale guard tests.");
          },
          imageUrlPart: () => ({}),
          textPart: () => ({}),
        };
      }
      if (id === "@/lib/price-utils") return priceUtils;
      if (id === "@/lib/piece-count") {
        return {
          normalizePieceCountFromEvidence: (value, pieceCountText, sku) => {
            const text = String(pieceCountText ?? "");
            const bonus = text.match(/\b(\d{1,3})\s*\+\s*(\d{1,3})\b/);
            if (bonus) return Number(bonus[1]) + Number(bonus[2]);
            const fromText = text.match(/\b(\d{1,3})\b/);
            if (fromText) return Number(fromText[1]);
            const numeric = Number(value);
            if (Number.isFinite(numeric) && numeric > 0) return Math.floor(numeric);
            const match = String(sku ?? "").match(/\b(\d{1,3})\s*(?:pcs?|pieces?)\b/i);
            return match ? Number(match[1]) : null;
          },
          normalizePieceCountFromCandidates: (value, sku) => {
            const numeric = Number(value);
            if (Number.isFinite(numeric) && numeric > 0) return Math.floor(numeric);
            const match = String(sku ?? "").match(/\b(\d{1,3})\s*(?:pcs?|pieces?)\b/i);
            return match ? Number(match[1]) : null;
          },
        };
      }
      if (id === "@/lib/supabase") {
        return {
          createSupabaseServiceClient: () => {
            throw new Error("Supabase should not be used in amount-scale guard tests.");
          },
          hasSupabaseServiceConfig: () => false,
        };
      }
      throw new Error(`Unexpected require: ${id}`);
    },
  };
  vm.runInNewContext(transpiled, sandbox);
  return testModule.exports;
}

const priceUtils = loadPriceUtils();
const storeVisitAi = loadStoreVisitAi(priceUtils);
const rowEvidenceMigration = readFileSync("supabase/migrations/202607020002_ai_price_candidate_row_evidence.sql", "utf8");

test("parseIdrPrice preserves Indonesian shelf-tag package amounts with Rp prefix and trailing dash", () => {
  assert.equal(priceUtils.parseIdrPrice("Rp.93,550-"), 93550);
  assert.equal(priceUtils.parseIdrPrice("Rp.78,700-"), 78700);
  assert.equal(priceUtils.parseIdrPrice("83,000.-"), 83000);
  assert.equal(priceUtils.parseIdrPrice("69,825."), 69825);
});

test("price amount-scale guard repairs package prices that were divided by piece count", () => {
  const result = priceUtils.reconcilePackagePriceMetrics({
    listPriceIdr: 56000,
    packagePriceIdr: 56000,
    netPriceIdr: 1400,
    pieceCount: 40,
  });

  assert.equal(result.netPriceIdr, 56000);
  assert.equal(result.packagePriceIdr, 56000);
  assert.equal(result.listPriceIdr, 56000);
  assert.equal(result.correctedFromPerPiece, true);
  assert.match(result.warningMessage ?? "", /piece count/i);
});

test("price amount-scale guard leaves legitimate discount prices unchanged", () => {
  const result = priceUtils.reconcilePackagePriceMetrics({
    listPriceIdr: 81500,
    packagePriceIdr: 81500,
    netPriceIdr: 25000,
    pieceCount: 48,
  });

  assert.equal(result.netPriceIdr, 25000);
  assert.equal(result.correctedFromPerPiece, false);
  assert.equal(result.warningMessage, null);
});

test("price resolver keeps clear package evidence instead of reconstructing a discounted package from piece values", () => {
  const result = priceUtils.reconcilePackagePriceMetrics({
    listPriceIdr: 197500,
    packagePriceIdr: 197500,
    netPriceIdr: 4580,
    pieceCount: 36,
  });

  assert.equal(result.listPriceIdr, 197500);
  assert.equal(result.packagePriceIdr, 197500);
  assert.equal(result.netPriceIdr, 197500);
  assert.equal(result.correctedFromPerPiece, true);
  assert.equal(result.pricePerPieceIdr, 4580);
  assert.match(result.warningMessage ?? "", /piece price evidence/i);
});

test("store visit price image normalization applies the package-amount guard and appends a parse risk warning", () => {
  const normalized = storeVisitAi.normalizeStoreVisitPriceImageAnalysis({
    photo_quality: { status: "pass", reasons: [], message: "Photo quality passed." },
    rows: [
      {
        brand: "Merries",
        sku: "NB-S 3-8 kg 40 pcs",
        list_price_idr: 56000,
        package_price_idr: 56000,
        net_price_idr: 1400,
        piece_count: 40,
      },
    ],
    warnings: [],
  }, "competitor_shelf");

  assert.equal(normalized.rows.length, 1);
  assert.equal(normalized.rows[0].net_price_idr, 56000);
  assert.equal(normalized.rows[0].price_per_piece_idr, 1400);
  assert.match(normalized.warnings.at(-1)?.message ?? "", /whole-package/i);
});

test("store visit price image normalization does not let piece-scale net values override clear package evidence", () => {
  const normalized = storeVisitAi.normalizeStoreVisitPriceImageAnalysis({
    photo_quality: { status: "pass", reasons: [], message: "Photo quality passed." },
    rows: [
      {
        brand: "Makuku",
        sku: "Pro Care Pants M 6-11KG 36 pcs",
        list_price_idr: 197500,
        package_price_idr: 197500,
        net_price_idr: 4580,
        piece_count: 36,
      },
    ],
    warnings: [],
  }, "makuku_shelf");

  assert.equal(normalized.rows.length, 1);
  assert.equal(normalized.rows[0].list_price_idr, 197500);
  assert.equal(normalized.rows[0].package_price_idr, 197500);
  assert.equal(normalized.rows[0].net_price_idr, 197500);
  assert.equal(normalized.rows[0].price_per_piece_idr, 4580);
  assert.match(normalized.warnings.at(-1)?.message ?? "", /piece price evidence/i);
});

test("store visit price image prompt is frozen as evidence-only with confidence fields", () => {
  const storeVisitAiSource = readFileSync("src/lib/store-visit-ai.ts", "utf8");
  const promptMatch = storeVisitAiSource.match(/const STORE_VISIT_PRICE_IMAGE_PROMPT = \[([\s\S]*?)\]\.join\("\\n"\);/);
  assert.ok(promptMatch, "price image prompt should be defined as a literal array");
  const promptSource = promptMatch[1];

  assert.match(promptSource, /PRIMARY PRINCIPLE/);
  assert.match(promptSource, /BLANK PRINCIPLE/);
  assert.match(promptSource, /Evidence Completeness is NOT required/);
  assert.match(promptSource, /row_anchor[^"]+must not use prices/i);
  assert.match(promptSource, /group_id[^"]+consistent inside the same response/i);
  assert.match(promptSource, /normal_package_price_confidence/);
  assert.match(promptSource, /promo_package_price_confidence/);
  assert.match(promptSource, /normal_per_piece_price_confidence/);
  assert.match(promptSource, /promo_per_piece_price_confidence/);
  assert.match(promptSource, /piece_count_confidence/);
  assert.match(promptSource, /row_binding_confidence/);
  assert.match(promptSource, /section_binding_confidence/);
  assert.match(promptSource, /product_identity_confidence/);
  assert.doesNotMatch(promptSource, /summary/);
  assert.doesNotMatch(promptSource, /list_price_text/);
  assert.doesNotMatch(promptSource, /package_price_text/);
  assert.doesNotMatch(promptSource, /net_price_text/);
  assert.doesNotMatch(promptSource, /visible_price_per_piece_text/);
  assert.doesNotMatch(promptSource, /list_price_idr|package_price_idr|net_price_idr|visible_price_per_piece_idr/);
  assert.doesNotMatch(promptSource, /promo_type/);
  assert.doesNotMatch(promptSource, /MISSING_DATA|LOW_CONFIDENCE/);
});

test("store visit price image normalization keeps clear package price ahead of visible per-piece evidence", () => {
  const normalized = storeVisitAi.normalizeStoreVisitPriceImageAnalysis({
    photo_quality: { status: "pass", reasons: [], message: "Photo quality passed." },
    rows: [
      {
        brand: "Merries",
        sku: "Good Skin Jumbo XXL 15-25 kg",
        list_price_idr: 78000,
        package_price_idr: 78000,
        net_price_idr: 62288,
        piece_count: 28,
        piece_count_text: "28",
        list_price_text: "78.000",
        package_price_text: "78.000",
        net_price_text: "75.000",
        visible_price_per_piece_text: "2.678",
      },
    ],
    warnings: [],
  }, "competitor_shelf");

  assert.equal(normalized.rows.length, 1);
  assert.equal(normalized.rows[0].piece_count, 28);
  assert.equal(normalized.rows[0].visible_price_per_piece_idr, 2678);
  assert.equal(normalized.rows[0].net_price_idr, 75000);
  assert.equal(normalized.rows[0].price_per_piece_idr, 2678);
  assert.equal(normalized.rows[0].price_basis, "VISIBLE_PROMO_PACKAGE_PRICE");
});

test("store visit price image normalization does not rewrite near package price from visible per-piece evidence", () => {
  const normalized = storeVisitAi.normalizeStoreVisitPriceImageAnalysis({
    photo_quality: { status: "pass", reasons: [], message: "Photo quality passed." },
    rows: [
      {
        brand: "Merries",
        sku: "Merries Good Skin - Pants M48",
        list_price_idr: 96900,
        package_price_idr: 96900,
        net_price_idr: 96900,
        piece_count: 48,
        piece_count_text: "48",
        list_price_text: "96.900",
        package_price_text: "96.900",
        net_price_text: "96.900",
        visible_price_per_piece_text: "2.019",
      },
    ],
    warnings: [],
  }, "competitor_shelf");

  assert.equal(normalized.rows.length, 1);
  assert.equal(normalized.rows[0].net_price_idr, 96900);
  assert.equal(normalized.rows[0].visible_price_per_piece_idr, 2019);
  assert.equal(normalized.rows[0].price_per_piece_idr, 2019);
  assert.notEqual(normalized.rows[0].net_price_idr, 96912);
  assert.equal(normalized.rows[0].price_basis, "VISIBLE_PACKAGE_PRICE");
});

test("store visit price image normalization separates package and piece evidence when net text is a piece price", () => {
  const normalized = storeVisitAi.normalizeStoreVisitPriceImageAnalysis({
    photo_quality: { status: "pass", reasons: [], message: "Photo quality passed." },
    rows: [
      {
        brand: "Makuku",
        sku: "Dry Care Regular (Pants) XXL 15-25 KG",
        list_price_idr: 56900,
        package_price_idr: 56900,
        net_price_idr: 2586,
        piece_count: 26,
        piece_count_text: "22+4",
        package_price_text: "56.900",
        net_price_text: "2.586",
        visible_price_per_piece_text: "2.586",
      },
    ],
    warnings: [],
  }, "makuku_shelf");

  assert.equal(normalized.rows.length, 1);
  assert.equal(normalized.rows[0].piece_count, 26);
  assert.equal(normalized.rows[0].net_price_idr, 56900);
  assert.equal(normalized.rows[0].visible_price_per_piece_idr, 2586);
  assert.equal(normalized.rows[0].price_per_piece_idr, 2586);
  assert.match(normalized.warnings.at(-1)?.message ?? "", /piece price evidence/i);
});

test("store visit price image normalization derives piece price from package when no piece evidence is clear", () => {
  const normalized = storeVisitAi.normalizeStoreVisitPriceImageAnalysis({
    photo_quality: { status: "pass", reasons: [], message: "Photo quality passed." },
    rows: [
      {
        source_type: "PRICE_BOARD_ROW",
        group_id: "sensi_board",
        section_title: "Regular Pants",
        row_anchor: "S|40",
        brand: "Sensi",
        sku: "Sensi Regular Pants S",
        normal_package_text: "47.500",
        promo_package_text: "45.500",
        piece_count_text: "28",
        piece_count: 28,
        promo_package_price_confidence: 0.97,
        piece_count_confidence: 0.98,
        row_binding_confidence: 0.95,
        section_binding_confidence: 0.98,
        product_identity_confidence: 0.98,
      },
    ],
    warnings: [],
  }, "makuku_shelf");

  assert.equal(normalized.rows.length, 1);
  assert.equal(normalized.rows[0].net_price_idr, 45500);
  assert.equal(normalized.rows[0].price_per_piece_idr, 1625);
  assert.equal(normalized.rows[0].price_evidence_status, "CLEAR");
  assert.equal(normalized.rows[0].review_decision, "AUTO_APPROVE");
  assert.equal(normalized.rows[0].price_evidence_detail?.per_piece_price_status, "DERIVED");
  assert.doesNotMatch(normalized.warnings.map((warning) => warning.message).join(" "), /DERIVED_FROM_PACKAGE/i);
});

test("store visit price image normalization derives package price from piece price when package evidence is missing", () => {
  const normalized = storeVisitAi.normalizeStoreVisitPriceImageAnalysis({
    photo_quality: { status: "pass", reasons: [], message: "Photo quality passed." },
    rows: [
      {
        brand: "Makuku",
        sku: "Derived package sample",
        piece_count_text: "40",
        visible_price_per_piece_text: "2.500",
      },
    ],
    warnings: [],
  }, "makuku_shelf");

  assert.equal(normalized.rows.length, 1);
  assert.equal(normalized.rows[0].net_price_idr, 100000);
  assert.equal(normalized.rows[0].package_price_idr, 100000);
  assert.equal(normalized.rows[0].visible_price_per_piece_idr, 2500);
  assert.equal(normalized.rows[0].price_per_piece_idr, 2500);
  assert.equal(normalized.rows[0].price_basis, "VISIBLE_PRICE_PER_PIECE");
  assert.match(normalized.warnings.at(-1)?.message ?? "", /DERIVED_FROM_PIECE_PRICE/i);
});

test("store visit price image normalization ignores package-scale values in the piece price field", () => {
  const normalized = storeVisitAi.normalizeStoreVisitPriceImageAnalysis({
    photo_quality: { status: "pass", reasons: [], message: "Photo quality passed." },
    rows: [
      {
        brand: "Makuku",
        sku: "Piece field role mismatch sample",
        package_price_text: "56.900",
        net_price_text: "56.900",
        visible_price_per_piece_text: "56.900",
        piece_count_text: "28",
      },
    ],
    warnings: [],
  }, "makuku_shelf");

  assert.equal(normalized.rows.length, 1);
  assert.equal(normalized.rows[0].net_price_idr, 56900);
  assert.equal(normalized.rows[0].visible_price_per_piece_idr, null);
  assert.equal(normalized.rows[0].price_per_piece_idr, 2032.14);
  assert.match(normalized.warnings.at(-1)?.message ?? "", /piece price field/i);
});

test("store visit price image normalization uses normal evidence when promo cells are blank", () => {
  const normalized = storeVisitAi.normalizeStoreVisitPriceImageAnalysis({
    photo_quality: { status: "pass", reasons: [], message: "Photo quality passed." },
    rows: [
      {
        source_type: "PRICE_BOARD_ROW",
        group_id: "board_1",
        section_title: "SLIM REGULAR (PANTS)",
        row_anchor: "L|34",
        brand: "Makuku",
        sku: "SLIM REGULAR (PANTS) L",
        piece_count_text: "34",
        normal_package_text: "105.900",
        normal_piece_text: "3.114",
        promo_package_text: "",
        promo_piece_text: "",
        package_price_text: "94.900",
        net_price_text: "94.900",
        visible_price_per_piece_text: "2.791",
        piece_count: 34,
        promo_type: "Discount",
      },
    ],
    warnings: [],
  }, "makuku_shelf");

  assert.equal(normalized.rows.length, 1);
  assert.equal(normalized.rows[0].list_price_text, "105.900");
  assert.equal(normalized.rows[0].package_price_text, "105.900");
  assert.equal(normalized.rows[0].net_price_text, "105.900");
  assert.equal(normalized.rows[0].visible_price_per_piece_text, "3.114");
  assert.equal(normalized.rows[0].net_price_idr, 105900);
  assert.equal(normalized.rows[0].visible_price_per_piece_idr, 3114);
  assert.equal(normalized.rows[0].price_per_piece_idr, 3114);
  assert.equal(normalized.rows[0].promo_type, null);
  assert.equal(normalized.rows[0].source_type, "PRICE_BOARD_ROW");
  assert.equal(normalized.rows[0].group_id, "board_1");
  assert.equal(normalized.rows[0].section_title, "SLIM REGULAR (PANTS)");
  assert.equal(normalized.rows[0].row_anchor, "L|34");
});

test("store visit price image normalization uses promo evidence when same-row promo package exists", () => {
  const normalized = storeVisitAi.normalizeStoreVisitPriceImageAnalysis({
    photo_quality: { status: "pass", reasons: [], message: "Photo quality passed." },
    rows: [
      {
        brand: "Makuku",
        sku: "SLIM REGULAR (PANTS) M",
        piece_count_text: "32",
        normal_package_text: "101.900",
        normal_piece_text: "3.184",
        promo_package_text: "94.900",
        promo_piece_text: "2.965",
        piece_count: 32,
      },
    ],
    warnings: [],
  }, "makuku_shelf");

  assert.equal(normalized.rows.length, 1);
  assert.equal(normalized.rows[0].list_price_text, "101.900");
  assert.equal(normalized.rows[0].package_price_text, "94.900");
  assert.equal(normalized.rows[0].net_price_text, "94.900");
  assert.equal(normalized.rows[0].visible_price_per_piece_text, "2.965");
  assert.equal(normalized.rows[0].net_price_idr, 94900);
  assert.equal(normalized.rows[0].visible_price_per_piece_idr, 2965);
  assert.equal(normalized.rows[0].price_per_piece_idr, 2965);
  assert.equal(normalized.rows[0].promo_type, "Discount");
});

test("store visit price image normalization ignores legacy business fields when evidence fields exist", () => {
  const normalized = storeVisitAi.normalizeStoreVisitPriceImageAnalysis({
    photo_quality: { status: "pass", reasons: [], message: "Photo quality passed." },
    rows: [
      {
        source_type: "PRICE_BOARD_ROW",
        group_id: "board_2",
        section_title: "SLIM REGULAR (PANTS)",
        row_anchor: "XL|32",
        brand: "Makuku",
        sku: "SLIM REGULAR (PANTS) XL",
        piece_count_text: "32",
        normal_package_text: "105.900",
        normal_piece_text: "3.309",
        promo_package_text: "",
        promo_piece_text: "",
        list_price_text: "94.900",
        package_price_text: "94.900",
        net_price_text: "94.900",
        visible_price_per_piece_text: "2.966",
        list_price_idr: 94900,
        package_price_idr: 94900,
        net_price_idr: 94900,
        visible_price_per_piece_idr: 2966,
        promo_type: "Discount",
      },
    ],
    warnings: [],
  }, "makuku_shelf");

  assert.equal(normalized.rows.length, 1);
  assert.equal(normalized.rows[0].list_price_text, "105.900");
  assert.equal(normalized.rows[0].package_price_text, "105.900");
  assert.equal(normalized.rows[0].net_price_text, "105.900");
  assert.equal(normalized.rows[0].visible_price_per_piece_text, "3.309");
  assert.equal(normalized.rows[0].list_price_idr, 105900);
  assert.equal(normalized.rows[0].package_price_idr, 105900);
  assert.equal(normalized.rows[0].net_price_idr, 105900);
  assert.equal(normalized.rows[0].visible_price_per_piece_idr, 3309);
  assert.equal(normalized.rows[0].price_per_piece_idr, 3309);
  assert.equal(normalized.rows[0].promo_type, null);
});

test("store visit price image normalization supports single price-tag promo evidence", () => {
  const normalized = storeVisitAi.normalizeStoreVisitPriceImageAnalysis({
    photo_quality: { status: "pass", reasons: [], message: "Photo quality passed." },
    rows: [
      {
        source_type: "PRICE_TAG",
        group_id: "tag_1",
        section_title: "promo card",
        row_anchor: "Makuku Slim Care M|32",
        brand: "Makuku",
        product_family_text: "Slim Care Regular Pants",
        sku: "M",
        piece_count_text: "32",
        normal_package_text: "",
        normal_piece_text: "",
        promo_package_text: "76.500",
        promo_piece_text: "2.390",
        promo_label: "Promo",
      },
    ],
    warnings: [],
  }, "makuku_shelf");

  assert.equal(normalized.rows.length, 1);
  assert.equal(normalized.rows[0].source_type, "PRICE_TAG");
  assert.equal(normalized.rows[0].sku, "Makuku Slim Care Regular Pants M");
  assert.equal(normalized.rows[0].list_price_text, null);
  assert.equal(normalized.rows[0].package_price_text, "76.500");
  assert.equal(normalized.rows[0].net_price_text, "76.500");
  assert.equal(normalized.rows[0].visible_price_per_piece_text, "2.390");
  assert.equal(normalized.rows[0].net_price_idr, 76500);
  assert.equal(normalized.rows[0].visible_price_per_piece_idr, 2390);
  assert.equal(normalized.rows[0].price_per_piece_idr, 2390);
  assert.equal(normalized.rows[0].promo_type, "Promo");
});

test("store visit price image normalization emits review decision and clear price evidence for high-confidence rows", () => {
  const normalized = storeVisitAi.normalizeStoreVisitPriceImageAnalysis({
    photo_quality: { status: "pass", reasons: [], message: "Photo quality passed." },
    rows: [
      {
        source_type: "PRICE_BOARD_ROW",
        group_id: "slim_board",
        section_title: "SLIM REGULAR (PANTS)",
        row_anchor: "M|32",
        brand: "Makuku",
        sku: "M",
        piece_count_text: "32",
        normal_package_text: "101.900",
        normal_piece_text: "3.184",
        promo_package_text: "94.900",
        promo_piece_text: "2.965",
        piece_count: 32,
        normal_package_price_confidence: 0.93,
        normal_per_piece_price_confidence: 0.92,
        promo_package_price_confidence: 0.91,
        promo_per_piece_price_confidence: 0.9,
        piece_count_confidence: 0.95,
        row_binding_confidence: 0.94,
        section_binding_confidence: 0.93,
        product_identity_confidence: 0.92,
      },
    ],
    warnings: [],
  }, "makuku_shelf");

  const row = normalized.rows[0];
  assert.equal(row.ai_confidence, 0.92);
  assert.equal(row.legacy_confidence_fallback, false);
  assert.equal(row.price_evidence_status, "CLEAR");
  assert.equal(row.price_evidence_confidence, 0.9);
  assert.equal(row.review_decision, "AUTO_APPROVE");
  assert.equal((row.conflicts ?? []).length, 0);
});

test("store visit price image normalization uses promo piece evidence even when promo package is blank", () => {
  const normalized = storeVisitAi.normalizeStoreVisitPriceImageAnalysis({
    photo_quality: { status: "pass", reasons: [], message: "Photo quality passed." },
    rows: [
      {
        source_type: "PRICE_BOARD_ROW",
        group_id: "comfort_fit_board",
        section_title: "COMFORT FIT BIG PACK",
        row_anchor: "NB|40",
        brand: "Makuku",
        sku: "Comfort Fit Big Pack NB (TAPE) <=5 KG",
        piece_count_text: "40",
        normal_package_text: "59.900",
        normal_piece_text: "",
        promo_package_text: "",
        promo_piece_text: "1.498",
        piece_count: 40,
        normal_package_price_confidence: 0.95,
        promo_per_piece_price_confidence: 0.82,
        piece_count_confidence: 0.98,
        row_binding_confidence: 0.95,
        section_binding_confidence: 0.98,
        product_identity_confidence: 0.96,
      },
    ],
    warnings: [],
  }, "makuku_shelf");

  const row = normalized.rows[0];
  assert.equal(row.net_price_idr, 59900);
  assert.equal(row.piece_count, 40);
  assert.equal(row.visible_price_per_piece_text, "1.498");
  assert.equal(row.visible_price_per_piece_idr, 1498);
  assert.equal(row.price_per_piece_idr, 1498);
  assert.equal(row.price_evidence_status, "CLEAR");
  assert.equal(row.review_decision, "AUTO_APPROVE");
});

test("store visit price image normalization treats promo piece as final actual piece price", () => {
  const normalized = storeVisitAi.normalizeStoreVisitPriceImageAnalysis({
    photo_quality: { status: "pass", reasons: [], message: "Photo quality passed." },
    rows: [
      {
        source_type: "PRICE_BOARD_ROW",
        group_id: "promo_piece_board",
        brand: "Makuku",
        sku: "Final actual piece price sample",
        piece_count_text: "40",
        normal_package_text: "59.900",
        normal_piece_text: "1.498",
        promo_package_text: "",
        promo_piece_text: "1.398",
        piece_count: 40,
        normal_package_price_confidence: 0.95,
        normal_per_piece_price_confidence: 0.92,
        promo_per_piece_price_confidence: 0.9,
        piece_count_confidence: 0.98,
        row_binding_confidence: 0.95,
        section_binding_confidence: 0.98,
        product_identity_confidence: 0.96,
      },
    ],
    warnings: [],
  }, "makuku_shelf");

  const row = normalized.rows[0];
  assert.equal(row.net_price_idr, 59900);
  assert.equal(row.visible_price_per_piece_text, "1.398");
  assert.equal(row.visible_price_per_piece_idr, 1398);
  assert.equal(row.price_per_piece_idr, 1398);
});

test("store visit price image normalization auto-approves clear package price when piece count is visible in row sku", () => {
  const normalized = storeVisitAi.normalizeStoreVisitPriceImageAnalysis({
    photo_quality: { status: "pass", reasons: [], message: "Photo quality passed." },
    rows: [
      {
        source_type: "PRICE_BOARD_ROW",
        group_id: "merries_board",
        section_title: "Merries Good Skin - Pants",
        row_anchor: "M48",
        brand: "SONObebe",
        product_family_text: "Merries Good Skin - Pants",
        sku: "M48",
        piece_count_text: null,
        normal_package_text: "96,900",
        normal_piece_text: null,
        promo_package_text: null,
        promo_piece_text: null,
        piece_count: 48,
        normal_package_price_confidence: 0.83,
        piece_count_confidence: 0,
        row_binding_confidence: 0.9,
        section_binding_confidence: 0.95,
        product_identity_confidence: 0.92,
      },
    ],
    warnings: [],
  }, "makuku_shelf");

  const row = normalized.rows[0];
  assert.equal(row.net_price_idr, 96900);
  assert.equal(row.piece_count, 48);
  assert.equal(row.price_per_piece_idr, 2018.75);
  assert.equal(row.price_evidence_status, "CLEAR");
  assert.equal(row.review_decision, "AUTO_APPROVE");
  assert.equal((row.warnings ?? []).length, 0);
  assert.equal(row.price_evidence_detail?.per_piece_price_status, "DERIVED");
});

test("store visit price image normalization auto-approves clear visible piece price when piece count is visible", () => {
  const normalized = storeVisitAi.normalizeStoreVisitPriceImageAnalysis({
    photo_quality: { status: "pass", reasons: [], message: "Photo quality passed." },
    rows: [
      {
        source_type: "PRICE_BOARD_ROW",
        group_id: "visible_piece_board",
        row_anchor: "XL38",
        brand: "Makuku",
        sku: "XL38",
        piece_count_text: null,
        normal_package_text: null,
        normal_piece_text: "2.550",
        promo_package_text: null,
        promo_piece_text: null,
        piece_count: 38,
        normal_per_piece_price_confidence: 0.86,
        piece_count_confidence: 0,
        row_binding_confidence: 0.9,
        section_binding_confidence: 0.92,
        product_identity_confidence: 0.9,
      },
    ],
    warnings: [],
  }, "makuku_shelf");

  const row = normalized.rows[0];
  assert.equal(row.net_price_idr, 96900);
  assert.equal(row.price_per_piece_idr, 2550);
  assert.equal(row.price_evidence_status, "CLEAR");
  assert.equal(row.review_decision, "AUTO_APPROVE");
});

test("store visit price image normalization requires review when piece count is not visible evidence", () => {
  const normalized = storeVisitAi.normalizeStoreVisitPriceImageAnalysis({
    photo_quality: { status: "pass", reasons: [], message: "Photo quality passed." },
    rows: [
      {
        source_type: "PRICE_BOARD_ROW",
        group_id: "hidden_piece_board",
        brand: "Makuku",
        sku: "Comfort Fit",
        piece_count_text: null,
        normal_package_text: "96,900",
        normal_piece_text: null,
        promo_package_text: null,
        promo_piece_text: null,
        piece_count: 48,
        normal_package_price_confidence: 0.9,
        piece_count_confidence: 0,
        row_binding_confidence: 0.9,
        section_binding_confidence: 0.92,
        product_identity_confidence: 0.9,
      },
    ],
    warnings: [],
  }, "makuku_shelf");

  const row = normalized.rows[0];
  assert.equal(row.net_price_idr, 96900);
  assert.equal(row.price_evidence_status, "REVIEW_REQUIRED");
  assert.equal(row.review_decision, "NEED_REVIEW");
});

test("store visit price image normalization requires review when evidence is derived or confidence is missing", () => {
  const normalized = storeVisitAi.normalizeStoreVisitPriceImageAnalysis({
    photo_quality: { status: "pass", reasons: [], message: "Photo quality passed." },
    rows: [
      {
        source_type: "PRICE_BOARD_ROW",
        group_id: "legacy_board",
        brand: "Makuku",
        sku: "Derived package sample",
        piece_count_text: "40",
        normal_piece_text: "2.500",
        piece_count: 40,
      },
    ],
    warnings: [],
  }, "makuku_shelf");

  const row = normalized.rows[0];
  assert.equal(row.net_price_idr, 100000);
  assert.equal(row.price_evidence_status, "DERIVED");
  assert.equal(row.ai_confidence, null);
  assert.equal(row.legacy_confidence_fallback, true);
  assert.equal(row.review_decision, "NEED_REVIEW");
  assert.match(normalized.warnings.at(-1)?.message ?? "", /DERIVED_FROM_PIECE_PRICE/i);
});

test("store visit price image normalization records conflicts without overriding high-confidence package evidence", () => {
  const normalized = storeVisitAi.normalizeStoreVisitPriceImageAnalysis({
    photo_quality: { status: "pass", reasons: [], message: "Photo quality passed." },
    rows: [
      {
        source_type: "PRICE_BOARD_ROW",
        group_id: "slim_board",
        section_title: "SLIM JUMBO",
        row_anchor: "NB|52",
        brand: "Makuku",
        sku: "Slim Jumbo NB",
        piece_count_text: "52",
        normal_package_text: "129.900",
        normal_piece_text: "2.133",
        piece_count: 52,
        normal_package_price_confidence: 0.93,
        normal_per_piece_price_confidence: 0.92,
        piece_count_confidence: 0.95,
        row_binding_confidence: 0.94,
        section_binding_confidence: 0.93,
        product_identity_confidence: 0.92,
      },
    ],
    warnings: [],
  }, "makuku_shelf");

  const row = normalized.rows[0];
  assert.equal(row.net_price_idr, 129900);
  assert.equal(row.price_per_piece_idr, 2133);
  assert.equal(row.price_evidence_status, "CONFLICT");
  assert.equal(row.review_decision, "NEED_REVIEW");
  assert.ok((row.conflicts ?? []).some((conflict) => /package.*piece/i.test(conflict.message)));
});

test("store visit price image normalization expands size-only sku with product family evidence", () => {
  const storeVisitAiSource = readFileSync("src/lib/store-visit-ai.ts", "utf8");
  assert.match(storeVisitAiSource, /product_family_text/);
  assert.match(storeVisitAiSource, /If one size cell contains multiple readable pcs-price combinations/i);

  const normalized = storeVisitAi.normalizeStoreVisitPriceImageAnalysis({
    photo_quality: { status: "pass", reasons: [], message: "Photo quality passed." },
    rows: [
      {
        brand: "MamyPoko",
        product_family_text: "X-tra Kering",
        sku: "NB",
        piece_count_text: "44 Pcs",
        normal_package_text: "Rp. 67.000",
        normal_piece_text: "1.522",
        promo_package_text: "Rp. 51.900",
        promo_piece_text: "1.179",
        piece_count: 44,
      },
    ],
    warnings: [],
  }, "makuku_shelf");

  assert.equal(normalized.rows.length, 1);
  assert.equal(normalized.rows[0].product_family_text, "X-tra Kering");
  assert.equal(normalized.rows[0].sku, "MamyPoko X-tra Kering NB");
  assert.equal(normalized.rows[0].net_price_idr, 51900);
  assert.equal(normalized.rows[0].price_per_piece_idr, 1179);
});

test("store visit price image normalization falls back to section title when product family is generic", () => {
  const normalized = storeVisitAi.normalizeStoreVisitPriceImageAnalysis({
    photo_quality: { status: "pass", reasons: [], message: "Photo quality passed." },
    rows: [
      {
        source_type: "PRICE_BOARD_ROW",
        section_title: "SLIM JUMBO (PANTS)",
        row_anchor: "M|52",
        brand: "MAKUKU",
        product_family_text: "Slim",
        sku: "MAKUKU Slim M",
        piece_count_text: "52",
        normal_package_text: "159.300",
        normal_piece_text: "3.075",
        promo_package_text: "155.900",
        promo_piece_text: "2.998",
        piece_count: 52,
      },
    ],
    warnings: [],
  }, "makuku_shelf");

  assert.equal(normalized.rows.length, 1);
  assert.equal(normalized.rows[0].product_family_text, "SLIM JUMBO (PANTS)");
  assert.equal(normalized.rows[0].sku, "MAKUKU SLIM JUMBO (PANTS) M");
});

test("store visit price image normalization does not use promo section title as product family", () => {
  const normalized = storeVisitAi.normalizeStoreVisitPriceImageAnalysis({
    photo_quality: { status: "pass", reasons: [], message: "Photo quality passed." },
    rows: [
      {
        source_type: "PRICE_TAG",
        section_title: "PROMO SPECIAL",
        row_anchor: "M|52",
        brand: "MAKUKU",
        product_family_text: "Slim",
        sku: "MAKUKU Slim M",
        piece_count_text: "52",
        normal_package_text: "159.300",
        normal_piece_text: "3.075",
        piece_count: 52,
      },
    ],
    warnings: [],
  }, "makuku_shelf");

  assert.equal(normalized.rows.length, 1);
  assert.equal(normalized.rows[0].product_family_text, "Slim");
  assert.equal(normalized.rows[0].sku, "MAKUKU Slim M");
});

test("store visit price image normalization prefixes brand when only a bare row sku is available", () => {
  const normalized = storeVisitAi.normalizeStoreVisitPriceImageAnalysis({
    photo_quality: { status: "pass", reasons: [], message: "Photo quality passed." },
    rows: [
      {
        source_type: "PRICE_BOARD_ROW",
        section_title: "DAFTAR HARGA",
        row_anchor: "S66",
        brand: "Sweety",
        sku: "S66",
        piece_count: 66,
        normal_package_text: "120.000",
        normal_piece_text: "1.950",
      },
    ],
    warnings: [],
  }, "competitor_shelf");

  assert.equal(normalized.rows.length, 1);
  assert.equal(normalized.rows[0].sku, "Sweety S66");
});

test("store visit price image normalization prefers visible bonus piece count text over base quantity", () => {
  const normalized = storeVisitAi.normalizeStoreVisitPriceImageAnalysis({
    photo_quality: { status: "pass", reasons: [], message: "Photo quality passed." },
    rows: [
      {
        brand: "Makuku",
        sku: "Comfort Fit Super Jumbo M 6-11 KG",
        list_price_idr: 112900,
        package_price_idr: 112900,
        net_price_idr: 112900,
        piece_count: 60,
        piece_count_text: "60+6",
      },
    ],
    warnings: [],
  }, "makuku_shelf");

  assert.equal(normalized.rows.length, 1);
  assert.equal(normalized.rows[0].piece_count, 66);
  assert.equal(normalized.rows[0].piece_count_text, "60+6");
  assert.equal(normalized.rows[0].price_per_piece_idr, 1710.61);
  assert.match(normalized.warnings.at(-1)?.message ?? "", /piece count/i);
});

test("candidate generation source integrates the amount-scale guard before per-piece math", () => {
  const candidateService = readFileSync("src/lib/ai-price-candidates.ts", "utf8");
  assert.match(candidateService, /reconcilePackagePriceMetrics/);
  assert.match(candidateService, /const reconciledPrices = reconcilePackagePriceMetrics\(/);
  assert.match(candidateService, /const netPrice = reconciledPrices\.netPriceIdr/);
  assert.match(candidateService, /const pricePerPiece = reconciledPrices\.pricePerPieceIdr/);
  assert.match(candidateService, /raw_piece_count_text/);
  assert.match(candidateService, /raw_price_per_piece_text/);
  assert.match(candidateService, /visible_price_per_piece_idr/);
  assert.match(candidateService, /price_basis/);
  assert.match(candidateService, /review_decision/);
  assert.match(candidateService, /price_evidence_status/);
  assert.match(candidateService, /legacy_confidence_fallback/);
  assert.match(candidateService, /price_evidence_detail/);
  assert.match(candidateService, /conflicts/);
});

test("store visit analysis passes row-level review evidence into candidate generation", () => {
  const analysisSource = readFileSync("src/lib/store-visit-analysis.ts", "utf8");
  assert.match(analysisSource, /confidence: row\.ai_confidence/);
  assert.match(analysisSource, /legacy_confidence_fallback: row\.legacy_confidence_fallback/);
  assert.match(analysisSource, /price_evidence_status: row\.price_evidence_status/);
  assert.match(analysisSource, /price_evidence_confidence: row\.price_evidence_confidence/);
  assert.match(analysisSource, /price_evidence_detail: row\.price_evidence_detail/);
  assert.match(analysisSource, /review_decision: row\.review_decision/);
  assert.match(analysisSource, /conflicts: row\.conflicts/);
});

test("candidate row evidence migration adds raw evidence columns", () => {
  assert.match(rowEvidenceMigration, /raw_piece_count_text text/i);
  assert.match(rowEvidenceMigration, /raw_package_price_text text/i);
  assert.match(rowEvidenceMigration, /raw_net_price_text text/i);
  assert.match(rowEvidenceMigration, /raw_price_per_piece_text text/i);
  assert.match(rowEvidenceMigration, /visible_price_per_piece_idr numeric/i);
  assert.match(rowEvidenceMigration, /price_basis text/i);
});

import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import ts from "typescript";

function loadCandidateModule() {
  const source = readFileSync("src/lib/ai-price-candidates.ts", "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
  }).outputText;
  const module = { exports: {} };
  const sandbox = {
    module,
    exports: module.exports,
    require: (id) => {
      if (id === "@/lib/supabase") {
        return {
          createSupabaseServiceClient: () => {
            throw new Error("Supabase should not be used in hard match tests.");
          },
          hasSupabaseServiceConfig: () => false,
        };
      }
      if (id === "@/lib/price-utils") {
        return {
          calculatePricePerPiece: (price, pieceCount) => price && pieceCount ? price / pieceCount : null,
          parseIdrPrice: (value) => {
            const numeric = Number(String(value ?? "").replace(/[^0-9]/g, ""));
            return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
          },
        };
      }
      if (id === "@/lib/piece-count") {
        return {
          normalizePieceCount: (value) => {
            const numeric = Number(value);
            return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
          },
          normalizePieceCountFromCandidates: (value, product) => {
            const numeric = Number(value);
            if (Number.isFinite(numeric) && numeric > 0) return numeric;
            return parsePieceCount(product);
          },
          parsePieceCountText: parsePieceCount,
        };
      }
      throw new Error(`Unexpected require: ${id}`);
    },
  };
  vm.runInNewContext(transpiled, sandbox);
  return module.exports;
}

function parsePieceCount(value) {
  const text = String(value ?? "");
  const bonus = text.match(/\b(\d{1,3})\s*\+\s*(\d{1,3})\b/);
  if (bonus) return Number(bonus[1]) + Number(bonus[2]);
  const simple = text.match(/\b(\d{1,3})\s*(?:pcs?|pieces?)?\b/i);
  return simple ? Number(simple[1]) : null;
}

function material(overrides) {
  return {
    tenant_sku_code: overrides.tenant_sku_code,
    tenant_sku_name: overrides.tenant_sku_name,
    category: "BC",
    sub_category: "Pants",
    brand: "MAKUKU",
    sub_brand: overrides.sub_brand,
    type: overrides.type ?? "Big pack",
    sub_type: overrides.sub_type,
    pack_count: overrides.pack_count,
    box_count: 8,
    pcs_price: 1000,
    f_expiry_date: "2099-12-31T16:00:00+00:00",
  };
}

function competitor(overrides) {
  return {
    id: overrides.id,
    brand_id: "brand-1",
    raw_title: overrides.raw_title,
    normalized_name: overrides.normalized_name,
    product_series: overrides.product_series,
    channel: "offline",
    shop_name: null,
    product_url: null,
    image_url: null,
    pack_type: "unknown",
    package_type: "unknown",
    size: overrides.size,
    piece_count: overrides.piece_count,
    segment: "unknown",
    status: overrides.status ?? "active",
    created_at: "2026-01-01T00:00:00.000Z",
    brands: { id: "brand-1", name: overrides.brand ?? "Sweety" },
  };
}

const candidates = loadCandidateModule();

test("Makuku hard match rejects cross-series material even when size and pieces match", () => {
  const result = candidates.pickBestMaterialForCandidate(
    { brand: "Makuku", product: "Makuku Pro Care Tape L32", parsedPrice: 169500, pieceCount: 32 },
    [
      material({
        tenant_sku_code: "22844106",
        tenant_sku_name: "MAKUKU Dry Care 3.0 Pants L 28+4",
        sub_brand: "Dry Care",
        sub_type: "L",
        pack_count: 32,
      }),
    ],
  );

  assert.equal(result, null);
});

test("Makuku hard match allows Tape and Pants differences after series, size, and pieces match", () => {
  const result = candidates.pickBestMaterialForCandidate(
    { brand: "Makuku", product: "Makuku Pro Care Tape L32", parsedPrice: 169500, pieceCount: 32 },
    [
      material({
        tenant_sku_code: "pro-pants-l32",
        tenant_sku_name: "MAKUKU Air Diapers Pro Care Pants L32",
        sub_brand: "Pro Care",
        sub_type: "L",
        pack_count: 32,
      }),
    ],
  );

  assert.equal(result?.item.tenant_sku_code, "pro-pants-l32");
  assert.equal(result?.score, 1);
});

test("Makuku hard match rejects size and piece mismatches", () => {
  const sizeMismatch = candidates.pickBestMaterialForCandidate(
    { brand: "Makuku", product: "Makuku Pro Care Pants L34", parsedPrice: 169500, pieceCount: 34 },
    [
      material({
        tenant_sku_code: "pro-xl34",
        tenant_sku_name: "MAKUKU Air Diapers Pro Care Pants XL34",
        sub_brand: "Pro Care",
        sub_type: "XL",
        pack_count: 34,
      }),
    ],
  );
  const pieceMismatch = candidates.pickBestMaterialForCandidate(
    { brand: "Makuku", product: "Makuku Pro Care Pants L34", parsedPrice: 169500, pieceCount: 34 },
    [
      material({
        tenant_sku_code: "pro-l32",
        tenant_sku_name: "MAKUKU Air Diapers Pro Care Pants L32",
        sub_brand: "Pro Care",
        sub_type: "L",
        pack_count: 32,
      }),
    ],
  );

  assert.equal(sizeMismatch, null);
  assert.equal(pieceMismatch, null);
});

test("Makuku hard match ranks format and token coverage after hard attributes pass", () => {
  const result = candidates.pickBestMaterialForCandidate(
    { brand: "Makuku", product: "Makuku Pro Care Tape L32", parsedPrice: 169500, pieceCount: 32 },
    [
      material({
        tenant_sku_code: "pro-pants-l32",
        tenant_sku_name: "MAKUKU Air Diapers Pro Care Pants L32",
        sub_brand: "Pro Care",
        sub_type: "L",
        pack_count: 32,
      }),
      material({
        tenant_sku_code: "pro-tape-l32",
        tenant_sku_name: "MAKUKU Air Diapers Pro Care Tape L32",
        sub_brand: "Pro Care",
        sub_type: "L",
        pack_count: 32,
      }),
    ],
  );

  assert.equal(result?.item.tenant_sku_code, "pro-tape-l32");
  assert.equal(result?.score, 1);
});

test("Makuku hard match returns unmatched when multiple candidates cannot be uniquely ranked", () => {
  const result = candidates.pickBestMaterialForCandidate(
    { brand: "Makuku", product: "Makuku Pro Care L32", parsedPrice: 169500, pieceCount: 32 },
    [
      material({
        tenant_sku_code: "pro-pack-a",
        tenant_sku_name: "MAKUKU Air Diapers Pro Care L32",
        sub_brand: "Pro Care",
        sub_type: "L",
        pack_count: 32,
      }),
      material({
        tenant_sku_code: "pro-pack-b",
        tenant_sku_name: "MAKUKU Air Diapers Pro Care L32",
        sub_brand: "Pro Care",
        sub_type: "L",
        pack_count: 32,
      }),
    ],
  );

  assert.equal(result, null);
});

test("competitor hard match uses the same series, size, and piece gates", () => {
  const result = candidates.pickBestCompetitorForCandidate(
    { brand: "Sweety", product: "Sweety Gold Pants L28", pieceCount: 28 },
    [
      competitor({
        id: "dry-l28",
        raw_title: "Sweety Dry Pants L28",
        normalized_name: "Sweety Dry Pants L28",
        product_series: "Dry",
        size: "L",
        piece_count: 28,
      }),
      competitor({
        id: "gold-l28",
        raw_title: "Sweety Gold Pants L28",
        normalized_name: "Sweety Gold Pants L28",
        product_series: "Gold",
        size: "L",
        piece_count: 28,
      }),
    ],
  );

  assert.equal(result?.item.id, "gold-l28");
  assert.equal(result?.score, 1);
});

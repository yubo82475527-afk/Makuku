import test from "node:test";
import assert from "node:assert/strict";
import { compileProductMatchIndex, matchProduct } from "../src/lib/product-match-engine.ts";
import { productMatchRulesV2 } from "../src/lib/product-match-rules-v2.ts";

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

function materialMaster(item) {
  return {
    id: item.tenant_sku_code,
    entityType: "material_master",
    code: item.tenant_sku_code,
    active: true,
    signature: {
      brand: item.brand,
      series: item.sub_brand,
      packageLevel: item.type,
      shape: null,
      size: item.sub_type,
      pieceCount: item.pack_count,
      version: null,
    },
    raw: {
      item,
      name: item.tenant_sku_name,
      label: item.tenant_sku_name,
    },
  };
}

function competitorMaster(item) {
  return {
    id: item.id,
    entityType: "competitor_product",
    code: item.competitor_sku_code ?? null,
    active: item.status !== "disabled",
    signature: {
      brand: item.brands?.name ?? null,
      series: item.product_series ?? null,
      packageLevel: item.package_type,
      shape: null,
      size: item.size,
      pieceCount: item.piece_count,
      version: null,
    },
    raw: {
      item,
      name: item.normalized_name,
      title: item.raw_title,
      label: item.normalized_name,
    },
  };
}

function pickBestMaterialForCandidate(candidate, materials) {
  return pickBestProductForCandidate(candidate, materials.map(materialMaster));
}

function pickBestCompetitorForCandidate(candidate, products) {
  return pickBestProductForCandidate(candidate, products.map(competitorMaster));
}

function pickBestProductForCandidate(candidate, masters) {
  const index = compileProductMatchIndex(masters, productMatchRulesV2);
  const result = matchProduct({
    code: String(candidate.product ?? "").trim() || null,
    entityType: null,
    signature: {
      brand: candidate.brand,
      series: null,
      packageLevel: null,
      shape: null,
      size: null,
      pieceCount: candidate.pieceCount ?? null,
      version: null,
    },
    sources: ["test"],
    raw: {
      brand: candidate.brand,
      sku: candidate.product,
      pieceCount: candidate.pieceCount ?? null,
    },
  }, index, productMatchRulesV2);
  return result.product ? { item: result.product.raw.item, score: 1, method: result.method } : null;
}

test("Makuku hard match rejects cross-series material even when size and pieces match", () => {
  const result = pickBestMaterialForCandidate(
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

test("Makuku hard match rejects Tape and Pants differences after series, size, and pieces match", () => {
  const result = pickBestMaterialForCandidate(
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

  assert.equal(result, null);
});

test("Makuku hard match rejects size and piece mismatches", () => {
  const sizeMismatch = pickBestMaterialForCandidate(
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
  const pieceMismatch = pickBestMaterialForCandidate(
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
  const result = pickBestMaterialForCandidate(
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

test("Makuku hard match prefers the newest product version after hard attributes pass", () => {
  const result = pickBestMaterialForCandidate(
    { brand: "Makuku", product: "Makuku Pro Care Pants M36", parsedPrice: 169500, pieceCount: 36 },
    [
      material({
        tenant_sku_code: "pro-pants-m36",
        tenant_sku_name: "MAKUKU Air Diapers Pro Care Pants M36",
        sub_brand: "Pro Care",
        sub_type: "M",
        pack_count: 36,
      }),
      material({
        tenant_sku_code: "pro-2-pants-m36",
        tenant_sku_name: "MAKUKU Air Diapers Pro Care 2.0 Pants M36",
        sub_brand: "Pro Care",
        sub_type: "M",
        pack_count: 36,
      }),
      material({
        tenant_sku_code: "pro-3-pants-m36",
        tenant_sku_name: "MAKUKU Air Diapers Pro Care 3.0 Pants M36",
        sub_brand: "Pro Care",
        sub_type: "M",
        pack_count: 36,
      }),
      material({
        tenant_sku_code: "pro-4-pants-m36",
        tenant_sku_name: "MAKUKU Air Diapers Pro Care 4.0 Pants M36",
        sub_brand: "Pro Care",
        sub_type: "M",
        pack_count: 36,
      }),
    ],
  );

  assert.equal(result?.item.tenant_sku_code, "pro-4-pants-m36");
});

test("Makuku hard match returns unmatched when multiple candidates cannot be uniquely ranked", () => {
  const result = pickBestMaterialForCandidate(
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
  const result = pickBestCompetitorForCandidate(
    { brand: "MamyPoko", product: "MamyPoko Royal Soft Pants L28", pieceCount: 28 },
    [
      competitor({
        id: "slim-l28",
        raw_title: "MamyPoko Slim Pants L28",
        normalized_name: "MamyPoko Slim Pants L28",
        product_series: "Slim",
        size: "L",
        piece_count: 28,
        brand: "MamyPoko",
      }),
      competitor({
        id: "royal-soft-l28",
        raw_title: "MamyPoko Royal Soft Pants L28",
        normalized_name: "MamyPoko Royal Soft Pants L28",
        product_series: "Royal Soft",
        size: "L",
        piece_count: 28,
        brand: "MamyPoko",
      }),
    ],
  );

  assert.equal(result?.item.id, "royal-soft-l28");
  assert.equal(result?.score, 1);
});

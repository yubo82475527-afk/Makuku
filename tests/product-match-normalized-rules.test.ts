import assert from "node:assert/strict";
import test from "node:test";
import { compileProductMatchIndex, matchProduct, type ProductMatchMaster } from "../src/lib/product-match-engine.ts";
import { compileProductMatchNormalizations } from "../src/lib/product-match-normalizations.ts";
import { createProductMatchRulesV2 } from "../src/lib/product-match-rules-v2.ts";

const normalizations = compileProductMatchNormalizations([
  { id: "slim-care", field: "series", brand_scope: null, source_value: "SLIMCARE", canonical_value: "Slim Care", active: true },
  { id: "gold-series", field: "series", brand_scope: "SWEETY", source_value: "GOLD SERIES", canonical_value: "GOLD", active: true },
  { id: "swety", field: "brand", brand_scope: null, source_value: "SWETY", canonical_value: "SWEETY", active: true },
], {
  brand: ["MAKUKU", "SWEETY"],
  series: ["Slim", "Slim Care", "Dry Care", "GOLD", "PANTS"],
  size: ["L", "M", "NB"],
  piece_count: [30, 48, 52],
});

const rules = createProductMatchRulesV2(normalizations);

const masters: ProductMatchMaster[] = [
  {
    id: "0201004000038",
    entityType: "material_master",
    code: "0201004000038",
    active: true,
    signature: { brand: "MAKUKU", series: "Slim Care", packageLevel: null, shape: null, size: "L", pieceCount: 30, version: null },
    raw: { title: "MAKUKU SAP Diapers Slim Care Pants L30" },
  },
  {
    id: "0201004000046",
    entityType: "material_master",
    code: "0201004000046",
    active: true,
    signature: { brand: "MAKUKU", series: "Slim Care", packageLevel: null, shape: null, size: "L", pieceCount: 48, version: null },
    raw: { title: "MAKUKU SAP Diapers Slim Care Pants L48" },
  },
  {
    id: "sweety-gold-nb52",
    entityType: "competitor_product",
    code: null,
    active: true,
    signature: { brand: "SWEETY", series: "GOLD", packageLevel: null, shape: null, size: "NB", pieceCount: 52, version: null },
    raw: { title: "SWEETY COMFORT GOLD NB52" },
  },
];

test("configured series aliases match Slim Care L30 and L48 without broadening Slim", () => {
  const index = compileProductMatchIndex(masters, rules);
  const l30 = matchProduct({
    code: null,
    entityType: null,
    signature: { brand: "MAKUKU", series: null, packageLevel: null, shape: "PANTS", size: null, pieceCount: 30, version: null },
    sources: ["sku"],
    raw: { brand: "MAKUKU", sku: "MAKUKU SLIM CARE REGULAR (PANTS) L", rowAnchor: "L|30", pieceCount: 30 },
  }, index, rules);
  const l48 = matchProduct({
    code: null,
    entityType: null,
    signature: { brand: "MAKUKU", series: null, packageLevel: null, shape: "PANTS", size: null, pieceCount: 48, version: null },
    sources: ["sku"],
    raw: { brand: "MAKUKU", sku: "MAKUKU SLIM CARE JUMBO (PANTS) L", rowAnchor: "L|48", pieceCount: 48 },
  }, index, rules);

  assert.equal(l30.product?.id, "0201004000038");
  assert.equal(l48.product?.id, "0201004000046");
});

test("configured brand and series aliases match Sweety Gold Series NB52", () => {
  const index = compileProductMatchIndex(masters, rules);
  const result = matchProduct({
    code: null,
    entityType: null,
    signature: { brand: "SWETY", series: null, packageLevel: null, shape: "TAPE", size: null, pieceCount: 52, version: null },
    sources: ["sku"],
    raw: { brand: "SWETY", sku: "Sweety Gold Series Tape NB52", rowAnchor: "Tape|NB52", pieceCount: 52 },
  }, index, rules);

  assert.equal(result.product?.id, "sweety-gold-nb52");
});

test("a uniquely owned series retains its inferred brand when the source brand is unknown", () => {
  const index = compileProductMatchIndex([{
    id: "dry-care-m58",
    entityType: "material_master",
    code: "dry-care-m58",
    active: true,
    signature: { brand: "MAKUKU", series: "Dry Care", packageLevel: "JUMBO", shape: "PANTS", size: "M", pieceCount: 58, version: null },
    raw: { title: "MAKUKU Diapers Dry Care Pants M48+10" },
  }], rules);

  const result = matchProduct({
    code: null,
    entityType: null,
    signature: { brand: null, series: "Dry Care", packageLevel: "JUMBO", shape: "PANTS", size: "M", pieceCount: 58, version: null },
    sources: ["product_family_text", "row_anchor", "piece_count"],
    raw: {
      brand: "Unknown",
      productFamilyText: "DRY CARE JUMBO (PANTS)",
      sku: "DRY CARE JUMBO (PANTS) M 6-11 KG",
      rowAnchor: "M 6-11 KG",
      pieceCount: 58,
    },
  }, index, rules);

  assert.equal(result.product?.id, "dry-care-m58");
  assert.equal(result.method, "UNIQUE_SIGNATURE");
});

test("Makuku title matching keeps Slim out of generic PANTS and selects the named SKU only when named", () => {
  const index = compileProductMatchIndex([
    {
      id: "slim-m52",
      entityType: "material_master" as const,
      code: "slim-m52",
      active: true,
      signature: { brand: "MAKUKU", series: "Slim", packageLevel: null, shape: null, size: "M", pieceCount: 52, version: null },
      raw: { title: "MAKUKU Air Diapers Slim Pants M52" },
    },
    {
      id: "slim-luxury-m52",
      entityType: "material_master" as const,
      code: "slim-luxury-m52",
      active: true,
      signature: { brand: "MAKUKU", series: "Slim", packageLevel: null, shape: null, size: "M", pieceCount: 52, version: null },
      raw: { title: "MAKUKU Slim Luxury Silky Pants M52" },
    },
    {
      id: "slim-care-m32",
      entityType: "material_master" as const,
      code: "slim-care-m32",
      active: true,
      signature: { brand: "MAKUKU", series: "Slim Care", packageLevel: null, shape: null, size: "M", pieceCount: 32, version: null },
      raw: { title: "MAKUKU SAP Diapers Slim Care Pants M32" },
    },
    {
      id: "slim-care-skin-joy-m32",
      entityType: "material_master" as const,
      code: "slim-care-skin-joy-m32",
      active: true,
      signature: { brand: "MAKUKU", series: "Slim Care", packageLevel: null, shape: null, size: "M", pieceCount: 32, version: null },
      raw: { title: "MAKUKU Slim Care Skin Joy Pants M32" },
    },
  ], rules);

  const slimJumbo = matchProduct({
    code: null,
    entityType: null,
    signature: { brand: "MAKUKU", series: "Slim Jumbo (PANTS)", packageLevel: null, shape: null, size: null, pieceCount: 52, version: null },
    sources: ["product_family_text", "piece_count"],
    raw: { brand: "MAKUKU", productFamilyText: "Slim Jumbo (PANTS)", sku: "MAKUKU Slim Jumbo (PANTS) M", rowAnchor: "M 52", pieceCount: 52 },
  }, index, rules);
  const slimCare = matchProduct({
    code: null,
    entityType: null,
    signature: { brand: "MAKUKU", series: "Slim Care Big Pack 30 Pack (PANTS)", packageLevel: null, shape: null, size: null, pieceCount: 32, version: null },
    sources: ["product_family_text", "piece_count"],
    raw: { brand: "MAKUKU", productFamilyText: "Slim Care Big Pack 30 Pack (PANTS)", sku: "MAKUKU Slim Care Big Pack M", rowAnchor: "M 32", pieceCount: 32 },
  }, index, rules);
  const skinJoy = matchProduct({
    code: null,
    entityType: null,
    signature: { brand: "MAKUKU", series: "Slim Care Skin Joy (PANTS)", packageLevel: null, shape: null, size: null, pieceCount: 32, version: null },
    sources: ["product_family_text", "piece_count"],
    raw: { brand: "MAKUKU", productFamilyText: "Slim Care Skin Joy (PANTS)", sku: "MAKUKU Slim Care Skin Joy M", rowAnchor: "M 32", pieceCount: 32 },
  }, index, rules);

  assert.equal(slimJumbo.product?.id, "slim-m52");
  assert.equal(slimCare.product?.id, "slim-care-m32");
  assert.equal(skinJoy.product?.id, "slim-care-skin-joy-m32");
});

test("a unique core signature is not rejected by shape or package wording", () => {
  const index = compileProductMatchIndex([{
    id: "pro-pants-l32",
    entityType: "material_master" as const,
    code: "pro-pants-l32",
    active: true,
    signature: { brand: "MAKUKU", series: "SLIM CARE", packageLevel: "BIG PACK", shape: "PANTS" as const, size: "L", pieceCount: 30, version: null },
    raw: { title: "MAKUKU Slim Care Pants L30" },
  }], rules);
  const result = matchProduct({
    code: null,
    entityType: null,
    signature: { brand: "MAKUKU", series: "SLIM CARE", packageLevel: "JUMBO", shape: "TAPE", size: "L", pieceCount: 30, version: null },
    sources: ["sku"],
    raw: { brand: "MAKUKU", sku: "MAKUKU Slim Care Tape Jumbo L30", pieceCount: 30 },
  }, index, rules);

  assert.equal(result.product?.id, "pro-pants-l32");
});

test("master size stays on sub_type so Makuku NB-S evidence can hit NB/NB-S", () => {
  const sizeAwareRules = createProductMatchRulesV2(compileProductMatchNormalizations([
    { id: "slim-care", field: "series", brand_scope: null, source_value: "SLIMCARE", canonical_value: "Slim Care", active: true },
    { id: "nb-nb-s-collapse", field: "size", brand_scope: null, source_value: "NB NB S", canonical_value: "NB", active: true },
    { id: "makuku-nbs", field: "size", brand_scope: "MAKUKU", source_value: "NB-S", canonical_value: "NB/NB-S", active: true },
  ], {
    brand: ["MAKUKU"],
    series: ["Dry Care"],
    size: ["NB", "NB-S", "NB/NB-S"],
    piece_count: [38],
  }));

  const index = compileProductMatchIndex([{
    id: "0202001000022",
    entityType: "material_master",
    code: "0202001000022",
    active: true,
    signature: { brand: "MAKUKU", series: "Dry Care", packageLevel: null, shape: null, size: "NB/NB-S", pieceCount: 38, version: null },
    raw: { title: "MAKUKU DIAPERS DRY CARE TAPE NB-S38", shape: "Tape", packageLevel: "Big pack" },
  }], sizeAwareRules);

  const normalizedMaster = sizeAwareRules.normalizeProduct({
    id: "0202001000022",
    entityType: "material_master",
    code: "0202001000022",
    active: true,
    signature: { brand: "MAKUKU", series: "Dry Care", packageLevel: null, shape: null, size: "NB/NB-S", pieceCount: 38, version: null },
    raw: { title: "MAKUKU DIAPERS DRY CARE TAPE NB-S38" },
  });
  assert.equal(normalizedMaster.signature.size, "NB/NB-S");

  const result = matchProduct({
    code: null,
    entityType: null,
    signature: { brand: null, series: null, packageLevel: null, shape: null, size: null, pieceCount: 38, version: null },
    sources: ["brand", "product_family_text", "section_title", "sku", "row_anchor", "piece_count"],
    raw: {
      brand: "Unknown",
      productFamilyText: "MAKUKU Dry Care",
      sectionTitle: "DRY CARE REGULAR (TAPE)",
      sku: "MAKUKU Dry Care NB-S",
      rowAnchor: "NB-S|38",
      pieceCount: 38,
    },
  }, index, sizeAwareRules);

  assert.equal(result.evidence.signature.size, "NB/NB-S");
  assert.equal(result.product?.id, "0202001000022");
  assert.equal(result.method, "UNIQUE_SIGNATURE");
});

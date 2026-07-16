import assert from "node:assert/strict";
import test from "node:test";
import { compileProductMatchIndex, matchProduct, type ProductMatchMaster } from "../src/lib/product-match-engine.ts";
import { compileProductMatchNormalizations } from "../src/lib/product-match-normalizations.ts";
import { createProductMatchRulesV2 } from "../src/lib/product-match-rules-v2.ts";

const normalizations = compileProductMatchNormalizations([
  { id: "slim-care", field: "series", brand_scope: null, source_value: "SLIMCARE", canonical_value: "SLIM CARE", active: true },
  { id: "gold-series", field: "series", brand_scope: "SWEETY", source_value: "GOLD SERIES", canonical_value: "GOLD", active: true },
  { id: "swety", field: "brand", brand_scope: null, source_value: "SWETY", canonical_value: "SWEETY", active: true },
], {
  brand: ["MAKUKU", "SWEETY"],
  series: ["SLIM", "SLIM CARE", "GOLD"],
  size: ["L", "NB"],
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

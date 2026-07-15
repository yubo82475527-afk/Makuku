import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeBrandV2,
  normalizeSeriesV2,
  normalizeShapeV2,
  normalizeSizeV2,
  productMatchRulesV2,
} from "../src/lib/product-match-rules-v2.ts";
import { compileProductMatchIndex, matchProduct } from "../src/lib/product-match-engine.ts";

test("controlled series aliases normalize without fuzzy matching", () => {
  assert.equal(normalizeSeriesV2("DRYCARE"), "DRY CARE");
  assert.equal(normalizeSeriesV2("DRY CARE"), "DRY CARE");
  assert.equal(normalizeSeriesV2("DRY-CARE"), "DRY CARE");
  assert.equal(normalizeSeriesV2("DRY"), "DRY");
  assert.equal(normalizeSeriesV2("SLIM"), "SLIM");
});

test("controlled size aliases normalize to master values", () => {
  assert.equal(normalizeSizeV2("MEDIUM"), "M");
  assert.equal(normalizeSizeV2("LARGE"), "L");
  assert.equal(normalizeSizeV2("3XL"), "XXXL");
});

test("controlled brand aliases normalize common OCR variants", () => {
  assert.equal(normalizeBrandV2("MamyPoko"), "MAMY POKO");
  assert.equal(normalizeBrandV2("MamyPoko pants"), "MAMY POKO");
  assert.equal(normalizeBrandV2("Swety"), "SWEETY");
});

test("controlled shape aliases normalize category language", () => {
  assert.equal(normalizeShapeV2("CELANA"), "PANTS");
  assert.equal(normalizeShapeV2("PANTS"), "PANTS");
  assert.equal(normalizeShapeV2("TAPE"), "TAPE");
});

test("raw brand DRYCARE can resolve the uniquely owned DRY CARE series", () => {
  const index = compileProductMatchIndex([{
    id: "competitor-dry-care-m30",
    entityType: "competitor_product",
    code: null,
    active: true,
    signature: {
      brand: "SWEETY",
      series: "DRY CARE",
      packageLevel: null,
      shape: "PANTS",
      size: "M",
      pieceCount: 30,
      version: null,
    },
    raw: { brand: "SWEETY", title: "SWEETY DRY CARE PANTS M30", shape: "PANTS" },
  }], productMatchRulesV2);

  const result = matchProduct({
    code: null,
    entityType: null,
    signature: {
      brand: "DRYCARE",
      series: null,
      packageLevel: null,
      shape: null,
      size: null,
      pieceCount: 30,
      version: null,
    },
    sources: ["brand", "sku", "piece_count"],
    raw: { brand: "DRYCARE", sku: "Pants Medium 30", pieceCount: 30 },
  }, index, productMatchRulesV2);

  assert.equal(result.product?.id, "competitor-dry-care-m30");
  assert.equal(result.method, "UNIQUE_SIGNATURE");
});

test("product family phrases resolve COMFIT, CF, SH, and SLIM series", () => {
  const products = [
    ["comfort-m40", "COMFORT FIT", "M", 40],
    ["skin-l54", "SKIN HEALTH", "L", 54],
    ["slim-m32", "SLIM", "M", 32],
  ].map(([id, series, size, pieceCount]) => ({
    id: String(id),
    entityType: "material_master" as const,
    code: null,
    active: true,
    signature: { brand: "MAKUKU", series: String(series), packageLevel: null, shape: "PANTS" as const, size: String(size), pieceCount: Number(pieceCount), version: null },
    raw: { brand: "MAKUKU", title: `MAKUKU ${series} PANTS ${size}${pieceCount}`, shape: "PANTS" },
  }));
  const index = compileProductMatchIndex(products, productMatchRulesV2);

  for (const [family, sku, pieceCount, expected] of [
    ["BABY DIAPERS COMFIT PANTS", "Pants Medium 40", 40, "comfort-m40"],
    ["B. DIAPERS CF PANTS", "Pants Medium 40", 40, "comfort-m40"],
    ["B. DIAPERS SH PANTS", "Pants Large 54", 54, "skin-l54"],
    ["MAKUKU BABY DIAPERS SLIM PANTS", "Pants Medium 32", 32, "slim-m32"],
  ] as const) {
    const result = matchProduct({
      code: null,
      entityType: null,
      signature: { brand: "MAKUKU", series: family, packageLevel: null, shape: null, size: null, pieceCount, version: null },
      sources: ["brand", "product_family_text", "sku", "piece_count"],
      raw: { brand: "MAKUKU", productFamilyText: family, sku, pieceCount },
    }, index, productMatchRulesV2);
    assert.equal(result.product?.id, expected, family);
  }
});

test("piece-count possessive suffix in row_anchor is not treated as size S", () => {
  const normalized = productMatchRulesV2.normalizeEvidence({
    code: null,
    entityType: null,
    signature: { brand: "MAKUKU", series: "COMFIT", packageLevel: null, shape: null, size: null, pieceCount: 38, version: null },
    sources: ["brand", "product_family_text", "row_anchor", "piece_count"],
    raw: { brand: "MAKUKU", productFamilyText: "BABY DIAPERS COMFIT PANTS", sku: "Unknown SKU", rowAnchor: "38'S-b", pieceCount: 38 },
  }, {
    seriesOwners: new Map([["COMFORT FIT", new Set(["MAKUKU"])]]),
    brandEntityTypes: new Map([["MAKUKU", new Set(["material_master" as const])]]),
  });

  assert.equal(normalized.signature.size, null);
});

test("controlled BOY GIRL and CHARACTER variants disambiguate duplicate signatures", () => {
  const index = compileProductMatchIndex([
    ["boy", "MAMY POKO ROYAL SOFT PANTS L34 BOYS"],
    ["girl", "MAMY POKO ROYAL SOFT PANTS L34 GIRLS"],
  ].map(([id, title]) => ({
    id,
    entityType: "competitor_product" as const,
    code: null,
    active: true,
    signature: { brand: "MAMY POKO", series: "ROYAL SOFT", packageLevel: null, shape: "PANTS" as const, size: "L", pieceCount: 34, version: null },
    raw: { brand: "MAMY POKO", title, shape: "PANTS" },
  })), productMatchRulesV2);
  const result = matchProduct({
    code: null,
    entityType: null,
    signature: { brand: "MAMYPOKO", series: "ROYAL SOFT", packageLevel: null, shape: null, size: null, pieceCount: 34, version: null },
    sources: ["brand", "sku", "piece_count"],
    raw: { brand: "MAMYPOKO", sku: "ROYAL SOFT PANTS LARGE 34 GIRL", pieceCount: 34 },
  }, index, productMatchRulesV2);

  assert.equal(result.product?.id, "girl");
});

test("MamyPoko pants evidence normalizes brand before matching Royal Soft Organic NB52", () => {
  const index = compileProductMatchIndex([{
    id: "mamy-royal-soft-organic-nb52",
    entityType: "competitor_product" as const,
    code: null,
    active: true,
    signature: {
      brand: "MAMY POKO",
      series: "ORGANIC",
      packageLevel: null,
      shape: "PANTS" as const,
      size: "NB",
      pieceCount: 52,
      version: null,
    },
    raw: {
      brand: "MAMY POKO",
      title: "MAMY POKO ROYAL SOFT ORGANIC NB52",
      shape: "PANTS",
    },
  }], productMatchRulesV2);

  const result = matchProduct({
    code: null,
    entityType: null,
    signature: {
      brand: "MamyPoko pants",
      series: null,
      packageLevel: null,
      shape: null,
      size: null,
      pieceCount: 52,
      version: null,
    },
    sources: ["brand", "sku", "piece_count"],
    raw: {
      brand: "MamyPoko pants",
      sku: "MamyPoko pants Royal Soft NB",
      pieceCount: 52,
    },
  }, index, productMatchRulesV2);

  assert.equal(result.product?.id, "mamy-royal-soft-organic-nb52");
  assert.equal(result.method, "UNIQUE_SIGNATURE");
});

test("competitor SKU signatures disambiguate MamyPoko boy and girl variants", () => {
  const index = compileProductMatchIndex([
    ["boy", "MAMY POKO PREMIUM PANTS BOY XXL 38"],
    ["girl", "MAMY POKO PREMIUM PANTS GIRL XXL 38"],
  ].map(([id, title]) => ({
    id,
    entityType: "competitor_product" as const,
    code: null,
    active: true,
    signature: {
      brand: "MAMY POKO",
      series: "ROYAL SOFT",
      packageLevel: null,
      shape: null,
      size: "XXL",
      pieceCount: 38,
      version: null,
    },
    raw: {
      brand: "MAMY POKO",
      title,
      shape: title,
    },
  })), productMatchRulesV2);

  const result = matchProduct({
    code: null,
    entityType: null,
    signature: {
      brand: "MamyPoko",
      series: null,
      packageLevel: null,
      shape: null,
      size: null,
      pieceCount: 38,
      version: null,
    },
    sources: ["brand", "sku", "piece_count"],
    raw: {
      brand: "MamyPoko",
      sku: "MamyPoko Premium Pants Girl XXL",
      pieceCount: 38,
    },
  }, index, productMatchRulesV2);

  assert.equal(result.product?.id, "girl");
  assert.equal(result.method, "UNIQUE_SIGNATURE");
});

test("Makuku Slim evidence without Silky disambiguates regular Slim from Slim Luxury Silky", () => {
  const index = compileProductMatchIndex([
    {
      id: "0201006000024",
      entityType: "material_master" as const,
      code: "0201006000024",
      active: true,
      signature: {
        brand: "MAKUKU",
        series: "Slim",
        packageLevel: null,
        shape: null,
        size: "XXL",
        pieceCount: 28,
        version: null,
      },
      raw: {
        brand: "MAKUKU",
        title: "MAKUKU Air Diapers - Slim Pants XXL28",
        shape: "MAKUKU Air Diapers - Slim Pants XXL28 Pants Big pack",
      },
    },
    {
      id: "14014036502",
      entityType: "material_master" as const,
      code: "14014036502",
      active: true,
      signature: {
        brand: "MAKUKU",
        series: "Slim",
        packageLevel: null,
        shape: null,
        size: "XXL",
        pieceCount: 28,
        version: null,
      },
      raw: {
        brand: "MAKUKU",
        title: "MAKUKU Slim Luxury Silky Pants XXL28",
        shape: "MAKUKU Slim Luxury Silky Pants XXL28 Pants Big pack",
      },
    },
  ], productMatchRulesV2);

  const result = matchProduct({
    code: null,
    entityType: null,
    signature: {
      brand: "MAKUKU",
      series: "SLIM REGULAR (PANTS)",
      packageLevel: null,
      shape: null,
      size: null,
      pieceCount: 28,
      version: null,
    },
    sources: ["brand", "product_family_text", "section_title", "sku", "row_anchor", "piece_count"],
    raw: {
      brand: "MAKUKU",
      productFamilyText: "SLIM REGULAR (PANTS)",
      sectionTitle: "SLIM REGULAR (PANTS)",
      sku: "MAKUKU MAKUKU SLIM REGULAR (PANTS) XXL",
      rowAnchor: "XXL",
      pieceCount: 28,
    },
  }, index, productMatchRulesV2);

  assert.equal(result.product?.id, "0201006000024");
  assert.equal(result.method, "UNIQUE_SIGNATURE");

  const slimWithoutRegularText = matchProduct({
    code: null,
    entityType: null,
    signature: {
      brand: "MAKUKU",
      series: "SLIM",
      packageLevel: null,
      shape: null,
      size: null,
      pieceCount: 28,
      version: null,
    },
    sources: ["brand", "product_family_text", "sku", "row_anchor", "piece_count"],
    raw: {
      brand: "MAKUKU",
      productFamilyText: "SLIM",
      sku: "MAKUKU SLIM PANTS XXL",
      rowAnchor: "XXL",
      pieceCount: 28,
    },
  }, index, productMatchRulesV2);

  assert.equal(slimWithoutRegularText.product?.id, "0201006000024");
  assert.equal(slimWithoutRegularText.method, "UNIQUE_SIGNATURE");
});

test("Makuku regular shelf labels disambiguate old regular products from named variants", () => {
  const index = compileProductMatchIndex([
    {
      id: "14014041601",
      entityType: "material_master" as const,
      code: "14014041601",
      active: true,
      signature: { brand: "MAKUKU", series: "Slim", packageLevel: null, shape: null, size: "NB/NB-S", pieceCount: 52, version: null },
      raw: { brand: "MAKUKU", title: "MAKUKU Air Diapers Slim Tape NB52", shape: "MAKUKU Air Diapers Slim Tape NB52 Tape Jumbo pack" },
    },
    {
      id: "14014041651",
      entityType: "material_master" as const,
      code: "14014041651",
      active: true,
      signature: { brand: "MAKUKU", series: "Slim", packageLevel: null, shape: null, size: "NB/NB-S", pieceCount: 52, version: null },
      raw: { brand: "MAKUKU", title: "MAKUKU Slim Luxury Silky Tape NB52", shape: "MAKUKU Slim Luxury Silky Tape NB52 Tape Jumbo pack" },
    },
    {
      id: "0201003000043",
      entityType: "material_master" as const,
      code: "0201003000043",
      active: true,
      signature: { brand: "MAKUKU", series: "Pro Care", packageLevel: null, shape: null, size: "M", pieceCount: 36, version: null },
      raw: { brand: "MAKUKU", title: "MAKUKU Air Diapers Pro Care Pants M36", shape: "MAKUKU Air Diapers Pro Care Pants M36 Pants Big pack" },
    },
    {
      id: "14015023503",
      entityType: "material_master" as const,
      code: "14015023503",
      active: true,
      signature: { brand: "MAKUKU", series: "Pro Care", packageLevel: null, shape: null, size: "M", pieceCount: 36, version: null },
      raw: { brand: "MAKUKU", title: "MAKUKU Air Diapers Pro Care 2.0 Pants M36", shape: "MAKUKU Air Diapers Pro Care 2.0 Pants M36 Pants Big pack" },
    },
    {
      id: "0201006000026",
      entityType: "material_master" as const,
      code: "0201006000026",
      active: true,
      signature: { brand: "MAKUKU", series: "Comfort Fit", packageLevel: null, shape: null, size: "XXL", pieceCount: 22, version: null },
      raw: { brand: "MAKUKU", title: "MAKUKU Air Diapers - Comfort Fit Pants XXL22", shape: "MAKUKU Air Diapers - Comfort Fit Pants XXL22 Pants Big pack" },
    },
    {
      id: "14013026502",
      entityType: "material_master" as const,
      code: "14013026502",
      active: true,
      signature: { brand: "MAKUKU", series: "Comfort Fit", packageLevel: null, shape: null, size: "XXL", pieceCount: 22, version: null },
      raw: { brand: "MAKUKU", title: "MAKUKU Comfort Fit 3.0 Pants XXL22", shape: "MAKUKU Comfort Fit 3.0 Pants XXL22 Pants Big pack" },
    },
  ], productMatchRulesV2);

  const cases = [
    {
      sku: "MAKUKU MAKUKU SLIM JUMBO (TAPE) NB",
      family: "SLIM JUMBO (TAPE)",
      rowAnchor: "NB",
      pieceCount: 52,
      expected: "14014041601",
    },
    {
      sku: "MAKUKU MAKUKU Pro Care Regular (Pants) M",
      family: "Pro Care Regular (Pants)",
      rowAnchor: "M",
      pieceCount: 36,
      expected: "14015023503",
    },
    {
      sku: "MAKUKU MAKUKU COMFORT FIT REGULAR (PANTS) XXL",
      family: "COMFORT FIT REGULAR (PANTS)",
      rowAnchor: "XXL",
      pieceCount: 22,
      expected: "14013026502",
    },
  ];

  for (const item of cases) {
    const result = matchProduct({
      code: null,
      entityType: null,
      signature: {
        brand: "MAKUKU",
        series: item.family,
        packageLevel: null,
        shape: null,
        size: null,
        pieceCount: item.pieceCount,
        version: null,
      },
      sources: ["brand", "product_family_text", "sku", "row_anchor", "piece_count"],
      raw: {
        brand: "MAKUKU",
        productFamilyText: item.family,
        sku: item.sku,
        rowAnchor: item.rowAnchor,
        pieceCount: item.pieceCount,
      },
    }, index, productMatchRulesV2);

    assert.equal(result.product?.id, item.expected, item.sku);
    assert.ok(result.method === "UNIQUE_SIGNATURE" || result.method === "FULL_SIGNATURE", item.sku);
  }
});

test("conflicting evidence remains unmatched instead of guessing", () => {
  const index = compileProductMatchIndex([{
    id: "pro-m36",
    entityType: "material_master" as const,
    code: null,
    active: true,
    signature: { brand: "MAKUKU", series: "PRO CARE", packageLevel: null, shape: "PANTS" as const, size: "M", pieceCount: 36, version: null },
    raw: { brand: "MAKUKU", title: "MAKUKU Air Diapers Pro Care Pants M36" },
  }], productMatchRulesV2);

  const result = matchProduct({
    code: null,
    entityType: null,
    signature: { brand: "MAKUKU", series: null, packageLevel: null, shape: null, size: null, pieceCount: 36, version: null },
    sources: ["brand", "product_family_text", "section_title", "sku", "row_anchor", "piece_count"],
    raw: {
      brand: "MAKUKU",
      productFamilyText: "PRO CARE REGULAR (PANTS)",
      sectionTitle: "COMFORT FIT REGULAR (PANTS)",
      sku: "MAKUKU Pro Care Pants M",
      rowAnchor: "M",
      pieceCount: 36,
    },
  }, index, productMatchRulesV2);

  assert.equal(result.method, "UNMATCHED");
  assert.equal(result.reason, "CONFLICT_SIGNATURE");
  assert.equal(result.evidence.raw.sectionTitle, "COMFORT FIT REGULAR (PANTS)");
  assert.equal(result.evidence.conflicts?.[0]?.field, "series");
});

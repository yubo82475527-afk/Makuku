import assert from "node:assert/strict";
import test from "node:test";
import {
  buildEvidenceSkuSignature,
  normalizeSkuSize,
  parseSkuSignatureFromText,
} from "../src/lib/sku-signature.ts";

test("normalizes NB slash aliases to NB", () => {
  assert.equal(normalizeSkuSize("NB/NB-S"), "NB");
  assert.equal(normalizeSkuSize("NB S"), "NB");
  assert.equal(normalizeSkuSize("NB-S"), "NB");
});

test("parses Makuku numeric versions and named variants from product names", () => {
  assert.deepEqual(parseSkuSignatureFromText("MAKUKU Air Diapers Pro Care 2.0 Pants M36"), {
    brand: "MAKUKU",
    series: "PRO CARE",
    shape: "PANTS",
    size: "M",
    pieceCount: 36,
    variant: "2.0",
    packageLevel: null,
  });
  assert.deepEqual(parseSkuSignatureFromText("MAKUKU Slim Luxury Silky Tape NB52"), {
    brand: "MAKUKU",
    series: "SLIM",
    shape: "TAPE",
    size: "NB",
    pieceCount: 52,
    variant: "LUXURY SILKY",
    packageLevel: null,
  });
});

test("builds evidence signature from raw product section row and piece count", () => {
  const result = buildEvidenceSkuSignature({
    brand: "MAKUKU",
    productFamilyText: "PRO CARE REGULAR (PANTS)",
    sectionTitle: "PRO CARE REGULAR (PANTS)",
    sku: "MAKUKU MAKUKU Pro Care Regular (Pants) M",
    rowAnchor: "M",
    pieceCount: 36,
  });

  assert.deepEqual(result.signature, {
    brand: "MAKUKU",
    series: "PRO CARE",
    shape: "PANTS",
    size: "M",
    pieceCount: 36,
    variant: null,
    packageLevel: "REGULAR",
  });
  assert.deepEqual(result.conflicts, []);
});

test("detects conflicting series evidence and blocks normalization", () => {
  const result = buildEvidenceSkuSignature({
    brand: "MAKUKU",
    productFamilyText: "PRO CARE REGULAR (PANTS)",
    sectionTitle: "COMFORT FIT REGULAR (PANTS)",
    sku: "MAKUKU Pro Care Pants M",
    rowAnchor: "M",
    pieceCount: 36,
  });

  assert.equal(result.signature.series, null);
  assert.equal(result.conflicts[0]?.field, "series");
});

test("parses competitor series shape and variants from product names", () => {
  assert.deepEqual(parseSkuSignatureFromText("MAMY POKO ROYAL SOFT ORGANIC NB52"), {
    brand: "MAMY POKO",
    series: "ORGANIC",
    shape: null,
    size: "NB",
    pieceCount: 52,
    variant: "ROYAL SOFT",
    packageLevel: null,
  });

  assert.deepEqual(parseSkuSignatureFromText("MAMY POKO PREMIUM PANTS GIRL XXL 38"), {
    brand: "MAMY POKO",
    series: "ROYAL SOFT",
    shape: "PANTS",
    size: "XXL",
    pieceCount: 38,
    variant: "GIRL",
    packageLevel: null,
  });

  assert.deepEqual(parseSkuSignatureFromText("LIFREE PEREKAT ANTI BOCOR XL13"), {
    brand: "LIFREE",
    series: "ANTI BOCOR",
    shape: "TAPE",
    size: "XL",
    pieceCount: 13,
    variant: null,
    packageLevel: null,
  });

  assert.equal(parseSkuSignatureFromText("PARENTY POPOK DEWASA GELANA M8").shape, "PANTS");
  assert.equal(parseSkuSignatureFromText("PARENTY POPOK DEWASA CELANA M8").shape, "PANTS");
});

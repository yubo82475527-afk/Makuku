import assert from "node:assert/strict";
import test from "node:test";
import { mergeStoredCandidateEvidence } from "../src/lib/stored-match-evidence.ts";

test("historical rerun reuses richer saved candidate identity when vision row says Unknown SKU", () => {
  const [merged] = mergeStoredCandidateEvidence([{
    brand: "MAKUKU",
    product: "MAKUKU BABY DIAPERS COMFIT PANTS Unknown SKU",
    price: "100000",
    piece_count: 38,
    type: "SKU",
    confidence: 0.9,
    source: "key_sku",
    sourceImageId: "image-1",
    sourceRowIndex: 2,
  }], [{
    source_image_id: "image-1",
    source_row_index: 2,
    raw_brand: "MAKUKU",
    raw_product: "MAKUKU BABY DIAPERS COMFIT PANTS 38'S EXTRA LARGE",
    raw_piece_count_text: "38",
    piece_count: 38,
  }]);

  assert.equal(merged.product, "MAKUKU BABY DIAPERS COMFIT PANTS 38'S EXTRA LARGE");
  assert.equal(merged.piece_count, 38);
});

test("historical fallback does not cross rows when family or piece count changed", () => {
  const [merged] = mergeStoredCandidateEvidence([{
    brand: "MAKUKU",
    product: "MAKUKU BABY DIAPERS SLIM PANTS Unknown SKU",
    price: "100000",
    piece_count: 32,
    type: "SKU",
    confidence: 0.9,
    source: "key_sku",
    sourceImageId: "image-1",
    sourceRowIndex: 2,
  }], [{
    source_image_id: "image-1",
    source_row_index: 2,
    raw_brand: "MAKUKU",
    raw_product: "MAKUKU B-DIAPERS SH PANTS M 28'S",
    raw_piece_count_text: "28",
    piece_count: 28,
  }]);

  assert.equal(merged.product, "MAKUKU BABY DIAPERS SLIM PANTS Unknown SKU");
  assert.equal(merged.piece_count, 32);
});

import assert from "node:assert/strict";
import test from "node:test";
import { priceImageRetakeReason } from "../src/lib/store-visit-price-image-state.ts";

test("price image requires retake when quality passed but no readable rows were extracted", () => {
  assert.equal(priceImageRetakeReason({
    photo_quality: { status: "pass", reasons: [], message: "Readable board" },
    rows: [],
  }), "NO_READABLE_PRICE_ROWS");
});

test("price image keeps physical retake and successful extraction distinct", () => {
  assert.equal(priceImageRetakeReason({
    photo_quality: { status: "retake_required", reasons: ["price_unclear"], message: "Blurred" },
    rows: [],
  }), "PHOTO_QUALITY");
  assert.equal(priceImageRetakeReason({
    photo_quality: { status: "pass", reasons: [], message: "Readable board" },
    rows: [{ sku: "CONFIDENCE L7", net_price_idr: 30000 }],
  }), null);
});

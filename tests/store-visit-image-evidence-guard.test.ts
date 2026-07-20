import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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

test("runner retries an empty price result once and shares the resulting retake state with H5", () => {
  const jobRunner = readFileSync("src/lib/store-visit-ai-jobs.ts", "utf8");
  const imageMaintenance = readFileSync("src/lib/store-visit-image-maintenance.ts", "utf8");
  const h5Detail = readFileSync("src/components/store-visit-detail-h5.tsx", "utf8");

  assert.match(jobRunner, /no_readable_rows_retry_count/);
  assert.match(jobRunner, /NO_READABLE_PRICE_ROWS/);
  assert.match(jobRunner, /priceImageRetakeReason/);
  assert.match(imageMaintenance, /priceImageRetakeReason/);
  assert.match(h5Detail, /priceImageRetakeReason/);
  assert.match(h5Detail, /retakeNoReadableRows/);
});

import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const drawer = readFileSync("src/components/operator-price-review-drawer.tsx", "utf8");
const operatorReview = readFileSync("src/lib/operator-price-review.ts", "utf8");
const typesFile = readFileSync("src/lib/types.ts", "utf8");

test("operator price review detail exposes visit code for source context", () => {
  assert.match(typesFile, /visit_code: string \| null;/);
  assert.match(operatorReview, /visit_code: candidate\.offline_store_visits\?\.visit_code \?\? null/);
});

test("operator price review uses one-screen source image and facts layout", () => {
  assert.match(drawer, /max-w-6xl/);
  assert.match(drawer, /grid-cols-\[minmax\(0,1\.05fr\)_minmax\(360px,0\.95fr\)\]/);
  assert.match(drawer, /object-contain/);
  assert.match(drawer, /detail\.visit_code/);
  assert.match(drawer, /source_image_id/);
  assert.match(drawer, /Visit ID/);
  assert.match(drawer, /Image ID/);
  assert.match(drawer, /matchEditorOpen/);
  assert.match(drawer, /mode === "correct"/);
});

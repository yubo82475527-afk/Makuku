import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("diagnostic script reports duplicate and conflict signatures", () => {
  const source = readFileSync("scripts/diagnose-sku-signatures.mjs", "utf8");
  assert.match(source, /duplicateSignatures/);
  assert.match(source, /conflictSignatures/);
  assert.match(source, /material_master/);
  assert.match(source, /competitor_products/);
});

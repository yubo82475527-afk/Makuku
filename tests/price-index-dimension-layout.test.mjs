import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  DEFAULT_PRICE_INDEX_DIMENSIONS,
  normalizePriceIndexDimensions,
} from "../src/lib/price-index-dimensions.ts";

test("price index dimensions always retain Organization first and discard invalid values", () => {
  assert.deepEqual(DEFAULT_PRICE_INDEX_DIMENSIONS, ["organization"]);
  assert.deepEqual(
    normalizePriceIndexDimensions(["sku", "organization", "size", "city", "sku", "unknown"]),
    ["organization", "sku", "size", "city"],
  );
  assert.deepEqual(normalizePriceIndexDimensions([]), ["organization"]);
  assert.deepEqual(normalizePriceIndexDimensions("organization,province,size,sku"), ["organization", "province", "size", "sku"]);
});

test("price index layout dialog locks Organization and saves only explicit drafts", () => {
  const dialog = readFileSync("src/components/price-index-layout-dialog.tsx", "utf8");
  assert.match(dialog, /Columns3/);
  assert.match(dialog, /size: "\\u5c3a\\u7801"/);
  assert.match(dialog, /size: "Size"/);
  assert.match(dialog, /disabled=\{dimension === "organization"\}/);
  assert.match(dialog, /onSave\(normalizePriceIndexDimensions\(draftDimensions\)\)/);
  assert.match(dialog, /function DialogShell/);
  assert.match(dialog, /ArrowUp/);
  assert.match(dialog, /ArrowDown/);
  assert.doesNotMatch(dialog, /localStorage/);
});

test("price index layout trigger supports dashboard filter action alignment", () => {
  const dialog = readFileSync("src/components/price-index-layout-dialog.tsx", "utf8");
  assert.match(dialog, /className\?: string/);
  assert.match(dialog, /className=\{clsx\(/);
  assert.match(dialog, /type="button"/);
  assert.match(dialog, /Columns3/);
});

test("dashboard waits for local layout before loading and aborts superseded layouts", () => {
  const client = readFileSync("src/components/dashboard-client.tsx", "utf8");
  assert.match(client, /PRICE_INDEX_DIMENSION_STORAGE_KEY/);
  assert.match(client, /setDimensions\(readPriceIndexDimensions\(window\.localStorage\)\)/);
  assert.match(client, /if \(!dimensions\) return/);
  assert.match(client, /params\.set\("dimensions", dimensions\.join\(","\)\)/);
  assert.match(client, /window\.localStorage\.setItem\(/);
  assert.match(client, /controller\.abort\(\)/);
});

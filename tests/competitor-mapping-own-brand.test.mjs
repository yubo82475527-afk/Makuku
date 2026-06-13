import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const competitorProductsPage = readFileSync("src/app/[locale]/competitor-products/page.tsx", "utf8");
const competitorMappingsPage = readFileSync("src/app/[locale]/competitor-mappings/page.tsx", "utf8");
const competitorsRoute = readFileSync("src/app/api/competitors/route.ts", "utf8");

test("competitor pages exclude Makuku own-brand products", () => {
  for (const page of [competitorProductsPage, competitorMappingsPage]) {
    assert.match(page, /ownBrandIds/);
    assert.match(page, /isOwnBrandName/);
    assert.match(page, /brand\.is_own_brand/);
    assert.match(page, /!isOwnBrandName\(brand\.name\)/);
    assert.match(page, /ownBrandIds\.has\(product\.brand_id\)/);
    assert.match(page, /product\.brands\?\.name/);
  }
});

test("competitor product creation rejects own-brand brand ids", () => {
  assert.match(competitorsRoute, /\.from\("brands"\)/);
  assert.match(competitorsRoute, /is_own_brand/);
  assert.match(competitorsRoute, /isOwnBrandName/);
  assert.match(competitorsRoute, /name/);
  assert.match(competitorsRoute, /Own brand cannot be added as a competitor/);
  assert.match(competitorsRoute, /status: 400/);
});

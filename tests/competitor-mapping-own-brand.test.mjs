import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const competitorsPage = readFileSync("src/app/[locale]/competitors/page.tsx", "utf8");
const competitorsRoute = readFileSync("src/app/api/competitors/route.ts", "utf8");

test("competitor mapping list excludes Makuku own-brand products", () => {
  assert.match(competitorsPage, /ownBrandIds/);
  assert.match(competitorsPage, /isOwnBrandName/);
  assert.match(competitorsPage, /brand\.is_own_brand/);
  assert.match(competitorsPage, /!isOwnBrandName\(brand\.name\)/);
  assert.match(competitorsPage, /ownBrandIds\.has\(product\.brand_id\)/);
  assert.match(competitorsPage, /product\.brands\?\.name/);
});

test("competitor product creation rejects own-brand brand ids", () => {
  assert.match(competitorsRoute, /\.from\("brands"\)/);
  assert.match(competitorsRoute, /is_own_brand/);
  assert.match(competitorsRoute, /isOwnBrandName/);
  assert.match(competitorsRoute, /name/);
  assert.match(competitorsRoute, /Own brand cannot be added as a competitor/);
  assert.match(competitorsRoute, /status: 400/);
});

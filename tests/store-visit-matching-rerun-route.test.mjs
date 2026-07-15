import { existsSync, readFileSync } from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";

const routePath = "src/app/api/store-visit-monitor/rerun-matching/route.ts";
const gatewayPath = "src/lib/store-visit-matching-rerun-gateway.ts";

test("match-only rerun route reuses stored vision rows without image AI", () => {
  assert.equal(existsSync(routePath), true);
  const route = readFileSync(routePath, "utf8");
  const gateway = existsSync(gatewayPath) ? readFileSync(gatewayPath, "utf8") : "";
  assert.match(route, /requireAdminSession/);
  assert.match(route, /rerunStoreVisitMatching/);
  assert.match(route, /createStoreVisitMatchingRerunGateway/);
  assert.doesNotMatch(route, /function createGateway/);
  assert.match(gateway, /export function createStoreVisitMatchingRerunGateway/);
  assert.match(gateway, /loadProductMatchContext/);
  assert.match(gateway, /sourceItemsFromStoredPriceImages/);
  assert.match(gateway, /invalidateStoreVisitImagePriceImpact/);
  assert.match(gateway, /refreshStoreVisitStoredPriceState/);
  assert.match(gateway, /runPriceQualityGate/);
  assert.match(gateway, /replaceVisitOutput/);
  assert.match(gateway, /triggerReview/);
  assert.doesNotMatch(route, /runStoreVisitAnalysis|runStoreVisitAiAnalysisForVisit|openai|vision model/i);
});

test("store visit monitor exposes rerun controls without adding a page", () => {
  const page = readFileSync("src/app/[locale]/store-visit-monitor/page.tsx", "utf8");
  const client = readFileSync("src/components/store-visit-monitor-client.tsx", "utf8");
  const dialog = readFileSync("src/components/store-visit-matching-rerun-dialog.tsx", "utf8");
  assert.match(page, /canRerunMatching/);
  assert.match(client, /StoreVisitMatchingRerunDialog/);
  assert.match(client, /Rerun matching/);
  assert.match(dialog, /Run image AI again/i);
  assert.match(dialog, /rerun-jobs/);
  assert.doesNotMatch(dialog, /rerun-matching/);
});

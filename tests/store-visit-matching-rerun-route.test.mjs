import { existsSync, readFileSync } from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";

const routePath = "src/app/api/store-visit-monitor/rerun-matching/route.ts";
const gatewayPath = "src/lib/store-visit-matching-rerun-gateway.ts";
const jobsPath = "src/lib/price-quality-gate-jobs.ts";
const candidatesPath = "src/lib/ai-price-candidates.ts";

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
  assert.match(gateway, /replaceVisitOutput/);
  assert.match(gateway, /triggerReview/);
  assert.match(gateway, /candidateDisposition:\s*"delete"/);
  assert.doesNotMatch(gateway, /preserveExistingCandidates:\s*true/);
  assert.doesNotMatch(route, /runStoreVisitAnalysis|runStoreVisitAiAnalysisForVisit|openai|vision model/i);
});

test("match-only rerun uses priority quality chunks and does not drain the global gate", () => {
  const gateway = readFileSync(gatewayPath, "utf8");
  const jobs = readFileSync(jobsPath, "utf8");
  assert.match(gateway, /runPriorityPriceQualityGateBatched/);
  assert.match(gateway, /triggerPriceQualityGateRunner/);
  assert.match(jobs, /export async function runPriorityPriceQualityGateBatched/);
  assert.match(jobs, /PRICE_QUALITY_GATE_BATCH_SIZE/);
  assert.doesNotMatch(gateway, /runPriceQualityGate\s*\(/);
  assert.doesNotMatch(gateway, /for\s*\(\s*let\s+round\s*=\s*0;\s*round\s*<\s*100/);
});

test("match-only rerun priority review only tracks SKU candidate ids", () => {
  const gateway = readFileSync(gatewayPath, "utf8");
  assert.match(gateway, /candidate_type === "SKU"/);
  assert.match(gateway, /insertedCandidateIdsByVisit\.set/);
  assert.match(gateway, /runPriorityPriceQualityGateBatched/);
});

test("match-only rerun skips visit refresh that would reload vision JSON", () => {
  const gateway = readFileSync(gatewayPath, "utf8");
  assert.doesNotMatch(gateway, /refreshStoreVisitStoredPriceState/);
  assert.match(gateway, /async refreshVisit/);
  assert.match(gateway, /does not change vision_result|skipping refresh/i);
});

test("product match context loads narrow master columns required by match mappers", () => {
  const candidates = readFileSync(candidatesPath, "utf8");
  assert.match(candidates, /export const PRODUCT_MATCH_MATERIAL_SELECT/);
  assert.match(candidates, /export const PRODUCT_MATCH_COMPETITOR_SELECT/);
  assert.match(candidates, /PRODUCT_MATCH_MATERIAL_SELECT/);
  assert.match(candidates, /PRODUCT_MATCH_COMPETITOR_SELECT/);
  assert.doesNotMatch(candidates, /material_master"\)\.select\("\*"\)/);
  assert.doesNotMatch(candidates, /competitor_products"\)\.select\("\*,\s*brands/);

  for (const field of [
    "tenant_sku_code",
    "tenant_sku_name",
    "category",
    "sub_category",
    "brand",
    "sub_brand",
    "type",
    "sub_type",
    "pack_count",
    "f_expiry_date",
  ]) {
    assert.match(candidates, new RegExp(`PRODUCT_MATCH_MATERIAL_SELECT[\\s\\S]*${field}`));
  }
  for (const field of [
    "id",
    "competitor_sku_code",
    "status",
    "product_series",
    "package_type",
    "size",
    "piece_count",
    "normalized_name",
    "raw_title",
    "pack_type",
    "brands\\(id,name\\)",
  ]) {
    assert.match(candidates, new RegExp(`PRODUCT_MATCH_COMPETITOR_SELECT[\\s\\S]*${field}`));
  }
});

test("store visit monitor exposes rerun controls without adding a page", () => {
  const page = readFileSync("src/app/[locale]/store-visit-monitor/page.tsx", "utf8");
  const client = readFileSync("src/components/store-visit-monitor-client.tsx", "utf8");
  const exportButton = readFileSync("src/components/store-visit-monitor-export-button.tsx", "utf8");
  const dialog = readFileSync("src/components/store-visit-matching-rerun-dialog.tsx", "utf8");
  assert.match(page, /canRerunMatching/);
  assert.match(client, /StoreVisitMatchingRerunDialog/);
  assert.match(client, /Rerun matching/);
  assert.match(client, /重跑匹配/);
  assert.match(client, /StoreVisitMonitorExportButton/);
  assert.match(exportButton, /AsyncExportJobButton/);
  assert.match(exportButton, /export-jobs/);
  assert.match(dialog, /Run image AI again/i);
  assert.match(dialog, /rerun-jobs/);
  assert.doesNotMatch(dialog, /rerun-matching/);
});

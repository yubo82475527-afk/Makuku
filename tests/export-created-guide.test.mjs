import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (file) => readFileSync(file, "utf8");

test("async export buttons share fly-to-header Exports guide", () => {
  const shared = read("src/components/async-export-job-button.tsx");
  const guide = read("src/components/export-created-guide.tsx");
  const guideLib = read("src/lib/export-created-guide.ts");
  const menu = read("src/components/store-visit-monitor-export-menu.tsx");
  const shell = read("src/components/app-shell.tsx");

  assert.match(shared, /notifyExportCreated/);
  assert.match(shared, /导出数据/);
  assert.doesNotMatch(shared, /请到右上角|已创建，请/);
  assert.match(guide, /ExportCreatedGuideLayer/);
  assert.match(guideLib, /makuku:export-created-guide/);
  assert.match(guideLib, /data-makuku-exports-trigger/);
  assert.match(menu, /data-makuku-exports-trigger="true"/);
  assert.match(menu, /EXPORT_CREATED_GUIDE_EVENT/);
  assert.match(menu, /setSpotlight\(true\)/);
  assert.match(shell, /ExportCreatedGuideLayer/);
});

test("store visit and real-price export buttons reuse shared async export CTA", () => {
  const storeVisit = read("src/components/store-visit-monitor-export-button.tsx");
  const prices = read("src/components/price-snapshot-export-button.tsx");
  const priceIndex = read("src/components/price-index-export-button.tsx");
  const client = read("src/components/store-visit-monitor-client.tsx");

  assert.match(storeVisit, /AsyncExportJobButton/);
  assert.match(storeVisit, /export_view: exportView/);
  assert.match(storeVisit, /\/api\/store-visit-monitor\/export-jobs/);
  assert.match(prices, /AsyncExportJobButton/);
  assert.match(prices, /\/api\/price-snapshots\/export-jobs/);
  assert.match(priceIndex, /AsyncExportJobButton/);
  assert.match(client, /exportView=\{listView\}/);
  assert.match(client, /按拜访/);
  assert.match(client, /按导购/);
  assert.match(client, /按门店/);
});

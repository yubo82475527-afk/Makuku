import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const appShell = readFileSync("src/components/app-shell.tsx", "utf8");
const navConfig = readFileSync("src/lib/nav-config.ts", "utf8");
const pagePermissions = readFileSync("src/lib/page-permissions.ts", "utf8");
const storeVisitMonitorClient = readFileSync("src/components/store-visit-monitor-client.tsx", "utf8");
const navPlaceholder = readFileSync("src/components/nav-placeholder-page.tsx", "utf8");
const standardStorePage = readFileSync("src/app/[locale]/standard-store/page.tsx", "utf8");
const goalExecutionPage = readFileSync("src/app/[locale]/goal-execution/page.tsx", "utf8");

test("nav groups follow command / execution / governance IA", () => {
  assert.match(appShell, /NAV_GROUP_CONFIGS/);
  assert.match(navConfig, /zh: "经营看板"/);
  assert.match(navConfig, /zh: "执行跟进"/);
  assert.match(navConfig, /zh: "价格治理"/);
  assert.match(navConfig, /zh: "对标与匹配"/);
  assert.doesNotMatch(navConfig, /zh: "市场价格"/);
  assert.doesNotMatch(navConfig, /zh: "价格标准"/);

  assert.match(navConfig, /href: "\/dashboard"/);
  assert.match(navConfig, /href: "\/standard-store"/);
  assert.match(navConfig, /href: "\/prices"/);
  assert.match(navConfig, /href: "\/goal-execution"/);
  assert.match(navConfig, /href: "\/store-visit-monitor"/);
  assert.match(navConfig, /href: "\/offline-price-candidates"/);
  assert.doesNotMatch(navConfig, /promoter-photos/);
  assert.doesNotMatch(navConfig, /goal-breakdown/);
  assert.doesNotMatch(navConfig, /execution-progress/);
});

test("page permissions register standard-store and goal-execution only for new menus", () => {
  assert.match(pagePermissions, /"standard-store"/);
  assert.match(pagePermissions, /"goal-execution"/);
  assert.match(pagePermissions, /完美终端2\.0/);
  assert.match(pagePermissions, /Perfect Store 2\.0/);
  assert.match(pagePermissions, /目标执行2\.0/);
  assert.match(pagePermissions, /prices: \{ zh: "真实价格"/);
  assert.doesNotMatch(pagePermissions, /promoter-photos/);
});

test("standard store and goal execution mock pages exist", () => {
  assert.match(navPlaceholder, /示意数据，非生产事实/);
  assert.match(navPlaceholder, /Mock data — not production facts/);
  assert.match(standardStorePage, /完美终端2\.0|Perfect Store 2\.0/);
  assert.match(standardStorePage, /NavPlaceholderPage/);
  assert.match(goalExecutionPage, /目标执行2\.0|Goal Execution 2\.0/);
  assert.match(goalExecutionPage, /本周目标摘要|This week summary/);
});

test("store visit monitor supports by-visit and by-promoter views with filter-scoped summary", () => {
  assert.match(storeVisitMonitorClient, /按拜访|By visit/);
  assert.match(storeVisitMonitorClient, /按导购|By promoter/);
  assert.match(storeVisitMonitorClient, /按门店|By store/);
  assert.match(storeVisitMonitorClient, /listView === "promoter"/);
  assert.match(storeVisitMonitorClient, /listView === "store"/);
  assert.match(storeVisitMonitorClient, /拜访门店数|Stores visited/);
  assert.match(storeVisitMonitorClient, /解析商品数|Parsed products/);
  assert.match(storeVisitMonitorClient, /通过商品数|Approved products/);
  assert.match(storeVisitMonitorClient, /通过率|Pass rate/);
  assert.match(storeVisitMonitorClient, /关联组织|Organization/);
  assert.match(storeVisitMonitorClient, /筛选条件内|Current filters/);
  assert.match(storeVisitMonitorClient, /promoter_summary/);
  assert.match(storeVisitMonitorClient, /store_summary/);
  assert.match(storeVisitMonitorClient, /promoterSummary/);
  assert.match(storeVisitMonitorClient, /storeSummary/);
  assert.match(storeVisitMonitorClient, /exportView=\{listView\}/);
  assert.match(storeVisitMonitorClient, /listView !== "promoter" && listView !== "store"/);
  assert.doesNotMatch(storeVisitMonitorClient, /当前页粗算|Current page estimate|withPhotos|withoutPhotos/);
});

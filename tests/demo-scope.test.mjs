import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const appShell = readFileSync("src/components/app-shell.tsx", "utf8");
const demoData = readFileSync("src/lib/demo-data.ts", "utf8");
const dashboardPage = readFileSync("src/app/[locale]/dashboard/page.tsx", "utf8");
const pricesPage = readFileSync("src/app/[locale]/prices/page.tsx", "utf8");
const typesFile = readFileSync("src/lib/types.ts", "utf8");
const dataFile = readFileSync("src/lib/data.ts", "utf8");
const promoEventsPage = readFileSync("src/app/[locale]/promo-events/page.tsx", "utf8");

test("board navigation exposes the one-week product workflow", () => {
  assert.match(appShell, /Executive Board/);
  assert.match(appShell, /Field Capture/);
  assert.match(appShell, /AI Price Review/);
  assert.match(appShell, /Product Master/);

  assert.doesNotMatch(appShell, /Operating Queue/);
  assert.doesNotMatch(appShell, /AI Debug/);
  assert.doesNotMatch(appShell, /TikTok Phase 2|tiktokPhase2/);
  assert.doesNotMatch(appShell, /Channels|channels/);
  assert.doesNotMatch(appShell, /Competitors|competitors/);
  assert.doesNotMatch(appShell, /Alerts|alerts/);
});

test("mobile screens keep access to the board navigation", () => {
  assert.match(appShell, /lg:hidden/);
  assert.match(appShell, /mobileNavLabel/);
  assert.match(appShell, /<summary/);
});

test("visible sample data does not look like throwaway mock data", () => {
  assert.doesNotMatch(demoData, /name: "Demo/);
  assert.doesNotMatch(demoData, /address: "Demo address"/);
  assert.doesNotMatch(demoData, /source: "demo"/);
  assert.match(demoData, /source: "pilot-sample"/);
});

test("dashboard states the one-week pilot objective", () => {
  assert.match(dashboardPage, /7-day pilot objective|7天样板目标|7澶╂牱鏉跨洰鏍?/);
  assert.match(dashboardPage, /product segments|产品线|浜у搧绾?/i);
});

test("dashboard is shaped around product segment price pressure", () => {
  assert.match(typesFile, /export type ProductSegmentBattle/);
  assert.match(dataFile, /export async function getProductSegmentBattles/);
  assert.match(dashboardPage, /ProductSegmentBattleBoard/);
  assert.match(dashboardPage, /Product Battle Overview/);
  assert.match(dashboardPage, /Makuku price band/);
  assert.match(dashboardPage, /Competitor low/);
  assert.match(dashboardPage, /gap/i);
  assert.doesNotMatch(dashboardPage, /PriorityActionCard/);
  assert.doesNotMatch(dashboardPage, /Today Priority Actions/);

  const battleIndex = dashboardPage.search(/ProductSegmentBattleBoard|Product Battle Overview/);
  const matrixIndex = dashboardPage.search(/Category x Offline Channel Promo Matrix/);
  assert.ok(battleIndex >= 0, "product battle section should exist");
  assert.ok(matrixIndex < 0 || battleIndex < matrixIndex, "product battle should appear before matrix diagnostics");
});

test("dashboard serves the product board directly instead of a loading shell", () => {
  assert.equal(existsSync("src/app/[locale]/dashboard/loading.tsx"), false);
});

test("prices can filter by product line and size", () => {
  assert.match(pricesPage, /line\?: string/);
  assert.match(pricesPage, /size\?: string/);
  assert.match(pricesPage, /params\.line/);
  assert.match(pricesPage, /params\.size/);
  assert.match(pricesPage, /resolveProductSegment/);
  assert.match(pricesPage, /inferProductSize/);
  assert.match(dataFile, /competitorProductSegment/);
  assert.equal(existsSync("src/app/[locale]/prices/loading.tsx"), false);
});

test("opportunity feed stays available but is not the board entry point", () => {
  assert.match(promoEventsPage, /OpportunityQueueTabs/);
  assert.match(promoEventsPage, /OpportunityTaskCard/);
  assert.match(promoEventsPage, /pending_review|capture_needed|completed/);
});

import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const zhDictionary = readFileSync("src/lib/i18n/dictionaries/zh.ts", "utf8");
const dashboardPage = readFileSync("src/app/[locale]/dashboard/page.tsx", "utf8");
const pricesPage = readFileSync("src/app/[locale]/prices/page.tsx", "utf8");

test("zh dictionary stores readable utf8 copy", () => {
  assert.match(zhDictionary, /Asia\/Jakarta 时区 \/ IDR 价格/);
  assert.match(zhDictionary, /仪表盘/);
  assert.match(zhDictionary, /线下门店采集/);
  assert.doesNotMatch(zhDictionary, /鏃|浠|闂|缂|鍏|璇|鎴|寮|鍔|銆|锛/);
});

test("dashboard and prices pages keep readable inline zh labels", () => {
  assert.match(dashboardPage, /价格异常跟进/);
  assert.match(dashboardPage, /问题门店/);
  assert.match(dashboardPage, /查看价格明细/);
  assert.match(pricesPage, /品牌\/系列/);
  assert.match(pricesPage, /全部商品等级/);
  assert.match(pricesPage, /导出 CSV/);
  assert.doesNotMatch(dashboardPage, /鏃|浠|闂|缂|鍏|璇|鎴|寮|鍔|銆|锛/);
  assert.doesNotMatch(pricesPage, /鏃|浠|闂|缂|鍏|璇|鎴|寮|鍔|銆|锛/);
});

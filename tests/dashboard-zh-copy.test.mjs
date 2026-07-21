import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const zhDictionary = readFileSync("src/lib/i18n/dictionaries/zh.ts", "utf8");
const dashboardPage = readFileSync("src/app/[locale]/dashboard/page.tsx", "utf8");
const pricesPage = [
  readFileSync("src/app/[locale]/prices/page.tsx", "utf8"),
  readFileSync("src/components/price-snapshot-export-button.tsx", "utf8"),
].join("\n");

test("zh dictionary stores readable utf8 copy", () => {
  assert.match(zhDictionary, /Asia\/Jakarta 时区 \/ IDR 价格/);
  assert.match(zhDictionary, /仪表盘/);
  assert.match(zhDictionary, /线下门店采集/);
  assert.doesNotMatch(zhDictionary, /閺億娴爘/);
});

test("dashboard and prices pages keep readable inline zh labels", () => {
  assert.match(dashboardPage, /仪表盘重构中/);
  assert.match(dashboardPage, /当前已临时停用首页仪表盘的所有报表查询/);
  assert.match(pricesPage, /品牌\/系列/);
  assert.match(pricesPage, /全部商品等级/);
  assert.match(pricesPage, /导出 CSV/);
  assert.doesNotMatch(dashboardPage, /閺億娴爘/);
  assert.doesNotMatch(pricesPage, /閺億娴爘/);
});

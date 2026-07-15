import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const competitorsPage = readFileSync("src/app/[locale]/competitor-mappings/page.tsx", "utf8");
const competitorProductPage = readFileSync("src/app/[locale]/competitor-products/page.tsx", "utf8");
const componentPath = "src/components/product-master-search-select.tsx";
const searchSelect = existsSync(componentPath) ? readFileSync(componentPath, "utf8") : "";

test("product master picker remains reusable but is not mounted on 1.0 competitor mapping", () => {
  assert.match(competitorsPage, /CompetitorSeriesRulesPanel/);
  assert.match(competitorsPage, /materials=\{materialResult\.data\}/);
  assert.doesNotMatch(competitorsPage, /CompetitorMappingsTable/);
  assert.doesNotMatch(competitorsPage, /ProductMasterSearchSelect/);
  assert.equal(existsSync("src/components/competitor-mappings-table.tsx"), false);
  assert.equal(existsSync("src/components/competitor-mapping-table.tsx"), false);
  assert.doesNotMatch(competitorsPage, /<SelectInput name="material_sku_code"/);
  assert.doesNotMatch(competitorProductPage, /ProductMasterSearchSelect/);
});

test("product master picker fuzzy searches core material master fields and submits material_sku_code", () => {
  assert.ok(existsSync(componentPath), "product master search select component should exist");
  assert.match(searchSelect, /"use client"/);
  assert.match(searchSelect, /useMemo/);
  assert.match(searchSelect, /useState/);
  assert.match(searchSelect, /name="material_sku_code"/);
  assert.match(searchSelect, /tenant_sku_code/);
  assert.match(searchSelect, /tenant_sku_name/);
  assert.match(searchSelect, /sub_brand/);
  assert.match(searchSelect, /sub_type/);
  assert.match(searchSelect, /includes\(normalized\)/);
  assert.match(searchSelect, /slice\(0, 8\)/);
  assert.match(searchSelect, /role="listbox"/);
  assert.match(searchSelect, /chooseMaterial/);
  assert.match(searchSelect, /onPointerDown/);
  assert.match(searchSelect, /onClick=\{\(\) => chooseMaterial\(material\)\}/);
  assert.match(searchSelect, /onKeyDown/);
  assert.match(searchSelect, /event\.key === "Enter"/);
  assert.match(searchSelect, /filteredMaterials\[0\]/);
});

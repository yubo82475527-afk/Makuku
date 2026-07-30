import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const columnsFile = readFileSync("src/lib/material-master.ts", "utf8");
const typesFile = readFileSync("src/lib/types.ts", "utf8");
const migrationGroup1 = readFileSync("supabase/migrations/202607300001_material_master_material_group1.sql", "utf8");
const migrationGroup2 = readFileSync("supabase/migrations/202607240001_material_master_material_group2.sql", "utf8");
const importRoute = readFileSync("src/app/api/material-master/import/route.ts", "utf8");
const exportRoute = readFileSync("src/app/api/material-master/export/route.ts", "utf8");
const tableFile = readFileSync("src/components/material-master-table.tsx", "utf8");
const importForm = readFileSync("src/components/material-import-form.tsx", "utf8");

test("material_master adds nullable material_group1 before material_group2", () => {
  assert.match(migrationGroup1, /add column if not exists material_group1 text/);
  assert.match(migrationGroup2, /add column if not exists material_group2 text/);
  assert.match(typesFile, /material_group1: string \| null/);
  assert.match(typesFile, /material_group2: string \| null/);
  assert.match(columnsFile, /"sub_brand",\s*"material_group1",\s*"material_group2",\s*"type"/);
});

test("material master import/export and list surface material_group1 and material_group2", () => {
  assert.match(importRoute, /material_group1/);
  assert.match(importRoute, /material_group2/);
  assert.match(importRoute, /expectedColumnCount = 14/);
  assert.doesNotMatch(importRoute, /legacyColumnCount/);
  assert.doesNotMatch(importRoute, /hasMaterialGroup2/);
  assert.match(importRoute, /onConflict: "tenant_sku_code"/);
  assert.match(exportRoute, /sku\.material_group1/);
  assert.match(exportRoute, /sku\.material_group2/);
  assert.match(tableFile, /sku\.material_group1/);
  assert.match(tableFile, /sku\.material_group2/);
  assert.match(importForm, /"material_group1"/);
  assert.match(importForm, /"material_group2"/);
});

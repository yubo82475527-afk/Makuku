import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const columnsFile = readFileSync("src/lib/material-master.ts", "utf8");
const typesFile = readFileSync("src/lib/types.ts", "utf8");
const migrationFile = readFileSync("supabase/migrations/202607240001_material_master_material_group2.sql", "utf8");
const importRoute = readFileSync("src/app/api/material-master/import/route.ts", "utf8");
const exportRoute = readFileSync("src/app/api/material-master/export/route.ts", "utf8");
const tableFile = readFileSync("src/components/material-master-table.tsx", "utf8");
const importForm = readFileSync("src/components/material-import-form.tsx", "utf8");

test("material_master adds nullable material_group2 after sub_brand", () => {
  assert.match(migrationFile, /add column if not exists material_group2 text/);
  assert.match(typesFile, /material_group2: string \| null/);
  assert.match(columnsFile, /"sub_brand",\s*"material_group2",\s*"type"/);
});

test("material master import/export and list surface material_group2", () => {
  assert.match(importRoute, /material_group2/);
  assert.match(importRoute, /legacyColumnCount = 12/);
  assert.match(importRoute, /expectedColumnCount = 13/);
  assert.match(importRoute, /onConflict: "tenant_sku_code"/);
  assert.match(exportRoute, /sku\.material_group2/);
  assert.match(tableFile, /sku\.material_group2/);
  assert.match(importForm, /"material_group2"/);
});

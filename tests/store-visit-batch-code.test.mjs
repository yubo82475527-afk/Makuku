import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const migrationPath = "supabase/migrations/202606170004_store_visit_code_and_candidate_key.sql";
const sourceImageMigrationPath = "supabase/migrations/202606170005_ai_price_candidate_source_image.sql";
const migration = existsSync(migrationPath) ? readFileSync(migrationPath, "utf8") : "";
const sourceImageMigration = existsSync(sourceImageMigrationPath) ? readFileSync(sourceImageMigrationPath, "utf8") : "";
const analyzeRoute = readFileSync("src/app/api/store-visit/analyze/route.ts", "utf8");
const storeVisitRoute = readFileSync("src/app/api/store-visit/route.ts", "utf8");
const detailH5 = readFileSync("src/components/store-visit-detail-h5.tsx", "utf8");
const typesFile = readFileSync("src/lib/types.ts", "utf8");

test("store visit batch migration creates visit codes and candidate keys", () => {
  assert.ok(existsSync(migrationPath), "batch code migration should exist");
  assert.match(migration, /add column if not exists visit_code text/i);
  assert.match(migration, /STYYYYMMDDNNNN/i);
  assert.match(migration, /create unique index if not exists .*visit_code/i);
  assert.match(migration, /generate_offline_store_visit_code/i);
  assert.match(migration, /before insert on public\.offline_store_visits/i);
  assert.match(migration, /add column if not exists candidate_key text/i);
  assert.match(migration, /create unique index if not exists .*candidate_key/i);
  assert.match(migration, /status in \('pending', 'approved'\)/i);
  assert.match(migration, /pg_notify\('pgrst', 'reload schema'\)/i);
});

test("store visit analyze route accepts visit_code as a lookup key", () => {
  assert.match(analyzeRoute, /body\.visit_code/);
  assert.match(analyzeRoute, /\.eq\("visit_code", requestedVisitCode\)/);
  assert.match(analyzeRoute, /Missing visit_id or visit_code/);
  assert.match(analyzeRoute, /visitCode/);
});

test("store visit APIs and H5 detail expose visit_code", () => {
  assert.match(storeVisitRoute, /select\("\*"\)/);
  assert.match(detailH5, /visit_code/);
  assert.match(detailH5, /batchCode/);
  assert.match(typesFile, /visit_code\?: string \| null/);
});

test("AI price candidates can reference the source visit image", () => {
  assert.ok(existsSync(sourceImageMigrationPath), "source image migration should exist");
  assert.match(sourceImageMigration, /add column if not exists source_image_id uuid/i);
  assert.match(sourceImageMigration, /references public\.offline_visit_images\(id\)/i);
  assert.match(sourceImageMigration, /add column if not exists source_image_path text/i);
});

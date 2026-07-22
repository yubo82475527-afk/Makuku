import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");

test("operator price review export is queued and exposed in the shared export menu", () => {
  const migrationPath = "supabase/migrations/202607220001_operator_price_review_export_jobs.sql";
  const jobServicePath = "src/lib/operator-price-review-export-jobs.ts";
  const jobsRoutePath = "src/app/api/operator-price-reviews/export-jobs/route.ts";
  const buttonPath = "src/components/operator-price-review-export-button.tsx";

  assert.ok(existsSync(migrationPath));
  assert.ok(existsSync(jobServicePath));
  assert.ok(existsSync(jobsRoutePath));
  assert.ok(existsSync(buttonPath));
  assert.match(read(migrationPath), /operator_price_review_export_jobs/);
  assert.match(read(jobServicePath), /buildOperatorPriceReviewExport/);
  assert.match(read(jobsRoutePath), /createOperatorPriceReviewExportJob/);
  assert.match(read(buttonPath), /\/api\/operator-price-reviews\/export-jobs/);
  assert.match(read("src/components/store-visit-monitor-export-menu.tsx"), /operator_price_review/);
});

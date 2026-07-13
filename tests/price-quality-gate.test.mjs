import { existsSync, readFileSync } from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";

const migrationPath = "supabase/migrations/202607130001_price_quality_gate_phase1.sql";
const migration = existsSync(migrationPath) ? readFileSync(migrationPath, "utf8") : "";
const types = readFileSync("src/lib/types.ts", "utf8");

test("price quality migration defines a dedicated daily L2 benchmark", () => {
  assert.equal(existsSync(migrationPath), true);
  assert.match(migration, /create table if not exists public\.price_quality_benchmark_daily/i);
  assert.match(migration, /unique\s*\(benchmark_date, matched_entity_type, matched_entity_id, channel\)/i);
  assert.match(migration, /median_price_per_piece/i);
  assert.match(migration, /sample_count/i);
  assert.match(migration, /store_count/i);
  assert.match(migration, /window_start_date/i);
  assert.match(migration, /window_end_date/i);
  assert.doesNotMatch(migration, /city_id|city_name|district/i);
});

test("candidate schema keeps evidence review separate from historical quality", () => {
  assert.match(migration, /evidence_review_decision/i);
  assert.match(migration, /quality_gate_status/i);
  assert.match(migration, /quality_gate_reason_codes/i);
  assert.match(migration, /benchmark_deviation_pct/i);
  assert.match(migration, /quality_gate_worker_id/i);
  assert.match(migration, /quality_gate_attempt_count/i);
  assert.match(types, /AiPriceQualityGateStatus/);
  assert.match(types, /PriceQualityReasonCode/);
  assert.match(types, /evidence_review_decision/);
});

test("editing a pending candidate invalidates stale quality results", () => {
  assert.match(migration, /reset_ai_price_candidate_quality_gate_on_input_change/i);
  assert.match(migration, /new\.matched_entity_id is distinct from old\.matched_entity_id/i);
  assert.match(migration, /new\.price_per_piece is distinct from old\.price_per_piece/i);
  assert.match(migration, /new\.quality_gate_status := 'PENDING'/i);
  assert.match(migration, /new\.review_decision := 'NEED_REVIEW'/i);
});

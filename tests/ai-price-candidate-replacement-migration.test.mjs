import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const migrationPath = "supabase/migrations/202607170001_ai_price_candidate_evaluation_cascade.sql";

test("candidate replacement cascades quality-gate evaluations", () => {
  assert.equal(existsSync(migrationPath), true);
  const migration = readFileSync(migrationPath, "utf8");
  assert.match(migration, /drop constraint if exists price_quality_gate_evaluations_candidate_id_fkey/i);
  assert.match(migration, /references public\.ai_price_candidates\(id\)\s+on delete cascade/i);
});

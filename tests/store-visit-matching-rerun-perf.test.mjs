import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";

const candidatesPath = "src/lib/ai-price-candidates.ts";
const jobsPath = "src/lib/price-quality-gate-jobs.ts";

function readExportedStringConst(source, name) {
  const match = source.match(new RegExp(`export const ${name}\\s*=\\s*"([^"]+)"`));
  assert.ok(match, `missing exported string const ${name}`);
  return match[1];
}

function readExportedStringArray(source, name) {
  const match = source.match(new RegExp(`export const ${name}\\s*=\\s*\\[([^\\]]+)\\]`));
  assert.ok(match, `missing exported array const ${name}`);
  return [...match[1].matchAll(/"([^"]+)"/g)].map((part) => part[1]);
}

test("product match material select lists every mapper field exactly once", () => {
  const source = readFileSync(candidatesPath, "utf8");
  const materialSelect = readExportedStringConst(source, "PRODUCT_MATCH_MATERIAL_SELECT");
  const materialFields = readExportedStringArray(source, "PRODUCT_MATCH_MATERIAL_FIELDS");
  assert.deepEqual(materialSelect.split(","), materialFields);
});

test("product match competitor select lists mapper fields plus brands join", () => {
  const source = readFileSync(candidatesPath, "utf8");
  const competitorSelect = readExportedStringConst(source, "PRODUCT_MATCH_COMPETITOR_SELECT");
  const competitorFields = readExportedStringArray(source, "PRODUCT_MATCH_COMPETITOR_FIELDS");
  assert.ok(competitorSelect.endsWith(",brands(id,name)"));
  const withoutBrands = competitorSelect.slice(0, -",brands(id,name)".length);
  assert.deepEqual(withoutBrands.split(","), competitorFields);
});

test("priority quality batch helper chunks beyond the single-call limit", () => {
  const jobs = readFileSync(jobsPath, "utf8");
  assert.match(jobs, /export const PRICE_QUALITY_GATE_BATCH_SIZE = 50/);
  assert.match(jobs, /export async function runPriorityPriceQualityGateBatched/);
  assert.match(jobs, /offset \+= PRICE_QUALITY_GATE_BATCH_SIZE/);
  assert.match(jobs, /runPriorityPriceQualityGate\(/);
});

import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const candidatesPage = readFileSync("src/app/[locale]/offline-price-candidates/page.tsx", "utf8");

test("photo price review keeps the compact filter and action header", () => {
  assert.match(candidatesPage, /SelectInput/);
  assert.match(candidatesPage, /name="status"/);
  assert.match(candidatesPage, /DateRangeFilter/);
  assert.match(candidatesPage, /aria-label=\{label\}/);
  assert.match(candidatesPage, /<Card className="mb-4">/);
  assert.match(candidatesPage, /<form className="grid gap-3/);
  assert.match(candidatesPage, /<Card>\s*<div className="mb-3 flex flex-wrap items-center justify-between gap-3">/);
  assert.match(candidatesPage, /Export CSV/);
  assert.doesNotMatch(candidatesPage, /TextInput name="date_from"/);
  assert.doesNotMatch(candidatesPage, /TextInput name="date_to"/);
});

test("photo price review uses evidence cards instead of a wide table", () => {
  assert.match(candidatesPage, /<article/);
  assert.match(candidatesPage, /AI detected/);
  assert.match(candidatesPage, /Review input/);
  assert.match(candidatesPage, /space-y-3/);
  assert.doesNotMatch(candidatesPage, /<table/);
  assert.doesNotMatch(candidatesPage, /<thead/);
  assert.doesNotMatch(candidatesPage, /min-w-\[1600px\]/);
});

test("photo price review removes dashboard-style KPI cards and status tabs", () => {
  assert.doesNotMatch(candidatesPage, /Pending Review/);
  assert.doesNotMatch(candidatesPage, /Approved Accuracy/);
  assert.doesNotMatch(candidatesPage, /mb-4 grid gap-3 md:grid-cols-3/);
  assert.doesNotMatch(candidatesPage, /statusHref/);
  assert.doesNotMatch(candidatesPage, /tabClass/);
  assert.doesNotMatch(candidatesPage, /寰呭|宸插|鍏ㄩ/);
});

test("photo price review keeps the filter card compact without a view all link", () => {
  assert.doesNotMatch(candidatesPage, /dict\.common\.viewAll/);
  assert.doesNotMatch(candidatesPage, /const clearHref/);
});

test("photo price review keeps review and export actions", () => {
  assert.match(candidatesPage, /AiPriceCandidateActions/);
  assert.match(candidatesPage, /exportHref/);
  assert.match(candidatesPage, /\/api\/ai-price-candidates\/export/);
});

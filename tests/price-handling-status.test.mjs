import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";
import { buildOperatorPriceReviewReasonLabels } from "../src/lib/operator-price-review-reasons.ts";

const modulePath = new URL("../src/lib/price-handling-status.ts", import.meta.url);
const storeVisitRoute = readFileSync("src/app/api/store-visit/[id]/route.ts", "utf8");
const storeVisitDetailH5 = readFileSync("src/components/store-visit-detail-h5.tsx", "utf8");
const storeVisitsRoute = readFileSync("src/app/api/store-visits/route.ts", "utf8");
const storeVisitsListH5 = readFileSync("src/components/store-visits-list-h5.tsx", "utf8");

async function loadPriceHandling() {
  assert.equal(existsSync(modulePath), true, "price handling resolver must exist");
  return import(modulePath.href);
}

const clearAutoApproveCandidate = {
  status: "pending",
  review_decision: "AUTO_APPROVE",
  quality_gate_status: "PASSED",
  quality_gate_attempt_count: 0,
};

test("clear auto-approved candidates remain processing until snapshot approval completes", async () => {
  const { resolveCandidatePriceHandling } = await loadPriceHandling();

  assert.deepEqual(resolveCandidatePriceHandling(clearAutoApproveCandidate), {
    status: "PROCESSING",
    action_type: null,
  });
});

test("manual-review candidates require confirmation", async () => {
  const { resolveCandidatePriceHandling } = await loadPriceHandling();

  assert.deepEqual(resolveCandidatePriceHandling({
    ...clearAutoApproveCandidate,
    review_decision: "NEED_REVIEW",
    quality_gate_status: "REVIEW_REQUIRED",
  }), {
    status: "ACTION_REQUIRED",
    action_type: "MANUAL_CONFIRMATION_REQUIRED",
  });
});

test("approved and rejected candidates are completed", async () => {
  const { resolveCandidatePriceHandling } = await loadPriceHandling();

  assert.equal(resolveCandidatePriceHandling({ ...clearAutoApproveCandidate, status: "approved" }).status, "COMPLETED");
  assert.equal(resolveCandidatePriceHandling({ ...clearAutoApproveCandidate, status: "rejected" }).status, "COMPLETED");
});

test("a Visit retains all actionable counts while returning one action-required state", async () => {
  const { summarizeVisitPriceHandling } = await loadPriceHandling();

  const summary = summarizeVisitPriceHandling({
    analysis_status: "action_required",
    active_job_status: null,
    candidates: [
      {
        ...clearAutoApproveCandidate,
        review_decision: "NEED_REVIEW",
        quality_gate_status: "REVIEW_REQUIRED",
      },
      { ...clearAutoApproveCandidate, status: "approved" },
    ],
  });

  assert.equal(summary.status, "ACTION_REQUIRED");
  assert.deepEqual(summary.action_counts, {
    retake_required: 1,
    manual_confirmation_required: 1,
    retry_required: 0,
  });
  assert.deepEqual(summary.candidate_counts, {
    processing: 0,
    action_required: 1,
    approved: 1,
    rejected: 0,
  });
});

test("a pending auto approval keeps the Visit processing", async () => {
  const { summarizeVisitPriceHandling } = await loadPriceHandling();

  assert.equal(summarizeVisitPriceHandling({
    analysis_status: "completed",
    active_job_status: null,
    candidates: [clearAutoApproveCandidate],
  }).status, "PROCESSING");
});

test("a partial image analysis requires retry", async () => {
  const { summarizeVisitPriceHandling } = await loadPriceHandling();

  const summary = summarizeVisitPriceHandling({
    analysis_status: "partial",
    active_job_status: null,
    candidates: [],
  });

  assert.equal(summary.status, "ACTION_REQUIRED");
  assert.equal(summary.action_counts.retry_required, 1);
});

test("clear auto-approved candidates have no invented manual-confirmation reason", () => {
  const messages = buildOperatorPriceReviewReasonLabels({
    ...clearAutoApproveCandidate,
    quality_gate_reason_codes: [],
    price_evidence_reason_code: null,
    price_evidence_status: "CLEAR",
    matched_entity_type: "material_master",
    matched_entity_id: "sku-1",
    match_score: 1,
    conflicts: [],
  }, "zh");

  assert.deepEqual(messages, []);
});

test("store visit detail attaches backend-owned candidate and Visit handling conclusions", () => {
  assert.match(storeVisitRoute, /resolveCandidatePriceHandling/);
  assert.match(storeVisitRoute, /summarizeVisitPriceHandling/);
  assert.match(storeVisitRoute, /price_handling:\s*summarizeVisitPriceHandling/);
  assert.match(storeVisitRoute, /price_handling:\s*resolveCandidatePriceHandling\(candidate\)/);
});

test("H5 renders backend handling status and never maps passed rows to manual confirmation", () => {
  assert.match(storeVisitDetailH5, /candidate\?\.price_handling\?\.status/);
  assert.match(storeVisitDetailH5, /candidate\?\.price_handling\?\.action_type === "MANUAL_CONFIRMATION_REQUIRED"/);
  assert.doesNotMatch(storeVisitDetailH5, /if \(candidate\.quality_gate_status === "PASSED"\) \{\s*return "needs_confirmation";/s);
});

test("H5 Visit header renders the backend price handling conclusion", () => {
  assert.match(storeVisitDetailH5, /visit\?\.price_handling\?\.status \?\? "PROCESSING"/);
  assert.match(storeVisitDetailH5, /Price handling/);
  assert.doesNotMatch(storeVisitDetailH5, /mobileAnalysisStatusLabel\(locale, status\)/);
});

test("mobile Visit list consumes backend price handling instead of deriving analysis display state", () => {
  assert.match(storeVisitsRoute, /loadPriceHandlingCandidatesForVisits/);
  assert.match(storeVisitsRoute, /const priceHandlingByVisitId = new Map/);
  assert.match(storeVisitsRoute, /priceHandlingByVisitId\.get\(visit\.id\)/);
  assert.match(storeVisitsListH5, /visit\.price_handling\?\.status/);
  assert.doesNotMatch(storeVisitsListH5, /function visitDisplayStatus/);
});

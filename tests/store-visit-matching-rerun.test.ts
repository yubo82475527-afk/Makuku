import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeMatchingRerunRequest,
  rerunStoreVisitMatching,
  type StoreVisitMatchingRerunGateway,
} from "../src/lib/store-visit-matching-rerun.ts";

test("date range selector is inclusive", () => {
  assert.deepEqual(
    normalizeMatchingRerunRequest({ date_from: "2026-07-01", date_to: "2026-07-15" }),
    { kind: "date_range", dateFrom: "2026-07-01", dateTo: "2026-07-15" },
  );
});

test("one Visit selector cannot be mixed with a date range", () => {
  assert.throws(
    () => normalizeMatchingRerunRequest({ visit_id: "v1", date_from: "2026-07-01", date_to: "2026-07-15" }),
    /exactly one rerun target/i,
  );
});

test("rerun replaces stored Visit output and triggers review without an AI dependency", async () => {
  const calls: string[] = [];
  const gateway: StoreVisitMatchingRerunGateway = {
    async selectVisits() {
      calls.push("select");
      return [{ id: "v1", visitCode: "ST1" }];
    },
    async loadMatchContext() {
      calls.push("context");
      return { id: "context" };
    },
    async loadStoredVisionRows() {
      calls.push("vision");
      return [{ sourceImageId: "i1", sourceRowIndex: 0 }];
    },
    async replaceVisitOutput() {
      calls.push("replace");
      return { insertedCount: 1, deletedSnapshotCount: 1, methodCounts: { FULL_SIGNATURE: 1 } };
    },
    async refreshVisit() {
      calls.push("refresh");
    },
    async triggerReview() {
      calls.push("review");
    },
  };

  const result = await rerunStoreVisitMatching({ visit_id: "v1" }, gateway);
  assert.deepEqual(calls, ["select", "context", "vision", "replace", "refresh", "review"]);
  assert.equal(result.processedVisitCount, 1);
  assert.equal(result.insertedCandidateCount, 1);
  assert.equal(result.deletedSnapshotCount, 1);
});

test("matching rerun reports progress after each visit without changing final result", async () => {
  const progress: Array<{ processedVisitCount: number; failedVisitCount: number }> = [];
  const gateway: StoreVisitMatchingRerunGateway = {
    async selectVisits() {
      return [
        { id: "v1", visitCode: "ST1" },
        { id: "v2", visitCode: "ST2" },
      ];
    },
    async loadMatchContext() {
      return { id: "context" };
    },
    async loadStoredVisionRows() {
      return [{ sourceImageId: "i1", sourceRowIndex: 0 }];
    },
    async replaceVisitOutput() {
      return { insertedCount: 1, deletedSnapshotCount: 1, methodCounts: { FULL_SIGNATURE: 1 } };
    },
    async refreshVisit() {},
    async triggerReview() {},
  };

  const result = await rerunStoreVisitMatching(
    { date_from: "2026-07-01", date_to: "2026-07-15" },
    gateway,
    {
      onVisitProgress(snapshot) {
        progress.push({
          processedVisitCount: snapshot.processedVisitCount,
          failedVisitCount: snapshot.failedVisitCount,
        });
      },
    },
  );

  assert.equal(result.selectedVisitCount, 2);
  assert.equal(result.processedVisitCount, 2);
  assert.deepEqual(progress.map((item) => item.processedVisitCount), [1, 2]);
});

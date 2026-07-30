export type StoreVisitMatchingRerunSelector =
  | { kind: "visit_id"; visitId: string }
  | { kind: "visit_code"; visitCode: string }
  | { kind: "date_range"; dateFrom: string; dateTo: string };

export type StoreVisitMatchingRerunRequest = {
  visit_id?: unknown;
  visit_code?: unknown;
  date_from?: unknown;
  date_to?: unknown;
};

export type StoreVisitMatchingRerunVisit = {
  id: string;
  visitCode: string | null;
};

export type StoredVisionMatchRow = {
  sourceImageId?: string;
  sourceRowIndex?: number;
  [key: string]: unknown;
};

export type StoreVisitOutputReplacement = {
  insertedCount: number;
  deletedSnapshotCount: number;
  methodCounts: Record<string, number>;
  insertedSkuCandidateIds?: string[];
};

export type StoreVisitMatchingRerunGateway = {
  selectVisits(selector: StoreVisitMatchingRerunSelector): Promise<StoreVisitMatchingRerunVisit[]>;
  loadMatchContext(): Promise<unknown>;
  loadStoredVisionRows(visit: StoreVisitMatchingRerunVisit): Promise<StoredVisionMatchRow[]>;
  replaceVisitOutput(input: {
    visit: StoreVisitMatchingRerunVisit;
    rows: StoredVisionMatchRow[];
    matchContext: unknown;
  }): Promise<StoreVisitOutputReplacement>;
  refreshVisit(visit: StoreVisitMatchingRerunVisit): Promise<void>;
  triggerReview(visitIds: string[]): Promise<void>;
};

export type StoreVisitMatchingRerunResult = {
  selectedVisitCount: number;
  processedVisitCount: number;
  skippedVisitCount: number;
  failedVisitCount: number;
  insertedCandidateCount: number;
  deletedSnapshotCount: number;
  methodCounts: Record<string, number>;
  failures: Array<{ visitId: string; visitCode: string | null; error: string }>;
  matchedVisitIds: string[];
  skippedVisitIds: string[];
  permanentlyFailedVisitIds: string[];
  insertedSkuCandidateIds: string[];
  /** Visit ids that failed during this invocation only (for attempt accounting). */
  failedVisitIdsThisRun: string[];
};

export type StoreVisitMatchingRerunProgress = StoreVisitMatchingRerunResult;

export type StoreVisitMatchingRerunOptions = {
  onVisitProgress?: (progress: StoreVisitMatchingRerunProgress) => void | Promise<void>;
  /** Visits already finished (matched / skipped / permanently failed) — excluded from this run. */
  excludeVisitIds?: string[];
  maxVisits?: number;
  concurrency?: number;
  initialProgress?: Partial<Omit<StoreVisitMatchingRerunResult, "selectedVisitCount">>;
};

export const DEFAULT_MATCH_ONLY_VISIT_CONCURRENCY = 12;

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function validDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

export function normalizeMatchingRerunRequest(input: StoreVisitMatchingRerunRequest): StoreVisitMatchingRerunSelector {
  const visitId = clean(input.visit_id);
  const visitCode = clean(input.visit_code);
  const dateFrom = clean(input.date_from);
  const dateTo = clean(input.date_to);
  const hasVisitId = Boolean(visitId);
  const hasVisitCode = Boolean(visitCode);
  const hasDateRange = Boolean(dateFrom || dateTo);
  const targetCount = Number(hasVisitId) + Number(hasVisitCode) + Number(hasDateRange);
  if (targetCount !== 1) throw new Error("Provide exactly one rerun target: visit_id, visit_code, or date range.");
  if (hasVisitId) return { kind: "visit_id", visitId };
  if (hasVisitCode) return { kind: "visit_code", visitCode };
  if (!dateFrom || !dateTo || !validDate(dateFrom) || !validDate(dateTo)) {
    throw new Error("date_from and date_to must be valid YYYY-MM-DD dates.");
  }
  if (dateFrom > dateTo) throw new Error("date_from cannot be after date_to.");
  return { kind: "date_range", dateFrom, dateTo };
}

function addMethodCounts(target: Record<string, number>, source: Record<string, number>) {
  for (const [method, count] of Object.entries(source)) target[method] = (target[method] ?? 0) + count;
}

function uniqueIds(values: string[]) {
  return Array.from(new Set(values.map((value) => clean(value)).filter(Boolean)));
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const limit = Math.max(1, Math.min(concurrency, items.length));
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function runWorker() {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: limit }, () => runWorker()));
  return results;
}

export async function rerunStoreVisitMatching(
  request: StoreVisitMatchingRerunRequest,
  gateway: StoreVisitMatchingRerunGateway,
  options: StoreVisitMatchingRerunOptions = {},
): Promise<StoreVisitMatchingRerunResult> {
  const selector = normalizeMatchingRerunRequest(request);
  const visits = await gateway.selectVisits(selector);
  if (visits.length === 0) throw new Error("No Visits found for the selected rerun target.");
  const matchContext = await gateway.loadMatchContext();
  const initialProgress = options.initialProgress ?? {};
  const result: StoreVisitMatchingRerunResult = {
    selectedVisitCount: visits.length,
    processedVisitCount: initialProgress.processedVisitCount ?? 0,
    skippedVisitCount: initialProgress.skippedVisitCount ?? 0,
    failedVisitCount: initialProgress.failedVisitCount ?? 0,
    insertedCandidateCount: initialProgress.insertedCandidateCount ?? 0,
    deletedSnapshotCount: initialProgress.deletedSnapshotCount ?? 0,
    methodCounts: { ...(initialProgress.methodCounts ?? {}) },
    failures: [...(initialProgress.failures ?? [])],
    matchedVisitIds: uniqueIds(initialProgress.matchedVisitIds ?? []),
    skippedVisitIds: uniqueIds(initialProgress.skippedVisitIds ?? []),
    permanentlyFailedVisitIds: uniqueIds(initialProgress.permanentlyFailedVisitIds ?? []),
    insertedSkuCandidateIds: [],
    failedVisitIdsThisRun: [],
  };

  const excludeVisitIds = new Set(uniqueIds([
    ...(options.excludeVisitIds ?? []),
    ...result.matchedVisitIds,
    ...result.skippedVisitIds,
    ...result.permanentlyFailedVisitIds,
  ]));
  const remainingVisits = visits.filter((visit) => !excludeVisitIds.has(visit.id));
  const maxVisits = options.maxVisits === undefined ? remainingVisits.length : Math.max(0, Math.floor(options.maxVisits));
  const visitsToProcess = remainingVisits.slice(0, maxVisits);
  const concurrency = Math.max(
    1,
    Math.floor(options.concurrency ?? DEFAULT_MATCH_ONLY_VISIT_CONCURRENCY),
  );

  type VisitOutcome =
    | { kind: "skipped"; visitId: string }
    | {
      kind: "matched";
      visitId: string;
      insertedCount: number;
      deletedSnapshotCount: number;
      methodCounts: Record<string, number>;
      insertedSkuCandidateIds: string[];
    }
    | { kind: "failed"; visitId: string; visitCode: string | null; error: string };

  const batchMatchedIds: string[] = [];
  let progressLock: Promise<void> = Promise.resolve();
  const withProgressLock = async (fn: () => Promise<void>) => {
    const run = progressLock.then(fn, fn);
    progressLock = run.then(() => undefined, () => undefined);
    await run;
  };

  await mapWithConcurrency(visitsToProcess, concurrency, async (visit): Promise<VisitOutcome> => {
    let outcome: VisitOutcome;
    try {
      const rows = await gateway.loadStoredVisionRows(visit);
      if (rows.length === 0) {
        outcome = { kind: "skipped", visitId: visit.id };
      } else {
        const replacement = await gateway.replaceVisitOutput({ visit, rows, matchContext });
        await gateway.refreshVisit(visit);
        outcome = {
          kind: "matched",
          visitId: visit.id,
          insertedCount: replacement.insertedCount,
          deletedSnapshotCount: replacement.deletedSnapshotCount,
          methodCounts: replacement.methodCounts,
          insertedSkuCandidateIds: replacement.insertedSkuCandidateIds ?? [],
        };
      }
    } catch (error) {
      outcome = {
        kind: "failed",
        visitId: visit.id,
        visitCode: visit.visitCode,
        error: error instanceof Error ? error.message : String(error),
      };
    }

    await withProgressLock(async () => {
      if (outcome.kind === "skipped") {
        result.skippedVisitCount += 1;
        result.skippedVisitIds = uniqueIds([...result.skippedVisitIds, outcome.visitId]);
      } else if (outcome.kind === "matched") {
        result.processedVisitCount += 1;
        result.insertedCandidateCount += outcome.insertedCount;
        result.deletedSnapshotCount += outcome.deletedSnapshotCount;
        addMethodCounts(result.methodCounts, outcome.methodCounts);
        result.matchedVisitIds = uniqueIds([...result.matchedVisitIds, outcome.visitId]);
        result.insertedSkuCandidateIds.push(...outcome.insertedSkuCandidateIds);
        batchMatchedIds.push(outcome.visitId);
        result.failures = result.failures.filter((failure) => failure.visitId !== outcome.visitId);
        result.failedVisitCount = result.failures.length;
      } else {
        result.failures = [
          ...result.failures.filter((failure) => failure.visitId !== outcome.visitId),
          {
            visitId: outcome.visitId,
            visitCode: outcome.visitCode,
            error: outcome.error,
          },
        ];
        result.failedVisitCount = result.failures.length;
        result.failedVisitIdsThisRun = uniqueIds([...result.failedVisitIdsThisRun, outcome.visitId]);
      }
      await options.onVisitProgress?.({
        ...result,
        insertedSkuCandidateIds: [...result.insertedSkuCandidateIds],
      });
    });

    return outcome;
  });

  if (batchMatchedIds.length > 0) await gateway.triggerReview(batchMatchedIds);
  result.insertedSkuCandidateIds = uniqueIds(result.insertedSkuCandidateIds);
  return result;
}

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
};

export type StoreVisitMatchingRerunProgress = StoreVisitMatchingRerunResult;

export type StoreVisitMatchingRerunOptions = {
  onVisitProgress?: (progress: StoreVisitMatchingRerunProgress) => void | Promise<void>;
  startOffset?: number;
  maxVisits?: number;
  initialProgress?: Partial<Omit<StoreVisitMatchingRerunResult, "selectedVisitCount">>;
};

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
  };
  const processedVisitIds: string[] = [];
  const startOffset = Math.max(0, Math.min(Math.floor(options.startOffset ?? 0), visits.length));
  const maxVisits = options.maxVisits === undefined ? visits.length : Math.max(0, Math.floor(options.maxVisits));
  const visitsToProcess = visits.slice(startOffset, startOffset + maxVisits);

  for (const visit of visitsToProcess) {
    try {
      const rows = await gateway.loadStoredVisionRows(visit);
      if (rows.length === 0) {
        result.skippedVisitCount += 1;
        await options.onVisitProgress?.({ ...result });
        continue;
      }
      const replacement = await gateway.replaceVisitOutput({ visit, rows, matchContext });
      await gateway.refreshVisit(visit);
      result.processedVisitCount += 1;
      result.insertedCandidateCount += replacement.insertedCount;
      result.deletedSnapshotCount += replacement.deletedSnapshotCount;
      addMethodCounts(result.methodCounts, replacement.methodCounts);
      processedVisitIds.push(visit.id);
      await options.onVisitProgress?.({ ...result });
    } catch (error) {
      result.failedVisitCount += 1;
      result.failures.push({
        visitId: visit.id,
        visitCode: visit.visitCode,
        error: error instanceof Error ? error.message : String(error),
      });
      await options.onVisitProgress?.({ ...result });
    }
  }

  if (processedVisitIds.length > 0) await gateway.triggerReview(processedVisitIds);
  return result;
}

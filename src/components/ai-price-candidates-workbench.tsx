"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { MouseEvent, ReactNode } from "react";
import { Badge, Button, EmptyState } from "@/components/ui";
import { formatIdr, formatJakartaTime } from "@/lib/format";
import type { AiPriceCandidate, AiPriceCandidateMatchType, AiPriceReviewJob, AiPriceReviewJobItem, AiPriceReviewRule, CompetitorProduct, MaterialMaster } from "@/lib/types";

type WorkbenchFilters = {
  status?: "pending" | "approved" | "rejected";
  date_from?: string;
  date_to?: string;
};

type StatusTabValue = "pending" | "approved" | "rejected" | "all";
type RejectDialogState = { mode: "bulk" } | { mode: "single"; candidateId: string } | null;
type MatchDialogState = { candidate: AiPriceCandidate } | null;
type ReviewInput = { price: string; pieces: string };
type ReviewOverride = { price_idr: number; piece_count: number };
type WorkbenchCopy = ReturnType<typeof getWorkbenchCopy>;

function stopReviewRowClick(event: MouseEvent) {
  event.stopPropagation();
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function AiPriceCandidatesWorkbench({
  items,
  total,
  page,
  perPage,
  locale,
  filters,
  rule,
}: {
  items: AiPriceCandidate[];
  total: number;
  page: number;
  perPage: number;
  locale: string;
  filters: WorkbenchFilters;
  rule: AiPriceReviewRule;
}) {
  const router = useRouter();
  const copy = getWorkbenchCopy(locale);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [activeCandidate, setActiveCandidate] = useState<AiPriceCandidate | null>(null);
  const [activeJob, setActiveJob] = useState<AiPriceReviewJob | null>(null);
  const [jobItems, setJobItems] = useState<AiPriceReviewJobItem[]>([]);
  const [ruleModalOpen, setRuleModalOpen] = useState(false);
  const [rejectDialog, setRejectDialog] = useState<RejectDialogState>(null);
  const [matchDialog, setMatchDialog] = useState<MatchDialogState>(null);
  const [reviewInputs, setReviewInputs] = useState<Record<string, ReviewInput>>({});
  const [savedReviewInputs, setSavedReviewInputs] = useState<Record<string, ReviewInput>>({});
  const [savingReviewInputId, setSavingReviewInputId] = useState<string | null>(null);

  const pendingItems = items.filter((item) => item.status === "pending");
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const pageCount = Math.max(1, Math.ceil(total / perPage));
  const allPendingSelected = pendingItems.length > 0 && pendingItems.every((item) => selectedSet.has(item.id));
  const selectedCount = selectedIds.length;
  const showBulkToolbar = selectedCount > 0 && filters.status === "pending";

  function openCandidateDrawer(candidate: AiPriceCandidate) {
    setActiveCandidate(candidate);
  }

  function toggleCandidate(id: string) {
    setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  function togglePage() {
    if (allPendingSelected) {
      setSelectedIds((current) => current.filter((id) => !pendingItems.some((item) => item.id === id)));
      return;
    }
    setSelectedIds((current) => Array.from(new Set([...current, ...pendingItems.map((item) => item.id)])));
  }

  function updateReviewInput(candidate: AiPriceCandidate, field: keyof ReviewInput, value: string) {
    setReviewInputs((current) => ({
      ...current,
      [candidate.id]: {
        ...(current[candidate.id] ?? defaultReviewInput(candidate)),
        [field]: value,
      },
    }));
  }

  async function maybeSaveReviewInput(candidate: AiPriceCandidate) {
    if (candidate.status !== "pending") return;
    const savedInput = savedReviewInputs[candidate.id] ?? defaultReviewInput(candidate);
    const input = reviewInputs[candidate.id] ?? savedInput;
    if (input.price === savedInput.price && input.pieces === savedInput.pieces) return;

    const price = Number(input.price);
    const pieces = Number(input.pieces);
    if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(pieces) || pieces <= 0) {
      window.alert(copy.invalidReviewInput);
      setReviewInputs((current) => ({ ...current, [candidate.id]: savedInput }));
      return;
    }

    if (!window.confirm(copy.confirmSaveReviewInput)) {
      setReviewInputs((current) => ({ ...current, [candidate.id]: savedInput }));
      return;
    }

    setSavingReviewInputId(candidate.id);
    try {
      const response = await fetch(`/api/ai-price-candidates/${candidate.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save_review_input",
          price_idr: Math.round(price),
          piece_count: Math.floor(pieces),
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? copy.saveReviewInputFailed);
      const saved = {
        price: String(Math.round(price)),
        pieces: String(Math.floor(pieces)),
      };
      setSavedReviewInputs((current) => ({ ...current, [candidate.id]: saved }));
      setReviewInputs((current) => ({ ...current, [candidate.id]: saved }));
      router.refresh();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : copy.saveReviewInputFailed);
      setReviewInputs((current) => ({ ...current, [candidate.id]: savedInput }));
    } finally {
      setSavingReviewInputId(null);
    }
  }

  function reviewOverridesForSelected() {
    const overrides: Record<string, ReviewOverride> = {};
    for (const candidate of items) {
      if (!selectedSet.has(candidate.id) || candidate.status !== "pending") continue;
      const input = reviewInputs[candidate.id] ?? defaultReviewInput(candidate);
      const price = Number(input.price);
      const pieces = Number(input.pieces);
      if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(pieces) || pieces <= 0) {
        throw new Error(copy.invalidReviewInput);
      }
      overrides[candidate.id] = {
        price_idr: Math.round(price),
        piece_count: Math.floor(pieces),
      };
    }
    return overrides;
  }

  async function refreshJob(jobId: string) {
    const response = await fetch(`/api/ai-price-candidates/bulk-review/${jobId}`);
    const payload = await response.json().catch(() => ({}));
    if (payload.job) setActiveJob(payload.job);
    if (Array.isArray(payload.items)) setJobItems(payload.items);
    return payload.job as AiPriceReviewJob | undefined;
  }

  async function runJob(jobId: string) {
    let nextJob = await refreshJob(jobId);
    while (nextJob && nextJob.status !== "completed" && nextJob.status !== "failed") {
      const response = await fetch(`/api/ai-price-candidates/bulk-review/${jobId}/run`, { method: "POST" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? copy.batchReviewFailed);
      nextJob = payload.job;
      if (nextJob) setActiveJob(nextJob);
      await refreshJob(jobId);
      if (nextJob && nextJob.status !== "completed" && nextJob.status !== "failed") {
        await sleep(180);
      }
    }
    setSelectedIds([]);
    router.refresh();
  }

  async function createJob(action: "approve" | "reject", options: { rejectionReason?: string; onJobCreated?: () => void }) {
    const reviewOverrides = action === "approve" ? reviewOverridesForSelected() : undefined;
    const response = await fetch("/api/ai-price-candidates/bulk-review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        ids: selectedIds,
        filters,
        rejection_reason: options.rejectionReason,
        manual_override: true,
        review_overrides: reviewOverrides,
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error ?? copy.createBatchFailed);
    setActiveJob(payload.job);
    await refreshJob(payload.job.id);
    options.onJobCreated?.();
    await runJob(payload.job.id);
  }

  async function approveSelected() {
    await createJob("approve", {});
  }

  async function rejectSelected(reason: string, onJobCreated?: () => void) {
    await createJob("reject", { rejectionReason: reason, onJobCreated });
  }

  async function rejectSingle(candidateId: string, reason: string) {
    const response = await fetch(`/api/ai-price-candidates/${candidateId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reject", reason }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error ?? copy.reviewActionFailed);
    setActiveCandidate(null);
    router.refresh();
  }

  async function submitReject(reason: string) {
    const dialog = rejectDialog;
    if (!dialog) return;

    if (dialog.mode === "bulk") {
      let dialogClosed = false;
      try {
        await rejectSelected(reason, () => {
          dialogClosed = true;
          setRejectDialog(null);
        });
      } catch (error) {
        if (!dialogClosed) throw error;
        window.alert(error instanceof Error ? error.message : copy.reviewActionFailed);
      }
      return;
    }

    await rejectSingle(dialog.candidateId, reason);
    setRejectDialog(null);
  }

  const from = total === 0 ? 0 : (page - 1) * perPage + 1;
  const to = Math.min(total, page * perPage);
  const showApprovedAudit = filters.status === "approved" || !filters.status;
  const showRejectedAudit = filters.status === "rejected" || !filters.status;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <StatusTabs locale={locale} filters={filters} copy={copy} />
        <Button type="button" onClick={() => setRuleModalOpen(true)} className="!bg-white !text-slate-700 ring-1 ring-slate-300 hover:!bg-slate-50">
          {copy.ruleSettings}
        </Button>
      </div>

      {showBulkToolbar ? (
        <BulkReviewToolbar
          copy={copy}
          selectedCount={selectedCount}
          activeJob={activeJob}
          jobItems={jobItems}
          onApproveSelected={approveSelected}
          onRejectSelected={() => setRejectDialog({ mode: "bulk" })}
        />
      ) : null}

      {items.length === 0 ? <EmptyState text={copy.emptyState} /> : null}
      {items.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full min-w-[1320px] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="w-10 px-3 py-2">
                  {filters.status === "pending" ? <input type="checkbox" checked={allPendingSelected} onChange={togglePage} aria-label={copy.selectCurrentPage} /> : null}
                </th>
                <th className="px-3 py-2">{copy.table.store}</th>
                <th className="px-3 py-2">{copy.table.date}</th>
                <th className="px-3 py-2">{copy.table.brand}</th>
                <th className="px-3 py-2">{copy.table.product}</th>
                <th className="px-3 py-2">{copy.table.aiPackage}</th>
                <th className="px-3 py-2">{copy.table.pcs}</th>
                <th className="px-3 py-2">{copy.table.perPiece}</th>
                <th className="px-3 py-2">AI</th>
                <th className="px-3 py-2">{copy.table.match}</th>
                <th className="px-3 py-2">{copy.table.warnings}</th>
                <th className="px-3 py-2">{copy.table.evidence}</th>
                {showApprovedAudit ? <th className="px-3 py-2">{copy.approvedAt}</th> : null}
                {showApprovedAudit ? <th className="px-3 py-2">{copy.reviewMethod}</th> : null}
                {showRejectedAudit ? <th className="px-3 py-2">{copy.rejectedAt}</th> : null}
                {showRejectedAudit ? <th className="px-3 py-2">{copy.rejectionReason}</th> : null}
                <th className="px-3 py-2">{copy.table.status}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {items.map((candidate) => {
                const visit = candidate.offline_store_visits;
                const isEditable = filters.status === "pending" && candidate.status === "pending";
                const reviewInput = reviewInputs[candidate.id] ?? defaultReviewInput(candidate);
                const reviewedPricePerPiece = isEditable
                  ? calculateReviewedPricePerPiece(reviewInput.price, reviewInput.pieces)
                  : candidate.reviewed_price_per_piece ?? candidate.price_per_piece;
                const warningMessages = warningMessagesForCandidate(candidate);
                return (
                  <tr
                    key={candidate.id}
                    onClick={() => openCandidateDrawer(candidate)}
                    className="cursor-pointer hover:bg-slate-50"
                  >
                    <td className="px-3 py-3" onClick={stopReviewRowClick}>
                      {filters.status === "pending" ? (
                        <input
                          type="checkbox"
                          checked={selectedSet.has(candidate.id)}
                          disabled={candidate.status !== "pending"}
                          onChange={() => toggleCandidate(candidate.id)}
                          aria-label={`${copy.selectCandidate} ${candidate.raw_brand} ${candidate.raw_product}`}
                        />
                      ) : null}
                    </td>
                    <td className="px-3 py-3">
                      <button type="button" className="text-left font-medium text-slate-900 hover:underline" onClick={() => openCandidateDrawer(candidate)}>
                        {visit?.store_name ?? "-"}
                      </button>
                    </td>
                    <td className="px-3 py-3 text-slate-600">{visit?.visit_date ?? shortTime(candidate.created_at)}</td>
                    <td className="px-3 py-3 font-medium text-slate-900">{candidate.raw_brand || "-"}</td>
                    <td className="max-w-xs px-3 py-3 text-slate-700">{candidate.raw_product || "-"}</td>
                    <td className="px-3 py-3" onClick={stopReviewRowClick}>
                      {isEditable ? (
                        <input
                          name="parsed_price_idr"
                          type="number"
                          min="0"
                          step="1"
                          value={reviewInput.price}
                          onChange={(event) => updateReviewInput(candidate, "price", event.target.value)}
                          onBlur={() => maybeSaveReviewInput(candidate)}
                          disabled={savingReviewInputId === candidate.id}
                          aria-label={`${copy.packagePrice} ${candidate.raw_brand} ${candidate.raw_product}`}
                          className="h-8 w-28 rounded-md border border-slate-300 px-2 text-sm outline-none focus:border-slate-500"
                        />
                      ) : candidate.parsed_price_idr ? formatIdr(candidate.parsed_price_idr) : "-"}
                    </td>
                    <td className="px-3 py-3" onClick={stopReviewRowClick}>
                      {isEditable ? (
                        <input
                          name="piece_count"
                          type="number"
                          min="1"
                          step="1"
                          value={reviewInput.pieces}
                          onChange={(event) => updateReviewInput(candidate, "pieces", event.target.value)}
                          onBlur={() => maybeSaveReviewInput(candidate)}
                          disabled={savingReviewInputId === candidate.id}
                          aria-label={`${copy.table.pcs} ${candidate.raw_brand} ${candidate.raw_product}`}
                          className="h-8 w-20 rounded-md border border-slate-300 px-2 text-sm outline-none focus:border-slate-500"
                        />
                      ) : candidate.reviewed_piece_count ?? candidate.piece_count ?? "-"}
                    </td>
                    <td className="px-3 py-3 font-medium">{reviewedPricePerPiece ? formatIdr(reviewedPricePerPiece) : "-"}</td>
                    <td className="px-3 py-3">{Math.round(candidate.ai_confidence * 100)}%</td>
                    <td className="min-w-52 px-3 py-3" onClick={stopReviewRowClick}>
                      <MatchedSkuCell
                        candidate={candidate}
                        copy={copy}
                        onEdit={() => setMatchDialog({ candidate })}
                      />
                    </td>
                    <td className="px-3 py-3" onClick={stopReviewRowClick}>
                      {warningMessages.length ? (
                        <button
                          type="button"
                          title={warningMessages.join("\n")}
                          aria-label={copy.riskIndicatorLabel(warningMessages.length)}
                          onClick={() => openCandidateDrawer(candidate)}
                          className="inline-flex h-7 items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2 text-xs font-semibold text-red-700 hover:bg-red-100"
                        >
                          <span aria-hidden="true">!</span>
                          <span>{warningMessages.length}</span>
                        </button>
                      ) : "-"}
                    </td>
                    <td className="px-3 py-3" onClick={stopReviewRowClick}>
                      <button
                        type="button"
                        onClick={() => openCandidateDrawer(candidate)}
                        className="inline-flex h-8 items-center rounded-md border border-slate-300 bg-white px-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        {copy.viewEvidence}
                      </button>
                    </td>
                    {showApprovedAudit ? <td className="px-3 py-3 text-slate-600">{candidate.reviewed_at ? formatJakartaTime(candidate.reviewed_at) : "-"}</td> : null}
                    {showApprovedAudit ? <td className="px-3 py-3 text-slate-600">{reviewMethodLabel(candidate, copy)}</td> : null}
                    {showRejectedAudit ? <td className="px-3 py-3 text-slate-600">{candidate.reviewed_at ? formatJakartaTime(candidate.reviewed_at) : "-"}</td> : null}
                    {showRejectedAudit ? <td className="max-w-xs px-3 py-3 text-slate-600">{candidate.rejection_reason ?? "-"}</td> : null}
                    <td className="px-3 py-3"><Badge>{copy.status[candidate.status] ?? candidate.status}</Badge></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
        <div>{from}-{to} / {total}</div>
        <div className="flex gap-2">
          <PageLink locale={locale} page={Math.max(1, page - 1)} perPage={perPage} filters={filters} disabled={page <= 1}>{copy.previous}</PageLink>
          <span className="inline-flex h-9 items-center px-2">{copy.pageLabel} {page} / {pageCount}</span>
          <PageLink locale={locale} page={Math.min(pageCount, page + 1)} perPage={perPage} filters={filters} disabled={page >= pageCount}>{copy.next}</PageLink>
        </div>
      </div>

      <ReviewRuleModal open={ruleModalOpen} initialRule={rule} copy={copy} onClose={() => setRuleModalOpen(false)} />
      <MatchEditorDialog
        key={matchDialog ? `match-${matchDialog.candidate.id}` : "match-closed"}
        state={matchDialog}
        copy={copy}
        onClose={() => setMatchDialog(null)}
        onUpdated={() => {
          setMatchDialog(null);
          router.refresh();
        }}
      />
      <RejectReasonDialog
        key={rejectDialog ? `reject-${rejectDialog.mode}-${"candidateId" in rejectDialog ? rejectDialog.candidateId : "bulk"}` : "reject-closed"}
        open={Boolean(rejectDialog)}
        copy={copy}
        onClose={() => setRejectDialog(null)}
        onSubmit={submitReject}
      />
      <CandidateDetailDrawer
        candidate={activeCandidate}
        locale={locale}
        copy={copy}
        onClose={() => setActiveCandidate(null)}
        onReject={(candidateId) => setRejectDialog({ mode: "single", candidateId })}
        onEditMatch={(candidate) => setMatchDialog({ candidate })}
        onUpdated={() => {
          setActiveCandidate(null);
          router.refresh();
        }}
      />
    </div>
  );
}

function StatusTabs({ locale, filters, copy }: { locale: string; filters: WorkbenchFilters; copy: WorkbenchCopy }) {
  const statusTabs: Array<{ value: StatusTabValue; label: string }> = [
    { value: "pending", label: copy.status.pending },
    { value: "approved", label: copy.status.approved },
    { value: "rejected", label: copy.status.rejected },
    { value: "all", label: copy.status.all },
  ];
  const active = filters.status ?? "all";
  return (
    <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1">
      {statusTabs.map((tab) => {
        const selected = active === tab.value;
        return (
          <Link
            key={tab.value}
            href={statusTabHref(locale, filters, tab.value)}
            className={selected
              ? "inline-flex h-8 items-center rounded-md bg-white px-3 text-sm font-semibold text-slate-950 shadow-sm"
              : "inline-flex h-8 items-center rounded-md px-3 text-sm font-medium text-slate-600 hover:bg-white"}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}

function BulkReviewToolbar({
  copy,
  selectedCount,
  activeJob,
  jobItems,
  onApproveSelected,
  onRejectSelected,
}: {
  copy: WorkbenchCopy;
  selectedCount: number;
  activeJob: AiPriceReviewJob | null;
  jobItems: AiPriceReviewJobItem[];
  onApproveSelected: () => Promise<void>;
  onRejectSelected: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : copy.batchReviewFailed);
    } finally {
      setBusy(false);
    }
  }

  const done = activeJob ? activeJob.success_count + activeJob.skipped_count + activeJob.failed_count : 0;
  const progress = activeJob && activeJob.total_count > 0 ? Math.round(done / activeJob.total_count * 100) : 0;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="mr-auto text-sm text-slate-600">{copy.selectedCount(selectedCount)}</div>
        <Button type="button" disabled={busy || selectedCount === 0} onClick={() => submit(onApproveSelected)}>{copy.approveSelected}</Button>
        <Button type="button" disabled={busy || selectedCount === 0} onClick={onRejectSelected} className="bg-rose-700 hover:bg-rose-600">{copy.rejectSelected}</Button>
      </div>
      {activeJob ? (
        <div className="mt-3 rounded-md bg-slate-50 p-3 text-sm text-slate-600">
          <div className="flex items-center justify-between gap-3">
            <span>{copy.batchJob} {copy.status[activeJob.status] ?? activeJob.status}: {done}/{activeJob.total_count}</span>
            <span>{progress}%</span>
          </div>
          <div className="mt-2 h-2 rounded-full bg-slate-200">
            <div className="h-2 rounded-full bg-slate-900" style={{ width: `${progress}%` }} />
          </div>
          {jobItems.some((item) => item.status === "failed" || item.status === "skipped") ? (
            <div className="mt-2 max-h-20 overflow-auto text-xs text-slate-500">
              {jobItems.filter((item) => item.status === "failed" || item.status === "skipped").slice(0, 10).map((item) => (
                <div key={item.id}>{copy.status[item.status] ?? item.status}: {item.error_message ?? item.candidate_id}</div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
      {error ? <div className="mt-2 text-sm text-red-600">{error}</div> : null}
    </div>
  );
}

function ReviewRuleModal({
  open,
  initialRule,
  copy,
  onClose,
}: {
  open: boolean;
  initialRule: AiPriceReviewRule;
  copy: WorkbenchCopy;
  onClose: () => void;
}) {
  const [rule, setRule] = useState(initialRule);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (!open) return null;

  async function save() {
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch("/api/ai-price-review-rules", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(rule),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? copy.saveRuleFailed);
      setRule(payload.rule);
      setMessage(copy.ruleSaved);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : copy.saveRuleFailed);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 p-4">
      <div className="w-full max-w-2xl rounded-lg bg-white p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-slate-950">{copy.reviewRule}</h3>
            <p className="mt-1 text-sm text-slate-500">AI ≥ {Math.round(rule.min_ai_confidence * 100)}%, {copy.matchScore} ≥ {Math.round(rule.min_match_score * 100)}%</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-md border border-slate-300 px-3 py-1 text-sm">{copy.close}</button>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <label className="text-xs font-medium text-slate-500">
            {copy.aiConfidence}
            <input type="number" min="0" max="1" step="0.01" value={rule.min_ai_confidence} onChange={(event) => setRule({ ...rule, min_ai_confidence: Number(event.target.value) })} className="mt-1 h-9 w-full rounded-md border border-slate-300 px-2 text-sm" />
          </label>
          <label className="text-xs font-medium text-slate-500">
            {copy.matchScore}
            <input type="number" min="0" max="1" step="0.01" value={rule.min_match_score} onChange={(event) => setRule({ ...rule, min_match_score: Number(event.target.value) })} className="mt-1 h-9 w-full rounded-md border border-slate-300 px-2 text-sm" />
          </label>
          <RuleCheckbox label={copy.requireMatch} checked={rule.require_matched_entity} onChange={(checked) => setRule({ ...rule, require_matched_entity: checked })} />
          <RuleCheckbox label={copy.noWarnings} checked={rule.require_no_warnings} onChange={(checked) => setRule({ ...rule, require_no_warnings: checked })} />
          <RuleCheckbox label={copy.priceAndPcs} checked={rule.require_price_and_piece} onChange={(checked) => setRule({ ...rule, require_price_and_piece: checked })} />
        </div>
        <div className="mt-5 flex items-center gap-2">
          <Button type="button" disabled={saving} onClick={save}>{copy.saveRule}</Button>
          {message ? <span className="text-sm text-slate-500">{message}</span> : null}
        </div>
      </div>
    </div>
  );
}

function RejectReasonDialog({
  open,
  copy,
  onClose,
  onSubmit,
}: {
  open: boolean;
  copy: WorkbenchCopy;
  onClose: () => void;
  onSubmit: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await onSubmit(reason);
    } catch (err) {
      setError(err instanceof Error ? err.message : copy.reviewActionFailed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 p-4">
      <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-lg font-semibold text-slate-950">{copy.rejectReason}</h3>
          <button type="button" onClick={onClose} className="rounded-md border border-slate-300 px-3 py-1 text-sm">{copy.close}</button>
        </div>
        <textarea
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder={copy.rejectReason}
          className="mt-4 min-h-24 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
        />
        <div className="mt-4 flex items-center gap-2">
          <Button type="button" disabled={busy || !reason.trim()} onClick={submit} className="bg-rose-700 hover:bg-rose-600">{copy.reject}</Button>
          <button type="button" onClick={onClose} className="inline-flex h-9 items-center rounded-md border border-slate-300 px-3 text-sm text-slate-700">{copy.cancel}</button>
        </div>
        {error ? <div className="mt-2 text-sm text-red-600">{error}</div> : null}
      </div>
    </div>
  );
}

function MatchedSkuCell({
  candidate,
  copy,
  onEdit,
}: {
  candidate: AiPriceCandidate;
  copy: WorkbenchCopy;
  onEdit: () => void;
}) {
  const label = matchedSkuLabel(candidate, copy);
  return (
    <div className="space-y-1">
      <div className="font-medium text-slate-900">{Math.round(candidate.match_score * 100)}%</div>
      <div className="max-w-52 truncate text-xs text-slate-500" title={label}>{label}</div>
      {candidate.status === "pending" ? (
        <button type="button" onClick={onEdit} className="text-xs font-medium text-blue-700 hover:underline">
          {copy.editMatch}
        </button>
      ) : null}
    </div>
  );
}

function MatchEditorDialog({
  state,
  copy,
  onClose,
  onUpdated,
}: {
  state: MatchDialogState;
  copy: WorkbenchCopy;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const candidate = state?.candidate ?? null;
  const [matchType, setMatchType] = useState<AiPriceCandidateMatchType>(candidate?.matched_entity_type ?? "unmatched");
  const [selectedId, setSelectedId] = useState(candidate?.matched_entity_id ?? "");
  const [query, setQuery] = useState("");
  const [materials, setMaterials] = useState<MaterialMaster[]>([]);
  const [products, setProducts] = useState<CompetitorProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!candidate) return;
    let active = true;
    async function loadOptions() {
      setLoading(true);
      try {
        const [materialsRes, productsRes] = await Promise.all([
          fetch("/api/material-master/export"),
          fetch("/api/competitors"),
        ]);
        const [materialsPayload, productsPayload] = await Promise.all([
          materialsRes.json().catch(() => ({})),
          productsRes.json().catch(() => ({})),
        ]);
        if (!active) return;
        setMaterials((materialsPayload.items ?? materialsPayload.materials ?? []) as MaterialMaster[]);
        setProducts((productsPayload.products ?? productsPayload.items ?? []) as CompetitorProduct[]);
      } catch {
        if (active) setError(copy.loadMatchOptionsFailed);
      } finally {
        if (active) setLoading(false);
      }
    }
    void loadOptions();
    return () => {
      active = false;
    };
  }, [candidate, copy.loadMatchOptionsFailed]);

  if (!candidate) return null;
  const currentCandidate = candidate;

  const materialOptions = filterMaterials(materials, query).slice(0, 30);
  const productOptions = filterCompetitorProducts(products, query).slice(0, 30);
  const selectedLabel = matchType === "material_master"
    ? formatMaterialMatchLabel(materials.find((item) => item.tenant_sku_code === selectedId)) || query
    : matchType === "competitor_product"
      ? formatCompetitorMatchLabel(products.find((item) => item.id === selectedId)) || query
      : "";

  async function save() {
    if (matchType !== "unmatched" && !selectedId) {
      setError(copy.selectMatchFirst);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/ai-price-candidates/${currentCandidate.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_match",
          matched_entity_type: matchType,
          matched_entity_id: matchType === "unmatched" ? null : selectedId,
          matched_label: matchType === "unmatched" ? null : selectedLabel,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? copy.saveMatchFailed);
      onUpdated();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : copy.saveMatchFailed);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center bg-slate-900/30 p-4">
      <div className="w-full max-w-2xl rounded-lg bg-white p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-slate-950">{copy.editMatch}</h3>
            <p className="mt-1 text-sm text-slate-500">{currentCandidate.raw_brand} · {currentCandidate.raw_product}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-md border border-slate-300 px-3 py-1 text-sm">{copy.close}</button>
        </div>

        <div className="mt-4 inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1">
          {(["material_master", "competitor_product", "unmatched"] as const).map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => {
                setMatchType(type);
                setSelectedId("");
                setQuery("");
              }}
              className={matchType === type
                ? "h-8 rounded-md bg-white px-3 text-sm font-semibold text-slate-950 shadow-sm"
                : "h-8 rounded-md px-3 text-sm font-medium text-slate-600"}
            >
              {copy.matchTypes[type]}
            </button>
          ))}
        </div>

        {matchType !== "unmatched" ? (
          <label className="mt-4 block text-sm font-medium text-slate-700">
            {copy.searchMatch}
            <input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setSelectedId("");
              }}
              placeholder={matchType === "material_master" ? copy.searchMakukuSku : copy.searchCompetitorSku}
              className="mt-1 h-9 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-slate-500"
            />
          </label>
        ) : (
          <div className="mt-4 rounded-md bg-slate-50 p-3 text-sm text-slate-600">{copy.unmatchedHint}</div>
        )}

        {loading ? <div className="mt-3 text-sm text-slate-500">{copy.loadingMatchOptions}</div> : null}
        {matchType === "material_master" ? (
          <OptionList>
            {materialOptions.map((material) => (
              <MatchOptionButton
                key={material.tenant_sku_code}
                selected={selectedId === material.tenant_sku_code}
                title={formatMaterialMatchLabel(material)}
                subtitle={[material.sub_brand, material.sub_category, material.sub_type, material.pack_count ? `${material.pack_count} pcs` : null].filter(Boolean).join(" / ")}
                onClick={() => {
                  setSelectedId(material.tenant_sku_code);
                  setQuery(formatMaterialMatchLabel(material));
                }}
              />
            ))}
          </OptionList>
        ) : null}
        {matchType === "competitor_product" ? (
          <OptionList>
            {productOptions.map((product) => (
              <MatchOptionButton
                key={product.id}
                selected={selectedId === product.id}
                title={formatCompetitorMatchLabel(product)}
                subtitle={[product.pack_type, product.size, product.piece_count ? `${product.piece_count} pcs` : null].filter(Boolean).join(" / ")}
                onClick={() => {
                  setSelectedId(product.id);
                  setQuery(formatCompetitorMatchLabel(product));
                }}
              />
            ))}
          </OptionList>
        ) : null}

        {error ? <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={saving} className="inline-flex h-9 items-center rounded-md border border-slate-300 px-3 text-sm text-slate-700">{copy.cancel}</button>
          <Button type="button" disabled={saving} onClick={save}>{copy.saveMatch}</Button>
        </div>
      </div>
    </div>
  );
}

function OptionList({ children }: { children: ReactNode }) {
  return <div className="mt-3 max-h-72 overflow-y-auto rounded-md border border-slate-200 p-1">{children}</div>;
}

function MatchOptionButton({ title, subtitle, selected, onClick }: { title: string; subtitle: string; selected: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={`block w-full rounded-md px-3 py-2 text-left text-sm hover:bg-slate-50 ${selected ? "bg-slate-100" : ""}`}>
      <span className="block font-medium text-slate-900">{title}</span>
      {subtitle ? <span className="mt-0.5 block text-xs text-slate-500">{subtitle}</span> : null}
    </button>
  );
}

function RuleCheckbox({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm text-slate-700">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      {label}
    </label>
  );
}

function CandidateDetailDrawer({
  candidate,
  locale,
  copy,
  onClose,
  onReject,
  onUpdated,
  onEditMatch,
}: {
  candidate: AiPriceCandidate | null;
  locale: string;
  copy: WorkbenchCopy;
  onClose: () => void;
  onReject: (candidateId: string) => void;
  onUpdated: () => void;
  onEditMatch: (candidate: AiPriceCandidate) => void;
}) {
  if (!candidate) return null;
  return (
    <CandidateDetailDrawerContent
      key={candidate.id}
      candidate={candidate}
      locale={locale}
      copy={copy}
      onClose={onClose}
      onReject={onReject}
      onUpdated={onUpdated}
      onEditMatch={onEditMatch}
    />
  );
}

function CandidateDetailDrawerContent({
  candidate,
  locale,
  copy,
  onClose,
  onReject,
  onUpdated,
  onEditMatch,
}: {
  candidate: AiPriceCandidate;
  locale: string;
  copy: WorkbenchCopy;
  onClose: () => void;
  onReject: (candidateId: string) => void;
  onUpdated: () => void;
  onEditMatch: (candidate: AiPriceCandidate) => void;
}) {
  const [visitImages, setVisitImages] = useState<{ path: string; url: string | null; category?: string }[] | null>(() => candidate.visit_id ? null : []);
  const [price, setPrice] = useState(candidate.parsed_price_idr ? String(Math.round(candidate.parsed_price_idr)) : "");
  const [pieces, setPieces] = useState(candidate.piece_count ? String(candidate.piece_count) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeImage, setActiveImage] = useState<{ url: string; label: string } | null>(null);
  const reviewedPricePerPiece = calculateReviewedPricePerPiece(price, pieces);

  useEffect(() => {
    if (!candidate.visit_id) return;
    let active = true;
    fetch(`/api/store-visit/${candidate.visit_id}`)
      .then((response) => response.json())
      .then((payload) => {
        if (active) setVisitImages(Array.isArray(payload.visit?.signed_images) ? payload.visit.signed_images : []);
      })
      .catch(() => {
        if (active) setVisitImages([]);
      });
    return () => {
      active = false;
    };
  }, [candidate.visit_id]);

  async function approve() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/ai-price-candidates/${candidate.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve", price_idr: Number(price), piece_count: Number(pieces) }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? copy.reviewActionFailed);
      onUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : copy.reviewActionFailed);
    } finally {
      setBusy(false);
    }
  }

  function onBackdropClick(event: MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/30" onClick={onBackdropClick}>
      <aside className="h-full w-full max-w-xl overflow-y-auto bg-white p-5 shadow-xl" onClick={stopReviewRowClick}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-slate-950">{candidate.raw_brand || "-"}</h3>
            <p className="mt-1 text-sm text-slate-600">{candidate.raw_product || "-"}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-md border border-slate-300 px-3 py-1 text-sm">{copy.close}</button>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <DetailMetric label={copy.table.store} value={candidate.offline_store_visits?.store_name ?? "-"} />
          <DetailMetric label={copy.visitDate} value={candidate.offline_store_visits?.visit_date ?? shortTime(candidate.created_at)} />
          <DetailMetric label={copy.aiConfidence} value={`${Math.round(candidate.ai_confidence * 100)}%`} />
          <DetailMetric label={copy.matchScore} value={`${Math.round(candidate.match_score * 100)}%`} />
          <DetailMetric label={copy.matchedTo} value={matchedSkuLabel(candidate, copy)} />
          <DetailMetric label={copy.table.status} value={copy.status[candidate.status] ?? candidate.status} />
        </div>

        {candidate.status === "pending" ? (
          <button
            type="button"
            onClick={() => onEditMatch(candidate)}
            className="mt-3 inline-flex h-8 items-center rounded-md border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            {copy.editMatch}
          </button>
        ) : null}

        {candidate.offline_store_visits ? (
          <Link className="mt-4 inline-flex text-sm font-medium text-slate-700 underline" href={`/${locale}/mobile/offline-capture/${candidate.offline_store_visits.id}`}>
            {copy.visitDetail}
          </Link>
        ) : null}

        <div className="mt-5 rounded-lg border border-slate-200 p-3">
          <div className="mb-2 text-sm font-semibold text-slate-900">{copy.visitPhotos}</div>
          {visitImages === null ? <div className="text-sm text-slate-500">{copy.loadingPhotos}</div> : null}
          {visitImages !== null && visitImages.length === 0 ? <div className="text-sm text-slate-500">{copy.noPhotos}</div> : null}
          <div className="grid gap-3 sm:grid-cols-2">
            {(visitImages ?? []).map((image) => (
              <div key={image.path} className="rounded-md border border-slate-200 p-2">
                {image.url ? (
                  <button
                    type="button"
                    onClick={() => setActiveImage({ url: image.url as string, label: image.category ?? copy.visitPhoto })}
                    className="block w-full"
                    aria-label={copy.previewPhoto}
                  >
                    <Image
                      src={image.url}
                      alt={image.category ?? copy.visitPhoto}
                      width={360}
                      height={200}
                      unoptimized
                      className="aspect-video w-full rounded object-cover"
                    />
                  </button>
                ) : <div className="aspect-video rounded bg-slate-100" />}
                <div className="mt-1 text-xs text-slate-500">{image.category ?? image.path}</div>
              </div>
            ))}
          </div>
        </div>

        {candidate.warnings?.length ? (
          <div className="mt-5 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            <div className="mb-2 font-semibold">{copy.riskWarnings}</div>
            {candidate.warnings.map((warning, index) => (
              <div key={index} className="mt-1">
                {warning.type ? <span className="font-medium">{warning.type}: </span> : null}
                {warning.message}
              </div>
            ))}
          </div>
        ) : null}

        {candidate.status === "pending" ? (
          <div className="mt-5 space-y-3 rounded-lg border border-slate-200 p-3">
            <div className="font-semibold text-slate-900">{copy.reviewInput}</div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-medium text-slate-500">{copy.packagePrice}<input value={price} onChange={(event) => setPrice(event.target.value)} type="number" className="mt-1 h-9 w-full rounded-md border border-slate-300 px-2 text-sm" /></label>
              <label className="text-xs font-medium text-slate-500">{copy.table.pcs}<input value={pieces} onChange={(event) => setPieces(event.target.value)} type="number" className="mt-1 h-9 w-full rounded-md border border-slate-300 px-2 text-sm" /></label>
            </div>
            <div className="text-sm text-slate-600">{copy.table.perPiece}: <span className="font-semibold text-slate-900">{reviewedPricePerPiece ? formatIdr(reviewedPricePerPiece) : "-"}</span></div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" disabled={busy || !price || !pieces} onClick={approve}>{copy.approve}</Button>
              <Button type="button" disabled={busy} onClick={() => onReject(candidate.id)} className="bg-rose-700 hover:bg-rose-600">{copy.reject}</Button>
            </div>
            {error ? <div className="text-sm text-red-600">{error}</div> : null}
          </div>
        ) : null}
      </aside>
      {activeImage ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/80 p-4" onClick={() => setActiveImage(null)}>
          <div className="max-h-full max-w-5xl" onClick={stopReviewRowClick}>
            <button type="button" onClick={() => setActiveImage(null)} className="mb-3 rounded-md bg-white px-3 py-1 text-sm text-slate-700">{copy.close}</button>
            <Image
              src={activeImage.url}
              alt={activeImage.label}
              width={1200}
              height={900}
              unoptimized
              className="max-h-[82vh] w-auto rounded-lg object-contain"
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function DetailMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-slate-50 px-3 py-2">
      <div className="text-xs font-medium uppercase text-slate-500">{label}</div>
      <div className="mt-1 text-sm text-slate-900">{value}</div>
    </div>
  );
}

function defaultReviewInput(candidate: AiPriceCandidate): ReviewInput {
  const pieceCount = candidate.reviewed_piece_count ?? candidate.piece_count;
  return {
    price: candidate.parsed_price_idr ? String(Math.round(candidate.parsed_price_idr)) : "",
    pieces: pieceCount ? String(pieceCount) : "",
  };
}

function calculateReviewedPricePerPiece(priceValue: string, pieceValue: string) {
  const price = Number(priceValue);
  const pieces = Number(pieceValue);
  if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(pieces) || pieces <= 0) return null;
  return Math.round(price / pieces * 100) / 100;
}

function PageLink({ locale, page, perPage, filters, disabled, children }: { locale: string; page: number; perPage: number; filters: WorkbenchFilters; disabled: boolean; children: ReactNode }) {
  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("per_page", String(perPage));
  if (filters.status) params.set("status", filters.status);
  if (filters.date_from) params.set("date_from", filters.date_from);
  if (filters.date_to) params.set("date_to", filters.date_to);
  const href = `/${locale}/offline-price-candidates?${params.toString()}`;
  return disabled
    ? <span className="inline-flex h-9 items-center rounded-md border border-slate-200 px-3 text-slate-400">{children}</span>
    : <Link href={href} className="inline-flex h-9 items-center rounded-md border border-slate-300 bg-white px-3 text-slate-700 hover:bg-slate-50">{children}</Link>;
}

function statusTabHref(locale: string, filters: WorkbenchFilters, status: StatusTabValue) {
  const params = new URLSearchParams();
  params.set("page", "1");
  params.set("per_page", "50");
  if (status !== "all") params.set("status", status);
  if (filters.date_from) params.set("date_from", filters.date_from);
  if (filters.date_to) params.set("date_to", filters.date_to);
  return `/${locale}/offline-price-candidates?${params.toString()}`;
}

function reviewMethodLabel(candidate: AiPriceCandidate, copy: WorkbenchCopy) {
  if (candidate.review_method) return copy.reviewMethods[candidate.review_method] ?? candidate.review_method;
  if (candidate.review_job_id) return copy.reviewMethods.bulk_manual;
  return copy.reviewMethods.manual;
}

function warningMessagesForCandidate(candidate: AiPriceCandidate) {
  return (candidate.warnings ?? [])
    .map((warning) => [warning.type, warning.message].filter(Boolean).join(": "))
    .filter(Boolean);
}

function matchedSkuLabel(candidate: AiPriceCandidate, copy: WorkbenchCopy) {
  return candidate.matched_sku_label || candidate.matched_label || (candidate.matched_entity_type === "unmatched" ? copy.unmatched : candidate.matched_entity_type);
}

function normalizeSearchText(value: string | number | null | undefined) {
  return String(value ?? "").trim().toLowerCase();
}

function includesQuery(values: Array<string | number | null | undefined>, query: string) {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return true;
  return values.some((value) => normalizeSearchText(value).includes(normalizedQuery));
}

function formatMaterialMatchLabel(material: MaterialMaster | undefined) {
  if (!material) return "";
  return `${material.tenant_sku_code} · ${material.tenant_sku_name}`;
}

function formatCompetitorMatchLabel(product: CompetitorProduct | undefined) {
  if (!product) return "";
  return `${product.brands?.name ?? ""} · ${product.normalized_name}`.trim();
}

function filterMaterials(materials: MaterialMaster[], query: string) {
  return materials.filter((material) => includesQuery([
    material.tenant_sku_code,
    material.tenant_sku_name,
    material.sub_brand,
    material.sub_category,
    material.type,
    material.sub_type,
    material.pack_count,
  ], query));
}

function filterCompetitorProducts(products: CompetitorProduct[], query: string) {
  return products.filter((product) => includesQuery([
    product.brands?.name,
    product.normalized_name,
    product.raw_title,
    product.pack_type,
    product.size,
    product.piece_count,
  ], query));
}

function getWorkbenchCopy(locale: string) {
  if (locale === "zh") {
    return {
      emptyState: "暂无 AI 价格候选。请先完成巡店照片解析。",
      selectCurrentPage: "选择当前页",
      selectCandidate: "选择",
      previous: "上一页",
      next: "下一页",
      pageLabel: "第",
      approveSelected: "通过选中",
      rejectSelected: "驳回选中",
      rejectReason: "驳回原因",
      rejectionReason: "驳回原因",
      approve: "通过",
      reject: "驳回",
      cancel: "取消",
      selectedCount: (selected: number) => `已选 ${selected}`,
      batchJob: "批处理任务",
      reviewRule: "审核规则",
      ruleSettings: "规则设置",
      aiConfidence: "AI 置信度",
      matchScore: "商品命中度",
      requireMatch: "必须有匹配对象",
      noWarnings: "无风险提示",
      priceAndPcs: "价格和片数完整",
      saveRule: "保存规则",
      ruleSaved: "规则已保存",
      saveRuleFailed: "保存规则失败",
      createBatchFailed: "创建批处理任务失败",
      batchReviewFailed: "批量审核失败",
      reviewActionFailed: "审核操作失败",
      invalidReviewInput: "请先补全选中行的包装价和片数",
      confirmSaveReviewInput: "是否保存本次修改的包装价和片数？",
      saveReviewInputFailed: "保存复核输入失败",
      editMatch: "编辑匹配",
      saveMatch: "保存匹配",
      saveMatchFailed: "保存匹配失败",
      searchMatch: "搜索匹配 SKU",
      searchMakukuSku: "搜索 Makuku SKU / 物料编码 / 商品名",
      searchCompetitorSku: "搜索竞品 SKU / 品牌 / 商品名",
      selectMatchFirst: "请先选择一个匹配对象",
      loadMatchOptionsFailed: "加载匹配选项失败",
      loadingMatchOptions: "匹配选项加载中...",
      unmatched: "未匹配",
      unmatchedHint: "保存为未匹配后，该候选不能直接通过，需要先补齐匹配。",
      matchTypes: {
        material_master: "Makuku SKU",
        competitor_product: "竞品商品",
        unmatched: "未匹配",
      } as Record<string, string>,
      viewEvidence: "查看依据",
      riskIndicatorLabel: (count: number) => `${count} 条风险提示`,
      previewPhoto: "查看大图",
      close: "关闭",
      visitDate: "巡店日期",
      matchedTo: "匹配对象",
      visitDetail: "巡店详情",
      visitPhotos: "巡店照片",
      visitPhoto: "巡店照片",
      loadingPhotos: "照片加载中...",
      noPhotos: "暂无照片预览。",
      riskWarnings: "风险提示",
      reviewInput: "复核输入",
      packagePrice: "包装价",
      approvedAt: "通过时间",
      rejectedAt: "驳回时间",
      reviewMethod: "通过方法",
      table: {
        store: "门店",
        date: "日期",
        brand: "品牌",
        product: "商品",
        aiPackage: "AI 包装价",
        pcs: "片数",
        perPiece: "单片价",
        match: "商品命中度",
        warnings: "风险提示",
        evidence: "依据",
        status: "状态",
      },
      status: {
        pending: "待复核",
        approved: "已通过",
        rejected: "已驳回",
        all: "全部",
        queued: "排队中",
        running: "处理中",
        completed: "已完成",
        failed: "失败",
        skipped: "已跳过",
      } as Record<string, string>,
      reviewMethods: {
        auto_rule: "自动规则通过",
        manual: "人工通过",
        bulk_manual: "批量人工通过",
      } as Record<string, string>,
    };
  }

  return {
    emptyState: "No AI price candidates yet. Run Store Visit analysis first.",
    selectCurrentPage: "Select current page",
    selectCandidate: "Select",
    previous: "Previous",
    next: "Next",
    pageLabel: "Page",
    approveSelected: "Approve selected",
    rejectSelected: "Reject selected",
    rejectReason: "Reject reason",
    rejectionReason: "Reject reason",
    approve: "Approve",
    reject: "Reject",
    cancel: "Cancel",
    selectedCount: (selected: number) => `Selected ${selected}`,
    batchJob: "Batch job",
    reviewRule: "Review rule",
    ruleSettings: "Rule settings",
    aiConfidence: "AI confidence",
    matchScore: "Match score",
    requireMatch: "Require match",
    noWarnings: "No warnings",
    priceAndPcs: "Price + pcs",
    saveRule: "Save rule",
    ruleSaved: "Rule saved",
    saveRuleFailed: "Failed to save rule",
    createBatchFailed: "Failed to create batch review job",
    batchReviewFailed: "Batch review failed",
    reviewActionFailed: "Review action failed",
    invalidReviewInput: "Complete package price and piece count for selected rows first.",
    confirmSaveReviewInput: "Save the edited package price and piece count?",
    saveReviewInputFailed: "Failed to save review input",
    editMatch: "Edit match",
    saveMatch: "Save match",
    saveMatchFailed: "Failed to save match",
    searchMatch: "Search matched SKU",
    searchMakukuSku: "Search Makuku SKU / material code / product name",
    searchCompetitorSku: "Search competitor SKU / brand / product name",
    selectMatchFirst: "Select a match first",
    loadMatchOptionsFailed: "Failed to load match options",
    loadingMatchOptions: "Loading match options...",
    unmatched: "Unmatched",
    unmatchedHint: "If saved as unmatched, this candidate cannot be approved until a match is selected.",
    matchTypes: {
      material_master: "Makuku SKU",
      competitor_product: "Competitor product",
      unmatched: "Unmatched",
    } as Record<string, string>,
    viewEvidence: "View evidence",
    riskIndicatorLabel: (count: number) => `${count} risk warning${count === 1 ? "" : "s"}`,
    previewPhoto: "Preview photo",
    close: "Close",
    visitDate: "Visit date",
    matchedTo: "Matched to",
    visitDetail: "Visit detail",
    visitPhotos: "Visit photos",
    visitPhoto: "visit photo",
    loadingPhotos: "Loading photos...",
    noPhotos: "No photos loaded.",
    riskWarnings: "Risk warnings",
    reviewInput: "Review input",
    packagePrice: "Package price",
    approvedAt: "Approved at",
    rejectedAt: "Rejected at",
    reviewMethod: "Review method",
    table: {
      store: "Store",
      date: "Date",
      brand: "Brand",
      product: "Product",
      aiPackage: "AI package",
      pcs: "Pcs",
      perPiece: "Per piece",
      match: "Match",
      warnings: "Warnings",
      evidence: "Evidence",
      status: "Status",
    },
    status: {
      pending: "Pending",
      approved: "Approved",
      rejected: "Rejected",
      all: "All",
      queued: "Queued",
      running: "Running",
      completed: "Completed",
      failed: "Failed",
      skipped: "Skipped",
    } as Record<string, string>,
    reviewMethods: {
      auto_rule: "Auto rule",
      manual: "Manual",
      bulk_manual: "Bulk manual",
    } as Record<string, string>,
  };
}

function shortTime(value: string) {
  return value ? formatJakartaTime(value) : "-";
}

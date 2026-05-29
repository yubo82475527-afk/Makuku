"use client";

import { Check, Loader2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { formatIdr } from "@/lib/format";

export function AiPriceCandidateActions({
  id,
  canApprove,
  price,
  pieceCount,
}: {
  id: string;
  canApprove: boolean;
  price: number | null;
  pieceCount: number | null;
}) {
  const [loading, setLoading] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reviewPrice, setReviewPrice] = useState(price ? String(Math.round(price)) : "");
  const [reviewPieceCount, setReviewPieceCount] = useState(pieceCount ? String(pieceCount) : "");

  const previewPricePerPiece = useMemo(() => {
    const parsedPrice = Number(reviewPrice);
    const parsedPieceCount = Number(reviewPieceCount);
    if (!Number.isFinite(parsedPrice) || parsedPrice <= 0 || !Number.isFinite(parsedPieceCount) || parsedPieceCount <= 0) return null;
    return Number((parsedPrice / Math.floor(parsedPieceCount)).toFixed(2));
  }, [reviewPieceCount, reviewPrice]);

  async function submit(action: "approve" | "reject") {
    setLoading(action);
    setError(null);
    try {
      const response = await fetch(`/api/ai-price-candidates/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          price_idr: reviewPrice ? Number(reviewPrice) : null,
          piece_count: reviewPieceCount ? Number(reviewPieceCount) : null,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(payload.error ?? "Action failed");
        return;
      }
      window.location.reload();
    } catch {
      setError("Network error");
    } finally {
      setLoading(null);
    }
  }

  const approveDisabled = !canApprove || loading !== null || !previewPricePerPiece;

  return (
    <div className="space-y-2">
      <div className="grid w-44 grid-cols-2 gap-2">
        <label className="space-y-1 text-xs text-slate-500">
          <span>Package</span>
          <input
            type="number"
            min="1"
            value={reviewPrice}
            onChange={(event) => setReviewPrice(event.target.value)}
            className="h-8 w-full rounded-md border border-slate-300 px-2 text-xs text-slate-900 outline-none focus:border-slate-500"
          />
        </label>
        <label className="space-y-1 text-xs text-slate-500">
          <span>Pcs</span>
          <input
            type="number"
            min="1"
            step="1"
            value={reviewPieceCount}
            onChange={(event) => setReviewPieceCount(event.target.value)}
            className="h-8 w-full rounded-md border border-slate-300 px-2 text-xs text-slate-900 outline-none focus:border-slate-500"
          />
        </label>
      </div>
      <div className="text-xs text-slate-500">Per piece: {previewPricePerPiece ? formatIdr(previewPricePerPiece) : "-"}</div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => submit("approve")}
          disabled={approveDisabled}
          className="inline-flex h-8 items-center gap-1.5 rounded-md bg-slate-900 px-2.5 text-xs font-medium text-white disabled:opacity-40"
        >
          {loading === "approve" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          Approve
        </button>
        <button
          type="button"
          onClick={() => submit("reject")}
          disabled={loading !== null}
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 text-xs font-medium text-slate-700 disabled:opacity-40"
        >
          {loading === "reject" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
          Reject
        </button>
      </div>
      {error ? <div className="max-w-44 text-xs text-red-600">{error}</div> : null}
    </div>
  );
}

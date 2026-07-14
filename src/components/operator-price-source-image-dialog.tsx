"use client";

import { useEffect, useState, type MouseEvent } from "react";

type SourceImageResponse = {
  item?: {
    source_image_url?: string | null;
  };
  error?: string;
};

export function OperatorPriceSourceImageDialog({
  candidateId,
  locale,
  onClose,
}: {
  candidateId: string;
  locale: string;
  onClose: () => void;
}) {
  const isZh = locale === "zh";
  const [sourceImageUrl, setSourceImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function loadSourceImage() {
      try {
        const response = await fetch(`/api/operator-price-reviews/${candidateId}`);
        const payload = await response.json().catch(() => ({})) as SourceImageResponse;
        if (!response.ok) throw new Error(payload.error ?? "Unable to load the source image.");
        if (!active) return;
        setSourceImageUrl(payload.item?.source_image_url ?? null);
      } catch (reason) {
        if (!active) return;
        setError(reason instanceof Error ? reason.message : String(reason));
      } finally {
        if (active) setLoading(false);
      }
    }
    void loadSourceImage();
    return () => { active = false; };
  }, [candidateId]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  function onBackdropClick(event: MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) onClose();
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/70 p-4" role="dialog" aria-modal="true" aria-label={isZh ? "来源原图预览" : "Source image preview"} onClick={onBackdropClick}>
      <section className="flex max-h-[92vh] w-full max-w-5xl flex-col rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h2 className="text-base font-semibold text-slate-950">{isZh ? "来源原图" : "Source image"}</h2>
          <button type="button" onClick={onClose} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">{isZh ? "关闭" : "Close"}</button>
        </div>
        <div className="flex min-h-72 flex-1 items-center justify-center overflow-auto bg-slate-50 p-4">
          {loading ? <p className="text-sm text-slate-500">{isZh ? "正在加载原图…" : "Loading source image…"}</p> : null}
          {!loading && error ? <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
          {!loading && !error && !sourceImageUrl ? <p className="text-sm text-slate-500">{isZh ? "原始证据不可用" : "Source evidence unavailable"}</p> : null}
          {sourceImageUrl ? (
            // This is a short-lived signed Supabase URL, so it must be loaded directly on demand.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={sourceImageUrl} alt={isZh ? "候选价格的来源原图" : "Original source image for this price candidate"} className="max-h-[78vh] max-w-full rounded-lg object-contain shadow-lg" />
          ) : null}
        </div>
      </section>
    </div>
  );
}

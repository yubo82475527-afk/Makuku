"use client";

import { ArrowLeft, Loader2, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { Locale } from "@/lib/i18n/config";
import { getMobileCopy, mobileAnalysisStatusLabel, mobileImageCategoryLabel } from "@/lib/mobile-i18n";
import type { StoreVisitAiResult, StoreVisitImageCategory } from "@/lib/types";
import { StoreVisitResultCard } from "@/components/store-visit-result-card";
import { MobileLanguageSwitch } from "@/components/mobile-language-switch";

type StoreVisitDetail = {
  id: string;
  store_name: string;
  region?: string | null;
  channel?: string | null;
  promoter?: string | null;
  visit_date: string;
  analysis_status?: "pending" | "analyzing" | "completed" | "failed" | null;
  analysis_error?: string | null;
  ai_result?: StoreVisitAiResult | null;
  summary_result?: Record<string, unknown> | null;
  signed_images?: { path: string; url: string | null; category?: StoreVisitImageCategory }[];
};

export function StoreVisitDetailH5({ locale, id }: { locale: Locale; id: string }) {
  const copy = getMobileCopy(locale);
  const [visit, setVisit] = useState<StoreVisitDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeImage, setActiveImage] = useState<{ url: string; label: string } | null>(null);

  function openImagePreview(url: string, label: string) {
    setActiveImage({ url, label });
  }

  const loadVisit = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/store-visit/${id}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? copy.loadVisitFailed);
        return;
      }
      setVisit(data.visit);
    } catch {
      setError(copy.networkRetry);
    } finally {
      setLoading(false);
    }
  }, [copy.loadVisitFailed, copy.networkRetry, id]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      void loadVisit();
    }, 0);
    return () => clearTimeout(timeout);
  }, [loadVisit]);

  async function analyze() {
    setAnalyzing(true);
    setError(null);
    try {
      const res = await fetch("/api/store-visit/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visit_id: id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? copy.aiAnalysisFailed);
      }
      await loadVisit();
    } catch {
      setError(copy.aiAnalysisFailed);
      await loadVisit();
    } finally {
      setAnalyzing(false);
    }
  }

  const status = visit?.analysis_status ?? "pending";
  const images = visit?.signed_images ?? [];
  const imageGroups = [
    { category: "makuku_shelf" as const, images: images.filter((image) => image.category === "makuku_shelf") },
    { category: "competitor_shelf" as const, images: images.filter((image) => image.category === "competitor_shelf") },
    { category: "storefront" as const, images: images.filter((image) => image.category === "storefront") },
    { category: "uncategorized" as const, images: images.filter((image) => !image.category) },
  ].filter((group) => group.images.length > 0);

  return (
    <main className="mx-auto min-h-screen max-w-md bg-slate-50 px-4 py-5 text-slate-950">
      <header className="mb-4 flex items-center gap-3">
        <Link href={`/${locale}/mobile/offline-capture`} className="rounded-full border border-slate-200 bg-white p-2 text-slate-700">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold">{visit?.store_name ?? copy.storeVisit}</h1>
          <p className="text-xs text-slate-500">{visit?.region ?? "-"} / {visit?.channel ?? "-"} / {visit?.visit_date ?? "-"}</p>
        </div>
        <MobileLanguageSwitch locale={locale} currentPath={`/mobile/offline-capture/${id}`} />
      </header>

      {error ? <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
          <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
          {copy.loadingVisit}
        </div>
      ) : null}

      {visit ? (
        <div className="space-y-4">
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-medium uppercase text-slate-500">{copy.analysisStatus}</div>
                <div className="mt-1 text-lg font-bold">{mobileAnalysisStatusLabel(locale, status)}</div>
              </div>
              <button type="button" onClick={analyze} disabled={analyzing || status === "analyzing"} className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-3 text-sm font-bold text-white disabled:opacity-60">
                {analyzing || status === "analyzing" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                {status === "failed" ? copy.retryAnalyze : copy.analyzeStore}
              </button>
            </div>
            {visit.analysis_error ? <p className="mt-3 text-sm text-red-600">{copy.aiAnalysisFailed}: {visit.analysis_error}</p> : null}
          </section>

          {visit.ai_result ? <StoreVisitResultCard result={visit.ai_result} locale={locale} /> : null}

          {!visit.ai_result && status !== "failed" ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
              {copy.resultEmpty}
            </div>
          ) : null}

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 font-semibold">{copy.photoSection}</h2>
            <div className="space-y-4">
              {imageGroups.map((group) => (
                <div key={group.category}>
                  <div className="mb-2 text-xs font-semibold uppercase text-slate-500">{mobileImageCategoryLabel(locale, group.category)}</div>
                  <div className="grid grid-cols-3 gap-3">
                    {group.images.map((image) => (
                      <div key={image.path} className="aspect-square overflow-hidden rounded-xl bg-slate-100">
                        {image.url ? (
                          <button
                            type="button"
                            onClick={() => openImagePreview(image.url as string, mobileImageCategoryLabel(locale, group.category))}
                            onPointerUp={() => openImagePreview(image.url as string, mobileImageCategoryLabel(locale, group.category))}
                            className="block h-full w-full cursor-pointer"
                            aria-label={locale === "zh" ? "放大照片" : "Preview photo"}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={image.url} alt={mobileImageCategoryLabel(locale, group.category)} className="h-full w-full object-cover" />
                          </button>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      ) : null}

      {activeImage ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setActiveImage(null)}
        >
          <div className="max-h-full max-w-full" onClick={(event) => event.stopPropagation()}>
            <button
              type="button"
              onClick={() => setActiveImage(null)}
              className="mb-3 rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm"
            >
              {locale === "zh" ? "关闭" : "Close"}
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={activeImage.url}
              alt={activeImage.label}
              className="max-h-[82vh] max-w-full rounded-xl object-contain shadow-2xl"
            />
          </div>
        </div>
      ) : null}
    </main>
  );
}

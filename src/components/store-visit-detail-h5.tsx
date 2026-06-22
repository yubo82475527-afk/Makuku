"use client";

import { ArrowLeft, Check, Copy, Loader2, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { withMinimumDelay } from "@/lib/async-ui";
import { formatIdr } from "@/lib/format";
import type { Locale } from "@/lib/i18n/config";
import { getMobileCopy, mobileAnalysisStatusLabel, mobileImageCategoryLabel } from "@/lib/mobile-i18n";
import type {
  OfflineVisitImage,
  StoreVisitDisplayAnalysis,
  StoreVisitImageCategory,
  StoreVisitPriceImageAnalysis,
} from "@/lib/types";
import { LoadingOverlay } from "@/components/loading-overlay";

type SignedVisitImage = {
  path: string;
  url: string | null;
  category?: StoreVisitImageCategory;
};

type StoreVisitDetail = {
  id: string;
  visit_code?: string | null;
  store_name: string;
  region?: string | null;
  channel?: string | null;
  promoter?: string | null;
  visit_date: string;
  visit_status?: string | null;
  analysis_status?: "pending" | "analyzing" | "completed" | "partial" | "failed" | null;
  analysis_error?: string | null;
  summary_result?: Record<string, unknown> | null;
  offline_visit_images?: OfflineVisitImage[];
  signed_images?: SignedVisitImage[];
};

type PriceParseSection = {
  image: OfflineVisitImage;
  signedImage: SignedVisitImage | null;
  category: "makuku_shelf" | "competitor_shelf";
  result: StoreVisitPriceImageAnalysis | null;
};

function canRetryAnalysis(status: StoreVisitDetail["analysis_status"], visitStatus: StoreVisitDetail["visit_status"]) {
  return status === "failed" || status === "partial" || (visitStatus === "uploaded" && (!status || status === "pending"));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asPriceImageAnalysis(value: unknown): StoreVisitPriceImageAnalysis | null {
  if (!isRecord(value) || value.schema_version !== "store_visit_price_image_v1" || !Array.isArray(value.rows)) {
    return null;
  }
  return value as unknown as StoreVisitPriceImageAnalysis;
}

function asDisplayAnalysis(value: unknown): StoreVisitDisplayAnalysis | null {
  if (!isRecord(value) || value.schema_version !== "store_visit_display_v1") {
    return null;
  }
  return value as unknown as StoreVisitDisplayAnalysis;
}

function uploadCategoryForImage(image: OfflineVisitImage, signedImage: SignedVisitImage | null): StoreVisitImageCategory | null {
  if (signedImage?.category) return signedImage.category;
  const result = image.vision_result;
  if (isRecord(result)) {
    const uploadCategory = (result as Record<string, unknown>).upload_category;
    if (uploadCategory === "makuku_shelf" || uploadCategory === "competitor_shelf" || uploadCategory === "storefront") {
      return uploadCategory;
    }
  }
  return null;
}

function formatMoney(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? formatIdr(value) : "-";
}

function detailText(locale: Locale) {
  return locale === "zh"
    ? {
        batchCode: "\u62cd\u7167\u6279\u6b21",
        priceParsing: "\u4ef7\u683c\u89e3\u6790",
        displayAnalysis: "\u9648\u5217\u89e3\u6790",
        photo: "\u7167\u7247",
        sku: "SKU",
        listPrice: "\u6807\u4ef7",
        promoType: "\u6d3b\u52a8\u7c7b\u578b",
        netPrice: "\u5230\u624b\u4ef7",
        pricePerPiece: "\u5355\u7247\u4ef7",
        noPriceRows: "\u8fd9\u5f20\u56fe\u7247\u6682\u65f6\u6ca1\u6709\u53ef\u5c55\u793a\u7684\u4ef7\u683c\u7ed3\u679c\u3002",
        noPriceResult: "\u6682\u65e0\u4ef7\u683c\u89e3\u6790\u7ed3\u679c\u3002",
        noDisplayResult: "\u6682\u65e0\u9648\u5217\u89e3\u6790\u7ed3\u679c\u3002",
        noDisplayImages: "\u672a\u4e0a\u4f20\u95e8\u5e97\u9648\u5217\u56fe\u7247\u3002",
        partialSuccess: "\u90e8\u5206\u6210\u529f",
        businessAnalysisError: "\u90e8\u5206\u56fe\u7247\u672a\u89e3\u6790\u6210\u529f\uff0c\u5df2\u6210\u529f\u89e3\u6790\u7684\u4ef7\u683c\u53ef\u4ee5\u5148\u590d\u6838\uff1b\u5931\u8d25\u56fe\u7247\u53ef\u7a0d\u540e\u91cd\u8bd5\u3002",
        systemError: "\u7cfb\u7edf\u62a5\u9519",
        copySystemError: "\u590d\u5236\u62a5\u9519",
        copiedSystemError: "\u5df2\u590d\u5236",
        photoPrefix: "\u7167\u7247",
        close: "\u5173\u95ed",
      }
    : {
        batchCode: "Batch code",
        priceParsing: "Price Parsing",
        displayAnalysis: "Display Analysis",
        photo: "Photo",
        sku: "SKU",
        listPrice: "List Price",
        promoType: "Activity Type",
        netPrice: "Net Price",
        pricePerPiece: "Per Piece",
        noPriceRows: "No readable price rows for this image yet.",
        noPriceResult: "No price parsing result yet.",
        noDisplayResult: "No display analysis result yet.",
        noDisplayImages: "No display images uploaded.",
        partialSuccess: "Partial success",
        businessAnalysisError: "Some photos were not parsed. Parsed prices can be reviewed first; failed photos can be retried later.",
        systemError: "System error",
        copySystemError: "Copy error",
        copiedSystemError: "Copied",
        photoPrefix: "Photo",
        close: "Close",
      };
}

export function StoreVisitDetailH5({ locale, id }: { locale: Locale; id: string }) {
  const copy = getMobileCopy(locale);
  const text = detailText(locale);
  const [visit, setVisit] = useState<StoreVisitDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisPhase, setAnalysisPhase] = useState<"idle" | "running" | "refreshing">("idle");
  const [error, setError] = useState<string | null>(null);
  const [activeImage, setActiveImage] = useState<{ url: string; label: string } | null>(null);
  const [copiedErrorId, setCopiedErrorId] = useState<string | null>(null);

  const loadVisit = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await withMinimumDelay(fetch(`/api/store-visit/${id}`), 300);
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
    setAnalysisPhase("running");
    setError(null);
    try {
      const res = await withMinimumDelay(fetch("/api/store-visit/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visit_id: id }),
      }), 350);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? copy.aiAnalysisFailed);
      }
      setAnalysisPhase("refreshing");
      await loadVisit();
    } catch {
      setError(copy.aiAnalysisFailed);
      await loadVisit();
    } finally {
      setAnalyzing(false);
      setAnalysisPhase("idle");
    }
  }

  const status = visit?.analysis_status ?? "pending";
  const retryable = canRetryAnalysis(status, visit?.visit_status);
  const canRunAnalysis = retryable || status === "pending";
  const signedImagesByPath = new Map((visit?.signed_images ?? []).map((image) => [image.path, image] as const));
  const priceParseSections: PriceParseSection[] = [];
  for (const image of visit?.offline_visit_images ?? []) {
    const signedImage = signedImagesByPath.get(image.image_path) ?? null;
    const category = uploadCategoryForImage(image, signedImage);
    if (category !== "makuku_shelf" && category !== "competitor_shelf") continue;
    priceParseSections.push({
      image,
      signedImage,
      category,
      result: asPriceImageAnalysis(image.vision_result),
    });
  }
  const displayImages = (visit?.offline_visit_images ?? [])
    .map((image) => ({
      image,
      signedImage: signedImagesByPath.get(image.image_path) ?? null,
    }))
    .filter((item) => uploadCategoryForImage(item.image, item.signedImage) === "storefront");
  const displayAnalysis = asDisplayAnalysis(visit?.summary_result && isRecord(visit.summary_result) ? visit.summary_result.display_analysis : null);
  const failedImages = (visit?.offline_visit_images ?? []).filter((image) => image.analysis_status === "failed" && (image.analysis_error || image.error_message));

  async function copySystemError(id: string, value: string) {
    await navigator.clipboard.writeText(value);
    setCopiedErrorId(id);
    window.setTimeout(() => setCopiedErrorId((current) => (current === id ? null : current)), 1600);
  }

  return (
    <>
      <LoadingOverlay
        open={analysisPhase !== "idle"}
        title={
          analysisPhase === "refreshing"
            ? (locale === "zh" ? "分析完成，正在刷新结果..." : "Analysis complete. Refreshing results...")
            : (locale === "zh" ? "正在重新分析巡店..." : "Re-analyzing the visit...")
        }
        description={locale === "zh" ? "请稍候，不要重复点击。" : "Please wait and avoid tapping repeatedly."}
      />
      <main className="mx-auto min-h-screen max-w-md bg-slate-50 px-4 py-5 text-slate-950">
      <header className="mb-4 flex items-center gap-3">
        <Link href={`/${locale}/mobile/offline-capture`} className="rounded-full border border-slate-200 bg-white p-2 text-slate-700">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold">{visit?.store_name ?? copy.storeVisit}</h1>
          <p className="text-xs text-slate-500">{visit?.visit_code ?? "-"} / {visit?.region ?? "-"} / {visit?.channel ?? "-"} / {visit?.visit_date ?? "-"}</p>
          <p className="mt-1 text-[11px] text-slate-400">{text.batchCode}: {visit?.visit_code ?? "-"}</p>
        </div>
      </header>

      {error ? <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

      {loading ? (
        <div className="space-y-4">
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="h-3 w-24 animate-pulse rounded bg-slate-200" />
                <div className="mt-3 h-7 w-40 animate-pulse rounded bg-slate-100" />
                <div className="mt-2 h-3 w-52 animate-pulse rounded bg-slate-100" />
              </div>
              <div className="h-10 w-24 animate-pulse rounded-lg bg-slate-100" />
            </div>
          </section>
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="h-5 w-28 animate-pulse rounded bg-slate-200" />
            <div className="mt-4 space-y-3">
              <div className="h-24 animate-pulse rounded-xl bg-slate-100" />
              <div className="h-24 animate-pulse rounded-xl bg-slate-100" />
            </div>
          </section>
          <section className="rounded-2xl border border-slate-200 bg-white p-4 text-center text-sm text-slate-500 shadow-sm">
            <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
            {copy.loadingVisit}
          </section>
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
              {canRunAnalysis ? (
                <button type="button" onClick={analyze} disabled={analyzing || status === "analyzing"} className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-3 text-sm font-bold text-white disabled:opacity-60">
                  {analyzing || status === "analyzing" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  {retryable ? copy.retryAnalyze : copy.analyzeStore}
                </button>
              ) : null}
            </div>
            {status === "partial" ? (
              <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                <div className="font-semibold">{text.partialSuccess}</div>
                <div className="mt-1">{text.businessAnalysisError}</div>
              </div>
            ) : null}
            {visit.analysis_error && status !== "partial" ? <p className="mt-3 text-sm text-red-600">{copy.aiAnalysisFailed}: {visit.analysis_error}</p> : null}
            {failedImages.length > 0 ? (
              <div className="mt-3 space-y-2">
                {failedImages.map((image, index) => {
                  const systemError = image.analysis_error ?? image.error_message ?? "";
                  return (
                    <details key={image.id} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                      <summary className="cursor-pointer font-semibold">{text.systemError} {index + 1}</summary>
                      <pre className="mt-2 max-h-36 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-white p-2 text-[11px] text-slate-700">{systemError}</pre>
                      <button
                        type="button"
                        onClick={() => copySystemError(image.id, systemError)}
                        className="mt-2 inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2 text-xs font-semibold text-slate-700"
                      >
                        {copiedErrorId === image.id ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                        {copiedErrorId === image.id ? text.copiedSystemError : text.copySystemError}
                      </button>
                    </details>
                  );
                })}
              </div>
            ) : null}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 font-semibold">{text.priceParsing}</h2>
            {priceParseSections.length === 0 ? <EmptyLine text={text.noPriceResult} /> : null}
            <div className="space-y-4">
              {priceParseSections.map((section, index) => (
                <div key={section.image.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-bold">{text.photoPrefix}{index + 1}</div>
                      <div className="mt-1 text-xs text-slate-500">{mobileImageCategoryLabel(locale, section.category)}</div>
                    </div>
                    {section.signedImage?.url ? (
                      <button
                        type="button"
                        onClick={() => setActiveImage({ url: section.signedImage?.url as string, label: `${text.photoPrefix}${index + 1}` })}
                        className="h-16 w-16 overflow-hidden rounded-lg bg-slate-200"
                        aria-label={locale === "zh" ? "放大照片" : "Preview photo"}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={section.signedImage.url} alt={`${text.photoPrefix}${index + 1}`} className="h-full w-full object-cover" />
                      </button>
                    ) : null}
                  </div>
                  <div className="mt-3 space-y-2">
                    {section.result?.rows.length ? section.result.rows.map((row, rowIndex) => {
                      const {
                        package_price_idr: package_price,
                        net_price_idr: net_price,
                        promo_type,
                        piece_count,
                        price_per_piece_idr,
                      } = row;
                      return (
                        <div key={`${section.image.id}-${rowIndex}`} className="rounded-lg bg-white px-3 py-2 text-xs shadow-sm">
                          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
                            <div className="line-clamp-1 min-w-0 text-sm font-semibold leading-5 text-slate-900">{row.sku}</div>
                            {piece_count ? <div className="shrink-0 whitespace-nowrap text-[11px] font-medium leading-5 text-slate-500">pcs: {piece_count}</div> : null}
                          </div>
                          <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1">
                            <PriceMetricRow label={text.listPrice} value={formatMoney(package_price)} />
                            <PriceMetricRow label={text.promoType} value={promo_type || "-"} />
                            <PriceMetricRow label={text.netPrice} value={formatMoney(net_price)} />
                            <PriceMetricRow label={text.pricePerPiece} value={formatMoney(price_per_piece_idr)} />
                          </div>
                        </div>
                      );
                    }) : <EmptyLine text={text.noPriceRows} />}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 font-semibold">{text.displayAnalysis}</h2>
            {!displayAnalysis && displayImages.length === 0 ? <EmptyLine text={text.noDisplayImages} /> : null}
            {!displayAnalysis && displayImages.length > 0 ? <EmptyLine text={text.noDisplayResult} /> : null}
            {displayAnalysis ? (
              <div className="space-y-3">
                <p className="rounded-lg bg-slate-50 px-3 py-3 text-sm text-slate-700">{displayAnalysis.summary}</p>
                {displayAnalysis.observations.length > 0 ? (
                  <div className="space-y-2">
                    {displayAnalysis.observations.map((observation, index) => (
                      <div key={`${observation}-${index}`} className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
                        {observation}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
            {displayImages.length > 0 ? (
              <div className="mt-4 grid grid-cols-3 gap-3">
                {displayImages.map((item, index) => (
                  <button
                    key={item.image.id}
                    type="button"
                    onClick={() => item.signedImage?.url && setActiveImage({ url: item.signedImage.url, label: `${text.photoPrefix}${index + 1}` })}
                    className="aspect-square overflow-hidden rounded-xl bg-slate-100"
                    aria-label={locale === "zh" ? "放大照片" : "Preview photo"}
                  >
                    {item.signedImage?.url ? (
                      <>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={item.signedImage.url} alt={`${text.photoPrefix}${index + 1}`} className="h-full w-full object-cover" />
                      </>
                    ) : null}
                  </button>
                ))}
              </div>
            ) : null}
          </section>
        </div>
      ) : null}

      {!loading && !visit && !error ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500 shadow-sm">
          <div>{locale === "zh" ? "没有找到这条巡店记录。" : "This visit record could not be found."}</div>
          <button
            type="button"
            onClick={() => void loadVisit()}
            className="mt-4 inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white"
          >
            <RefreshCw className="h-4 w-4" />
            {locale === "zh" ? "重新加载" : "Reload"}
          </button>
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
              {text.close}
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
    </>
  );
}

function PriceMetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-baseline gap-1.5">
      <span className="shrink-0 text-[11px] text-slate-500">{label}</span>
      <span className="min-w-0 truncate text-[11px] font-semibold text-slate-900">{value}</span>
    </div>
  );
}

function EmptyLine({ text }: { text: string }) {
  return <div className="rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm text-slate-500">{text}</div>;
}

"use client";

import { ArrowLeft, Camera, Check, ChevronDown, ChevronRight, Copy, Ellipsis, Loader2, RefreshCw, Trash2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MutableRefObject } from "react";
import { withMinimumDelay } from "@/lib/async-ui";
import { formatIdr, formatShortImageId } from "@/lib/format";
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
  id?: string;
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

type LocalUploadState = {
  previewUrl: string;
  mode: "retake";
  status: "uploading" | "analyzing" | "upload_failed" | "analysis_failed";
  targetImageId?: string;
  uploadedImageId?: string;
  category: "makuku_shelf" | "competitor_shelf";
  error?: string;
};

type PriceParseSection = {
  image: OfflineVisitImage;
  signedImage: SignedVisitImage | null;
  category: "makuku_shelf" | "competitor_shelf";
  result: StoreVisitPriceImageAnalysis | null;
  isUpdated: boolean;
};

type ImageActionSheetState = {
  imageId: string;
  category: "makuku_shelf" | "competitor_shelf";
  label: string;
};

type DeleteConfirmState = {
  imageId: string;
  label: string;
};

type ReanalyzeConfirmState = {
  imageId: string;
  label: string;
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

function formatImageShortCode(value: string | null | undefined) {
  const shortCode = formatShortImageId(value);
  return shortCode === "-" ? shortCode : `ID: ${shortCode}`;
}

function textOrFallback(value: string | null | undefined, fallback: string) {
  const text = String(value ?? "").trim();
  return text ? text : fallback;
}

function isUpdatedImage(image: OfflineVisitImage) {
  if (!isRecord(image.vision_result)) return false;
  return (image.vision_result as Record<string, unknown>).is_retake === true;
}

function detailText(locale: Locale) {
  return locale === "zh"
    ? {
        batchCode: "拍照批次",
        priceParsing: "价格解析",
        displayAnalysis: "陈列解析",
        listPrice: "标价",
        promoType: "活动类型",
        netPrice: "到手价",
        pricePerPiece: "单片价",
        noPriceRows: "这张图片暂时没有可展示的价格结果。",
        noPriceResult: "暂无价格解析结果。",
        noDisplayResult: "暂无陈列解析结果。",
        noDisplayImages: "未上传门店陈列图片。",
        partialSuccess: "部分成功",
        businessAnalysisError: "部分图片未解析成功，已成功解析的价格可以先复核；失败图片可稍后重试。",
        systemError: "系统报错",
        copySystemError: "复制报错",
        copiedSystemError: "已复制",
        copySystemErrorFailed: "复制失败，请手动长按选中报错内容。",
        photoPrefix: "照片",
        close: "关闭",
        retake: "重拍",
        updateThisPhoto: "更新这张",
        updated: "已更新",
        refreshingOne: "本张识别结果已刷新",
        uploading: "上传中",
        analyzingOne: "识别中",
        retryUpload: "重试上传",
        retryAnalysis: "重试识别",
        retakeAgain: "再次重拍",
        previewPhoto: "预览照片",
        expandPhoto: "放大照片",
        failedNeedsUpdate: "识别失败，请更新这张照片",
      }
    : {
        batchCode: "Batch code",
        priceParsing: "Price Parsing",
        displayAnalysis: "Store Display",
        listPrice: "List Price",
        promoType: "Activity Type",
        netPrice: "Net Price",
        pricePerPiece: "Per Piece",
        noPriceRows: "No readable price rows for this image yet.",
        noPriceResult: "No price parsing result yet.",
        noDisplayResult: "Store Display photos are stored only in 1.0.",
        noDisplayImages: "No Store Display photos uploaded.",
        partialSuccess: "Partial success",
        businessAnalysisError: "Some photos were not parsed. Parsed prices can be reviewed first; failed photos can be retried later.",
        systemError: "System error",
        copySystemError: "Copy error",
        copiedSystemError: "Copied",
        copySystemErrorFailed: "Copy failed. Please long-press and select the error text manually.",
        photoPrefix: "Photo",
        close: "Close",
        retake: "Retake",
        updateThisPhoto: "Update Photo",
        updated: "Updated",
        refreshingOne: "This photo result has been refreshed",
        uploading: "Uploading",
        analyzingOne: "Analyzing",
        retryUpload: "Retry upload",
        retryAnalysis: "Retry analysis",
        analysisFailed: "Analysis failed",
        reAnalyze: "Re-analyze",
        confirmReanalyzeTitle: "Re-analyze this photo?",
        confirmReanalyzeDescription: "This will rerun AI analysis for this single photo. Existing linked price snapshots from this photo may be refreshed.",
        confirmReanalyzeAction: "Confirm Re-analyze",
        reanalyzing: "Re-analyzing...",
        delete: "Delete",
        confirmDeleteTitle: "Delete this photo?",
        confirmDeleteDescription: "This will remove the photo from H5 and delete its linked price snapshots. This action cannot be undone.",
        confirmDeleteAction: "Confirm Delete",
        deleting: "Deleting...",
        deleteResult: "Photo deleted. {count} linked price snapshot(s) removed.",
        deleteResultUnknown: "Photo deleted.",
        deleteRefreshFailed: "Delete request succeeded, but the page did not confirm the removal. Please refresh and verify.",
        photoActions: "Photo actions",
        deleteSuccess: "This photo has been deleted.",
        retakeAgain: "Retake again",
        previewPhoto: "Preview photo",
        expandPhoto: "Preview photo",
        failedNeedsUpdate: "Analysis failed. Update this photo to continue.",
      };
}

export function StoreVisitDetailH5({ locale, id }: { locale: Locale; id: string }) {
  const copy = getMobileCopy(locale);
  const text = detailText(locale);
  const confirmReanalyzeTitle = textOrFallback(text.confirmReanalyzeTitle, locale === "zh" ? "确认重新识别这张照片？" : "Re-analyze this photo?");
  const confirmReanalyzeDescription = textOrFallback(text.confirmReanalyzeDescription, locale === "zh" ? "这会只重跑当前这张照片的 AI 识别，并刷新它关联的价格结果。" : "This will rerun AI analysis for this single photo. Existing linked price snapshots from this photo may be refreshed.");
  const confirmReanalyzeActionLabel = textOrFallback(text.confirmReanalyzeAction, locale === "zh" ? "确认重新识别" : "Confirm Re-analyze");
  const reanalyzingLabel = textOrFallback(text.reanalyzing, locale === "zh" ? "重新识别中..." : "Re-analyzing...");
  const confirmDeleteTitle = textOrFallback(text.confirmDeleteTitle, locale === "zh" ? "确认删除这张照片？" : "Delete this photo?");
  const confirmDeleteDescription = textOrFallback(text.confirmDeleteDescription, locale === "zh" ? "删除后，H5 和关联的价格快照都会同步删除，且不可恢复。" : "This will remove the photo from H5 and delete its linked price snapshots. This action cannot be undone.");
  const confirmDeleteActionLabel = textOrFallback(text.confirmDeleteAction, locale === "zh" ? "确认删除" : "Confirm Delete");
  const deletingLabel = textOrFallback(text.deleting, locale === "zh" ? "删除中..." : "Deleting...");
  const photoActionsLabel = textOrFallback(text.photoActions, locale === "zh" ? "照片操作" : "Photo actions");
  const reAnalyzeLabel = textOrFallback(text.reAnalyze, locale === "zh" ? "重新识别" : "Re-analyze");
  const deleteLabel = textOrFallback(text.delete, locale === "zh" ? "删除" : "Delete");
  const [visit, setVisit] = useState<StoreVisitDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisPhase, setAnalysisPhase] = useState<"idle" | "running" | "refreshing">("idle");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [activeImage, setActiveImage] = useState<{ url: string; label: string } | null>(null);
  const [copiedErrorId, setCopiedErrorId] = useState<string | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<"makuku_shelf" | "competitor_shelf", boolean>>({
    makuku_shelf: false,
    competitor_shelf: false,
  });
  const [localUploads, setLocalUploads] = useState<Record<string, LocalUploadState>>({});
  const [updatedImageIds, setUpdatedImageIds] = useState<string[]>([]);
  const [retryingImageIds, setRetryingImageIds] = useState<string[]>([]);
  const [deletingImageIds, setDeletingImageIds] = useState<string[]>([]);
  const [actionSheet, setActionSheet] = useState<ImageActionSheetState | null>(null);
  const [reanalyzeConfirm, setReanalyzeConfirm] = useState<ReanalyzeConfirmState | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirmState | null>(null);
  const retakeInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const loadVisit = useCallback(async (options?: { preserveLoading?: boolean }) => {
    if (!options?.preserveLoading) setLoading(true);
    setError(null);
    try {
      const res = await withMinimumDelay(fetch(`/api/store-visit/${id}`), 300);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? copy.loadVisitFailed);
        return null;
      }
      setVisit(data.visit);
      return data.visit as StoreVisitDetail;
    } catch {
      setError(copy.networkRetry);
      return null;
    } finally {
      if (!options?.preserveLoading) setLoading(false);
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
      await loadVisit({ preserveLoading: true });
    } catch {
      setError(copy.aiAnalysisFailed);
      await loadVisit({ preserveLoading: true });
    } finally {
      setAnalyzing(false);
      setAnalysisPhase("idle");
    }
  }

  const status = visit?.analysis_status ?? "pending";
  const retryable = canRetryAnalysis(status, visit?.visit_status);
  const failedImages = (visit?.offline_visit_images ?? []).filter((image) => image.analysis_status === "failed" && (image.analysis_error || image.error_message));
  const canRunAnalysis = status === "pending" || (retryable && failedImages.length === 0);
  const updateLocked = analysisPhase !== "idle";
  const signedImagesByPath = useMemo(
    () => new Map((visit?.signed_images ?? []).map((image) => [image.path, image] as const)),
    [visit?.signed_images],
  );

  const priceParseSections = useMemo(() => {
    const sections: PriceParseSection[] = [];
    for (const image of visit?.offline_visit_images ?? []) {
      const signedImage = signedImagesByPath.get(image.image_path) ?? null;
      const category = uploadCategoryForImage(image, signedImage);
      if (category !== "makuku_shelf" && category !== "competitor_shelf") continue;
      sections.push({
        image,
        signedImage,
        category,
        result: asPriceImageAnalysis(image.vision_result),
        isUpdated: updatedImageIds.includes(image.id) || isUpdatedImage(image),
      });
    }
    return sections;
  }, [signedImagesByPath, updatedImageIds, visit?.offline_visit_images]);

  const groupedPriceSections = useMemo(() => ({
    makuku_shelf: priceParseSections.filter((section) => section.category === "makuku_shelf"),
    competitor_shelf: priceParseSections.filter((section) => section.category === "competitor_shelf"),
  }), [priceParseSections]);

  const displayImages = (visit?.offline_visit_images ?? [])
    .map((image) => ({
      image,
      signedImage: signedImagesByPath.get(image.image_path) ?? null,
    }))
    .filter((item) => uploadCategoryForImage(item.image, item.signedImage) === "storefront");
  const displayAnalysis = asDisplayAnalysis(visit?.summary_result && isRecord(visit.summary_result) ? visit.summary_result.display_analysis : null);
  async function copySystemError(imageId: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedErrorId(imageId);
      window.setTimeout(() => setCopiedErrorId((current) => (current === imageId ? null : current)), 1600);
    } catch {
      setError(text.copySystemErrorFailed);
    }
  }

  async function retryExistingImageAnalysis(imageId: string) {
    setRetryingImageIds((current) => Array.from(new Set([...current, imageId])));
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/store-visit/${id}/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ affected_image_ids: [imageId] }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error ?? copy.aiAnalysisFailed);
      }
      await loadVisit({ preserveLoading: true });
      setNotice(locale === "zh" ? "已提交重试，后台分析中。" : "Retry submitted. Analysis is running in the background.");
    } catch (retryError) {
      setError(retryError instanceof Error ? retryError.message : copy.networkRetry);
    } finally {
      setRetryingImageIds((current) => current.filter((currentId) => currentId !== imageId));
    }
  }

  async function deleteExistingImage(imageId: string) {
    setDeletingImageIds((current) => Array.from(new Set([...current, imageId])));
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/store-visit/${id}/images`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_id: imageId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error ?? copy.networkRetry);
      }
      const refreshedVisit = await loadVisit({ preserveLoading: true });
      const imageStillExists = Array.isArray(refreshedVisit?.offline_visit_images)
        ? refreshedVisit.offline_visit_images.some((image) => image.id === imageId)
        : false;
      if (imageStillExists) {
        throw new Error(text.deleteRefreshFailed ?? copy.networkRetry);
      }
      setUpdatedImageIds((current) => current.filter((currentId) => currentId !== imageId));
      const deletedSnapshotCount = Number(data.deleted_snapshot_count ?? 0);
      if (deletedSnapshotCount > 0) {
        setNotice((text.deleteResult ?? "Photo deleted. {count} linked price snapshot(s) removed.").replace("{count}", String(deletedSnapshotCount)));
      } else {
        setNotice(text.deleteResultUnknown ?? text.deleteSuccess ?? null);
      }
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : copy.networkRetry);
    } finally {
      setDeletingImageIds((current) => current.filter((currentId) => currentId !== imageId));
    }
  }

  async function uploadPricePhoto(params: {
    file: File;
    category: "makuku_shelf" | "competitor_shelf";
    targetImageId: string;
  }) {
    const tempKey = params.targetImageId;
    const previewUrl = URL.createObjectURL(params.file);
    setLocalUploads((current) => ({
      ...current,
      [tempKey]: {
        previewUrl,
        category: params.category,
        mode: "retake",
        status: "uploading",
        targetImageId: params.targetImageId,
      },
    }));

    try {
      const formData = new FormData();
      formData.set("image", params.file);
      formData.set("image_category", params.category);
      if (params.targetImageId) formData.set("replaces_image_id", params.targetImageId);

      const uploadRes = await fetch(`/api/store-visit/${id}/images`, {
        method: "POST",
        body: formData,
      });
      const uploadData = await uploadRes.json().catch(() => ({}));
      if (!uploadRes.ok || !uploadData.image?.id) {
        throw new Error(uploadData.error ?? copy.networkRetry);
      }
      const uploadedImageId = String(uploadData.image.id);

      setLocalUploads((current) => ({
        ...current,
        [tempKey]: {
          ...current[tempKey],
          status: "analyzing",
          uploadedImageId,
        },
      }));

      await retryPricePhotoAnalysis({
        tempKey,
        uploadedImageId,
        preservePreview: true,
        mode: "retake",
      });
    } catch (uploadError) {
      const message = uploadError instanceof Error ? uploadError.message : copy.networkRetry;
      setLocalUploads((current) => ({
        ...current,
        [tempKey]: {
          ...current[tempKey],
          status: current[tempKey]?.uploadedImageId ? "analysis_failed" : "upload_failed",
          error: message,
        },
      }));
      setError(message);
    }
  }

  async function retryPricePhotoAnalysis(params: {
    tempKey: string;
    uploadedImageId: string;
    preservePreview?: boolean;
    mode?: "retake";
  }) {
    try {
      const analyzeRes = await fetch(`/api/store-visit/${id}/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ affected_image_ids: [params.uploadedImageId] }),
      });
      const analyzeData = await analyzeRes.json().catch(() => ({}));
      if (!analyzeRes.ok) {
        throw new Error(analyzeData.error ?? copy.aiAnalysisFailed);
      }

      const refreshedVisit = await loadVisit({ preserveLoading: true });
      if (refreshedVisit) {
        setUpdatedImageIds((current) => Array.from(new Set([...current, params.uploadedImageId])));
      }
      if (params.mode === "retake") {
        setLocalUploads((current) => {
          const next = { ...current };
          delete next[params.tempKey];
          return next;
        });
      }
    } catch (analysisError) {
      const message = analysisError instanceof Error ? analysisError.message : copy.networkRetry;
      if (params.mode === "retake") {
        setLocalUploads((current) => ({
          ...current,
          [params.tempKey]: {
            ...current[params.tempKey],
            status: "analysis_failed",
            error: message,
          },
        }));
      }
      setError(message);
    }
  }

  useEffect(() => () => {
    Object.values(localUploads).forEach((item) => URL.revokeObjectURL(item.previewUrl));
  }, [localUploads]);

  useEffect(() => {
    if (!notice) return undefined;
    const timeout = window.setTimeout(() => setNotice(null), 2200);
    return () => window.clearTimeout(timeout);
  }, [notice]);

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
        {notice ? <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</div> : null}

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
                <div className="flex items-center gap-2">
                  {canRunAnalysis ? (
                    <button type="button" onClick={analyze} disabled={analyzing || status === "analyzing"} className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-3 text-sm font-bold text-white disabled:opacity-60">
                      {analyzing || status === "analyzing" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                      {retryable ? copy.retryAnalyze : copy.analyzeStore}
                    </button>
                  ) : null}
                </div>
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
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="font-semibold">{text.priceParsing}</h2>
              </div>
              {priceParseSections.length === 0 ? <EmptyLine text={text.noPriceResult} /> : null}

              <div className="space-y-5">
                <PriceSectionGroup
                  locale={locale}
                  title={mobileImageCategoryLabel(locale, "makuku_shelf")}
                  category="makuku_shelf"
                  sections={groupedPriceSections.makuku_shelf}
                  collapsed={collapsedGroups.makuku_shelf}
                  onToggleCollapsed={() => setCollapsedGroups((current) => ({ ...current, makuku_shelf: !current.makuku_shelf }))}
                  updateLocked={updateLocked}
                  text={text}
                  localUploadsByImageId={localUploads}
                  onPreview={setActiveImage}
                  deletingImageIds={deletingImageIds}
                  retryingImageIds={retryingImageIds}
                  onOpenActions={(imageId, imageCategory, label) => setActionSheet({ imageId, category: imageCategory, label })}
                  onRetakeFile={(imageId, file) => void uploadPricePhoto({ file, category: "makuku_shelf", targetImageId: imageId })}
                  retakeInputRefs={retakeInputRefs}
                />

                <PriceSectionGroup
                  locale={locale}
                  title={mobileImageCategoryLabel(locale, "competitor_shelf")}
                  category="competitor_shelf"
                  sections={groupedPriceSections.competitor_shelf}
                  collapsed={collapsedGroups.competitor_shelf}
                  onToggleCollapsed={() => setCollapsedGroups((current) => ({ ...current, competitor_shelf: !current.competitor_shelf }))}
                  updateLocked={updateLocked}
                  text={text}
                  localUploadsByImageId={localUploads}
                  onPreview={setActiveImage}
                  deletingImageIds={deletingImageIds}
                  retryingImageIds={retryingImageIds}
                  onOpenActions={(imageId, imageCategory, label) => setActionSheet({ imageId, category: imageCategory, label })}
                  onRetakeFile={(imageId, file) => void uploadPricePhoto({ file, category: "competitor_shelf", targetImageId: imageId })}
                  retakeInputRefs={retakeInputRefs}
                />
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
                      aria-label={text.previewPhoto}
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

        {actionSheet ? (
          <div className="fixed inset-0 z-[60] flex items-end bg-slate-950/45" role="dialog" aria-modal="true" onClick={() => setActionSheet(null)}>
            <div className="w-full rounded-t-3xl bg-white px-4 pb-6 pt-4 shadow-2xl" onClick={(event) => event.stopPropagation()}>
              <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-slate-200" />
              <div className="text-sm font-semibold text-slate-900">{actionSheet.label}</div>
              <div className="mt-1 text-xs text-slate-500">{photoActionsLabel}</div>
              <div className="mt-4 space-y-2">
                <button
                  type="button"
                  disabled={updateLocked}
                  onClick={() => {
                    setActionSheet(null);
                    retakeInputRefs.current[actionSheet.imageId]?.click();
                  }}
                  className="flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left text-sm font-medium text-slate-800 disabled:opacity-50"
                >
                  <span>{text.retake}</span>
                  <Camera className="h-4 w-4 text-slate-400" />
                </button>
                <button
                  type="button"
                  disabled={updateLocked || retryingImageIds.includes(actionSheet.imageId)}
                  onClick={() => {
                    const imageId = actionSheet.imageId;
                    const label = actionSheet.label;
                    setActionSheet(null);
                    setReanalyzeConfirm({ imageId, label });
                  }}
                  className="flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left text-sm font-medium text-slate-800 disabled:opacity-50"
                >
                  <span>{reAnalyzeLabel}</span>
                  {retryingImageIds.includes(actionSheet.imageId) ? <Loader2 className="h-4 w-4 animate-spin text-slate-400" /> : <RefreshCw className="h-4 w-4 text-slate-400" />}
                </button>
                <button
                  type="button"
                  disabled={updateLocked || deletingImageIds.includes(actionSheet.imageId)}
                  onClick={() => {
                    const imageId = actionSheet.imageId;
                    const label = actionSheet.label;
                    setActionSheet(null);
                    setDeleteConfirm({ imageId, label });
                  }}
                  className="flex w-full items-center justify-between rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-left text-sm font-medium text-red-700 disabled:opacity-50"
                >
                  <span>{deleteLabel}</span>
                  {deletingImageIds.includes(actionSheet.imageId) ? <Loader2 className="h-4 w-4 animate-spin text-red-400" /> : <Trash2 className="h-4 w-4 text-red-400" />}
                </button>
              </div>
              <button
                type="button"
                onClick={() => setActionSheet(null)}
                className="mt-3 flex w-full items-center justify-center rounded-2xl bg-slate-100 px-4 py-3 text-sm font-medium text-slate-700"
              >
                {text.close}
              </button>
            </div>
          </div>
        ) : null}

        {reanalyzeConfirm ? (
          <div
            className="fixed inset-0 z-[64] flex items-end bg-slate-950/45"
            role="dialog"
            aria-modal="true"
            onClick={() => {
              if (!retryingImageIds.includes(reanalyzeConfirm.imageId)) setReanalyzeConfirm(null);
            }}
          >
            <div className="w-full rounded-t-3xl bg-white px-4 pb-6 pt-4 shadow-2xl" onClick={(event) => event.stopPropagation()}>
              <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-slate-200" />
              <div className="text-sm font-semibold text-slate-900">{reanalyzeConfirm.label}</div>
              <div className="mt-1 text-sm font-semibold text-slate-900">{confirmReanalyzeTitle}</div>
              <div className="mt-2 text-sm leading-6 text-slate-600">{confirmReanalyzeDescription}</div>
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  disabled={retryingImageIds.includes(reanalyzeConfirm.imageId)}
                  onClick={() => {
                    void retryExistingImageAnalysis(reanalyzeConfirm.imageId).then(() => {
                      setReanalyzeConfirm((current) => current?.imageId === reanalyzeConfirm.imageId ? null : current);
                    });
                  }}
                  className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {retryingImageIds.includes(reanalyzeConfirm.imageId) ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  {retryingImageIds.includes(reanalyzeConfirm.imageId) ? reanalyzingLabel : confirmReanalyzeActionLabel}
                </button>
                <button
                  type="button"
                  disabled={retryingImageIds.includes(reanalyzeConfirm.imageId)}
                  onClick={() => setReanalyzeConfirm(null)}
                  className="flex flex-1 items-center justify-center rounded-2xl bg-slate-100 px-4 py-3 text-sm font-medium text-slate-700 disabled:opacity-60"
                >
                  {text.close}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {deleteConfirm ? (
          <div
            className="fixed inset-0 z-[65] flex items-end bg-slate-950/45"
            role="dialog"
            aria-modal="true"
            onClick={() => {
              if (!deletingImageIds.includes(deleteConfirm.imageId)) setDeleteConfirm(null);
            }}
          >
            <div className="w-full rounded-t-3xl bg-white px-4 pb-6 pt-4 shadow-2xl" onClick={(event) => event.stopPropagation()}>
              <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-slate-200" />
              <div className="text-sm font-semibold text-slate-900">{deleteConfirm.label}</div>
              <div className="mt-1 text-sm font-semibold text-red-700">{confirmDeleteTitle}</div>
              <div className="mt-2 text-sm leading-6 text-slate-600">{confirmDeleteDescription}</div>
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  disabled={deletingImageIds.includes(deleteConfirm.imageId)}
                  onClick={() => {
                    void deleteExistingImage(deleteConfirm.imageId).then(() => {
                      setDeleteConfirm((current) => current?.imageId === deleteConfirm.imageId ? null : current);
                    });
                  }}
                  className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-red-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {deletingImageIds.includes(deleteConfirm.imageId) ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  {deletingImageIds.includes(deleteConfirm.imageId) ? deletingLabel : confirmDeleteActionLabel}
                </button>
                <button
                  type="button"
                  disabled={deletingImageIds.includes(deleteConfirm.imageId)}
                  onClick={() => setDeleteConfirm(null)}
                  className="flex flex-1 items-center justify-center rounded-2xl bg-slate-100 px-4 py-3 text-sm font-medium text-slate-700 disabled:opacity-60"
                >
                  {text.close}
                </button>
              </div>
            </div>
          </div>
        ) : null}

      </main>
    </>
  );
}

function PriceSectionGroup({
  locale,
  title,
  category,
  sections,
  collapsed,
  onToggleCollapsed,
  updateLocked,
  text,
  localUploadsByImageId,
  deletingImageIds,
  retryingImageIds,
  onPreview,
  onOpenActions,
  onRetakeFile,
  retakeInputRefs,
}: {
  locale: Locale;
  title: string;
  category: "makuku_shelf" | "competitor_shelf";
  sections: PriceParseSection[];
  collapsed: boolean;
  onToggleCollapsed: () => void;
  updateLocked: boolean;
  text: ReturnType<typeof detailText>;
  localUploadsByImageId: Record<string, LocalUploadState>;
  deletingImageIds: string[];
  retryingImageIds: string[];
  onPreview: (image: { url: string; label: string }) => void;
  onOpenActions: (imageId: string, category: "makuku_shelf" | "competitor_shelf", label: string) => void;
  onRetakeFile: (imageId: string, file: File) => void;
  retakeInputRefs: MutableRefObject<Record<string, HTMLInputElement | null>>;
}) {
  const photoActionsLabel = textOrFallback(text.photoActions, locale === "zh" ? "照片操作" : "Photo actions");

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <button type="button" onClick={onToggleCollapsed} className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700">
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          {title}
          <span className="text-xs font-medium text-slate-400">{sections.length}</span>
        </button>
      </div>
      {collapsed ? null : (
        <>
      {sections.length === 0 ? <EmptyLine text={text.noPriceResult} /> : null}
      {sections.map((section, index) => (
        <div key={section.image.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          {(() => {
            const sectionLocalUpload = localUploadsByImageId[section.image.id];
            const previewUrl = sectionLocalUpload?.previewUrl ?? section.signedImage?.url ?? null;
            const isProcessingRetake = sectionLocalUpload?.mode === "retake";
            const isAnalyzingImage = section.image.analysis_status === "analyzing";
            const isActionDisabled = updateLocked || isAnalyzingImage || retryingImageIds.includes(section.image.id) || deletingImageIds.includes(section.image.id);

            return (
              <>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <div className="text-sm font-bold leading-5">{text.photoPrefix}{index + 1}</div>
                {section.isUpdated ? (
                  <span className="rounded-full bg-emerald-100 px-2 py-[1px] text-[10px] font-semibold leading-5 text-emerald-700">{text.updated}</span>
                ) : null}
                {isProcessingRetake ? (
                  <span className="rounded-full border border-blue-200 bg-blue-50/80 px-1.5 py-[1px] text-[10px] font-medium leading-5 text-blue-700">
                    {sectionLocalUpload.status === "upload_failed"
                      ? text.retake
                      : sectionLocalUpload.status === "uploading"
                        ? text.uploading
                        : text.analyzingOne}
                  </span>
                ) : (
                  <button
                    type="button"
                    disabled={isActionDisabled}
                    onClick={() => onOpenActions(section.image.id, category, `${text.photoPrefix}${index + 1}`)}
                    className="inline-flex h-5 items-center justify-center rounded-full border border-slate-200 bg-white px-1.5 text-slate-500 disabled:opacity-50"
                    aria-label={photoActionsLabel}
                  >
                    <Ellipsis className="h-3 w-3" />
                  </button>
                )}
                <input
                  ref={(node) => { retakeInputRefs.current[section.image.id] = node; }}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="sr-only"
                  disabled={updateLocked || isAnalyzingImage}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) onRetakeFile(section.image.id, file);
                    event.currentTarget.value = "";
                  }}
                />
              </div>
              <div className="mt-1 text-xs text-slate-500">{formatImageShortCode(section.image.id)}</div>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                {section.isUpdated ? (
                  <span className="rounded-full bg-emerald-100 px-2 py-[1px] text-[10px] font-semibold leading-5 text-emerald-700">
                    {text.refreshingOne}
                  </span>
                ) : null}
                {isAnalyzingImage && !isProcessingRetake ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-[1px] text-[10px] font-semibold leading-5 text-blue-700">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    {text.analyzingOne}
                  </span>
                ) : null}
                {section.image.analysis_status === "failed" && !isProcessingRetake ? (
                  <span className="rounded-full bg-amber-100 px-2 py-[1px] text-[10px] font-semibold leading-5 text-amber-700">
                    {text.analysisFailed}
                  </span>
                ) : null}
                {isProcessingRetake && sectionLocalUpload.error ? (
                  <span className="rounded-full bg-red-100 px-2 py-[1px] text-[10px] font-semibold leading-5 text-red-700">
                    {sectionLocalUpload.error}
                  </span>
                ) : null}
              </div>
            </div>
            <div className="flex items-start gap-2">
              {previewUrl ? (
                <button
                  type="button"
                  onClick={() => onPreview({ url: previewUrl, label: `${text.photoPrefix}${index + 1}` })}
                  className="h-16 w-16 overflow-hidden rounded-lg bg-slate-200"
                  aria-label={text.expandPhoto}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={previewUrl} alt={`${text.photoPrefix}${index + 1}`} className={`h-full w-full object-cover ${isProcessingRetake ? "opacity-80" : ""}`} />
                </button>
              ) : null}
            </div>
          </div>
          {isProcessingRetake && (sectionLocalUpload.status === "uploading" || sectionLocalUpload.status === "analyzing") ? (
            <div className="mt-3 inline-flex items-center gap-2 text-xs font-medium text-slate-700">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {sectionLocalUpload.status === "uploading" ? text.uploading : text.analyzingOne}
            </div>
          ) : null}

          <div className="mt-3 space-y-2">
            {section.result?.rows.length ? section.result.rows.map((row, rowIndex) => {
              const {
                package_price_idr: packagePrice,
                net_price_idr: netPrice,
                promo_type: promoType,
                piece_count: pieceCount,
                price_per_piece_idr: pricePerPiece,
              } = row;
              return (
                <div key={`${section.image.id}-${rowIndex}`} className="rounded-lg bg-white px-3 py-2 text-xs shadow-sm">
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
                    <div className="line-clamp-1 min-w-0 text-sm font-semibold leading-5 text-slate-900">{row.sku}</div>
                    {pieceCount ? <div className="shrink-0 whitespace-nowrap text-[11px] font-medium leading-5 text-slate-500">pcs: {pieceCount}</div> : null}
                  </div>
                  <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1">
                    <PriceMetricRow label={text.listPrice} value={formatMoney(packagePrice)} />
                    <PriceMetricRow label={text.promoType} value={promoType || "-"} />
                    <PriceMetricRow label={text.netPrice} value={formatMoney(netPrice)} />
                    <PriceMetricRow label={text.pricePerPiece} value={formatMoney(pricePerPiece)} />
                  </div>
                </div>
              );
            }) : <EmptyLine text={text.noPriceRows} />}
          </div>
              </>
            );
          })()}
        </div>
      ))}

        </>
      )}
    </div>
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

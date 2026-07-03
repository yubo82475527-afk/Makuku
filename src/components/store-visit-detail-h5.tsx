"use client";

import { ArrowLeft, Camera, Check, ChevronDown, ChevronRight, Copy, Ellipsis, Image as ImageIcon, Loader2, RefreshCw, RotateCcw, Search, Trash2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { withMinimumDelay } from "@/lib/async-ui";
import { formatIdr, formatShortImageId } from "@/lib/format";
import type { Locale } from "@/lib/i18n/config";
import { getMobileCopy, mobileAnalysisStatusLabel, mobileImageCategoryLabel } from "@/lib/mobile-i18n";
import type {
  AiPriceCandidate,
  AiPriceCandidateMatchType,
  CompetitorProduct,
  MaterialMaster,
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
  analysis_status?: "pending" | "analyzing" | "completed" | "partial" | "action_required" | "failed" | null;
  analysis_error?: string | null;
  summary_result?: Record<string, unknown> | null;
  offline_visit_images?: OfflineVisitImage[];
  signed_images?: SignedVisitImage[];
  ai_price_candidates?: AiPriceCandidate[];
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

type MatchOptionState = {
  materials: MaterialMaster[];
  products: CompetitorProduct[];
};

type RowEditState = {
  imageId: string;
  rowIndex: number;
  sku: string;
  candidateId: string | null;
  netPrice: string;
  pieceCount: string;
  matchedEntityType: AiPriceCandidateMatchType;
  matchedEntityId: string;
  selectedMatchLabel: string;
  matchSearchQuery: string;
  originalMatchedEntityType: AiPriceCandidateMatchType;
  originalMatchedEntityId: string;
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

const maxUploadBytes = 20 * 1024 * 1024;
const compressionMaxSide = 3000;
const compressionQuality = 0.9;

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

function formatMb(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

function loadImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Unable to read image"));
    };
    image.src = url;
  });
}

async function prepareImageForUpload(file: File) {
  if (!file.type.startsWith("image/")) {
    throw new Error(`${file.name} is not an image.`);
  }
  if (file.size <= maxUploadBytes) return file;

  const image = await loadImage(file);
  const scale = Math.min(1, compressionMaxSide / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Image compression is not available in this browser.");
  ctx.drawImage(image, 0, 0, width, height);

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, "image/jpeg", compressionQuality);
  });
  if (!blob) throw new Error("Image compression failed.");

  const safeName = file.name.replace(/\.[^.]+$/, "") || "store-photo";
  return new File([blob], `${safeName}.jpg`, {
    type: "image/jpeg",
    lastModified: Date.now(),
  });
}

function textOrFallback(value: string | null | undefined, fallback: string) {
  const text = String(value ?? "").trim();
  return text ? text : fallback;
}

function isUpdatedImage(image: OfflineVisitImage) {
  if (!isRecord(image.vision_result)) return false;
  return (image.vision_result as Record<string, unknown>).is_retake === true;
}

function isRetakeRequiredPriceImage(image: OfflineVisitImage) {
  if (!isRecord(image.vision_result)) return false;
  const photoQuality = (image.vision_result as Record<string, unknown>).photo_quality;
  return isRecord(photoQuality) && photoQuality.status === "retake_required";
}

function retakeRequiredMessage(image: OfflineVisitImage, fallback: string) {
  if (!isRecord(image.vision_result)) return fallback;
  const photoQuality = (image.vision_result as Record<string, unknown>).photo_quality;
  if (!isRecord(photoQuality)) return fallback;
  const message = String(photoQuality.message ?? "").trim();
  return message || fallback;
}

function normalizeMatchText(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase();
}

function candidateDisplayPieceCount(candidate: AiPriceCandidate | null, fallback: number | null | undefined) {
  return candidate?.reviewed_piece_count ?? candidate?.piece_count ?? fallback ?? null;
}

function candidateDisplayPricePerPiece(candidate: AiPriceCandidate | null, fallback: number | null | undefined) {
  return candidate?.reviewed_price_per_piece ?? candidate?.price_per_piece ?? fallback ?? null;
}

function candidateMatchDisplay(candidate: AiPriceCandidate | null) {
  const label = String(candidate?.matched_sku_label ?? candidate?.matched_label ?? candidate?.matched_entity_id ?? "").trim();
  const matched = Boolean(candidate && candidate.matched_entity_type !== "unmatched" && candidate.matched_entity_id && label);
  return { matched, label };
}

function matchCandidateForRow(
  candidates: AiPriceCandidate[],
  imageId: string,
  row: StoreVisitPriceImageAnalysis["rows"][number],
) {
  const normalizedSku = normalizeMatchText(row.sku);
  const rowPieceCount = row.piece_count ?? null;
  const rowNetPrice = row.net_price_idr ?? null;
  const sameRowCandidates = candidates.filter((candidate) => (
    candidate.source_image_id === imageId
    && normalizeMatchText(candidate.raw_product) === normalizedSku
  ));
  if (sameRowCandidates.length === 0) return null;

  return sameRowCandidates
    .sort((a, b) => {
      const aPieceMatch = candidateDisplayPieceCount(a, row.piece_count) === rowPieceCount ? 1 : 0;
      const bPieceMatch = candidateDisplayPieceCount(b, row.piece_count) === rowPieceCount ? 1 : 0;
      if (aPieceMatch !== bPieceMatch) return bPieceMatch - aPieceMatch;

      const aPriceMatch = (a.net_price_idr ?? a.parsed_price_idr ?? null) === rowNetPrice ? 1 : 0;
      const bPriceMatch = (b.net_price_idr ?? b.parsed_price_idr ?? null) === rowNetPrice ? 1 : 0;
      if (aPriceMatch !== bPriceMatch) return bPriceMatch - aPriceMatch;

      const aHasMatch = a.matched_entity_type !== "unmatched" && Boolean(a.matched_entity_id) ? 1 : 0;
      const bHasMatch = b.matched_entity_type !== "unmatched" && Boolean(b.matched_entity_id) ? 1 : 0;
      if (aHasMatch !== bHasMatch) return bHasMatch - aHasMatch;

      const aApproved = a.status === "approved" ? 1 : 0;
      const bApproved = b.status === "approved" ? 1 : 0;
      if (aApproved !== bApproved) return bApproved - aApproved;

      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    })[0] ?? null;
}

function materialOptionValue(item: MaterialMaster | null | undefined) {
  const value = String(item?.tenant_sku_code ?? "").trim();
  return value || null;
}

function competitorOptionValue(item: CompetitorProduct | null | undefined) {
  const value = String(item?.id ?? "").trim();
  return value || null;
}

function formatMaterialOptionLabel(item: MaterialMaster | null | undefined) {
  const value = materialOptionValue(item);
  if (!value) return null;
  return [value, item?.tenant_sku_name].filter(Boolean).join(" / ");
}

function formatCompetitorOptionLabel(item: CompetitorProduct | null | undefined) {
  const value = competitorOptionValue(item);
  if (!value) return null;
  return [item?.brands?.name, item?.normalized_name].filter(Boolean).join(" / ");
}

function filterValidMatchOptions(options: Array<MaterialMaster | CompetitorProduct | null | undefined>) {
  return options.filter((item): item is MaterialMaster | CompetitorProduct => (
    Boolean(materialOptionValue(item as MaterialMaster) || competitorOptionValue(item as CompetitorProduct))
  ));
}

function normalizeSkuSearchText(value: string | null | undefined) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function fuzzyMatchSkuOption(label: string, query: string) {
  const normalizedLabel = normalizeSkuSearchText(label);
  const normalizedQuery = normalizeSkuSearchText(query);
  if (!normalizedQuery) return true;
  return normalizedQuery.split(/\s+/).every((token) => normalizedLabel.includes(token));
}

function resolveMatchLabel(rowEdit: RowEditState, matchOptions: MatchOptionState) {
  if (rowEdit.matchedEntityType === "material_master") {
    return formatMaterialOptionLabel(matchOptions.materials.find((item) => materialOptionValue(item) === rowEdit.matchedEntityId))
      ?? (rowEdit.selectedMatchLabel || null);
  }
  if (rowEdit.matchedEntityType === "competitor_product") {
    return formatCompetitorOptionLabel(matchOptions.products.find((item) => competitorOptionValue(item) === rowEdit.matchedEntityId))
      ?? (rowEdit.selectedMatchLabel || null);
  }
  return null;
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
        pieceCount: "Pcs",
        editRow: "Edit",
        rowUnmatched: "未匹配",
        rowEditorTitle: "修改价格",
        skuMatch: "SKU Match",
        save: "保存",
        cancel: "取消",
        unmatched: "Unmatched",
        matchTypeOwn: "Makuku SKU",
        matchTypeCompetitor: "Competitor SKU",
        matchTypeNone: "Unmatched",
        searchMatch: "搜索 SKU Match",
        saveRowFailed: "保存失败",
        loadingMatchOptions: "SKU Match 加载中",
        loadMatchOptionsFailed: "SKU Match 加载失败",
        selectMatchFirst: "请先选择 SKU Match",
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
        retakePhoto: "拍照重拍",
        replaceFromAlbum: "从相册替换",
        updateThisPhoto: "更新这张",
        updated: "已更新",
        refreshingOne: "本张识别结果已刷新",
        uploading: "上传中",
        analyzingOne: "识别中",
        retryUpload: "重试上传",
        retryAnalysis: "重试识别",
        analysisBusy: "当前有图片正在分析，请等待完成后再操作下一张图片",
        retakeAgain: "再次重拍",
        previewPhoto: "预览照片",
        expandPhoto: "放大照片",
        failedNeedsUpdate: "识别失败，请更新这张照片",
        retakeRequired: "请重新上传该图片",
        retakeRequiredSummary: "有价格标签照片需重传，请进入照片操作重新拍照或从相册替换。",
        retakeRequiredFallback: "请正对价格标签靠近拍摄，确保价格数字清楚无遮挡。",
        refreshVisit: "刷新",
        reanalyzeFullVisit: "整单重新分析",
        reanalyzeFullVisitSubmitted: "已提交整单重新分析，后台分析中。",
      }
    : {
        batchCode: "Batch code",
        priceParsing: "Price Parsing",
        displayAnalysis: "Store Display",
        listPrice: "List Price",
        promoType: "Activity Type",
        netPrice: "Net Price",
        pricePerPiece: "Per Piece",
        pieceCount: "Pcs",
        editRow: "Edit",
        rowUnmatched: "Unmatched",
        rowEditorTitle: "Edit Price",
        skuMatch: "SKU Match",
        save: "Save",
        cancel: "Cancel",
        unmatched: "Unmatched",
        matchTypeOwn: "Makuku SKU",
        matchTypeCompetitor: "Competitor SKU",
        matchTypeNone: "Unmatched",
        searchMatch: "Search SKU Match",
        saveRowFailed: "Failed to save row changes",
        loadingMatchOptions: "Loading SKU match options",
        loadMatchOptionsFailed: "Failed to load SKU match options",
        selectMatchFirst: "Select a SKU match first",
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
        retakePhoto: "Retake Photo",
        replaceFromAlbum: "Replace from Album",
        updateThisPhoto: "Update Photo",
        updated: "Updated",
        refreshingOne: "This photo result has been refreshed",
        uploading: "Uploading",
        analyzingOne: "Analyzing",
        retryUpload: "Retry upload",
        retryAnalysis: "Retry analysis",
        analysisBusy: "Another photo is still analyzing. Please wait before updating the next photo.",
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
        retakeRequired: "Please re-upload this photo",
        retakeRequiredSummary: "Price-tag photo needs retake. Use photo actions to retake or replace it.",
        retakeRequiredFallback: "Retake directly facing the price tags, closer to the shelf, with clear unobstructed price digits.",
        refreshVisit: "Refresh",
        reanalyzeFullVisit: "Re-analyze full visit",
        reanalyzeFullVisitSubmitted: "Full visit re-analysis submitted. Analysis is running in the background.",
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
  const retakePhotoLabel = textOrFallback(text.retakePhoto, locale === "zh" ? "拍照重拍" : "Retake Photo");
  const replaceFromAlbumLabel = textOrFallback(text.replaceFromAlbum, locale === "zh" ? "从相册替换" : "Replace from Album");
  const reAnalyzeLabel = textOrFallback(text.reAnalyze, locale === "zh" ? "重新识别" : "Re-analyze");
  const deleteLabel = textOrFallback(text.delete, locale === "zh" ? "删除" : "Delete");
  const [visit, setVisit] = useState<StoreVisitDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshingVisit, setRefreshingVisit] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [fullVisitReanalyzing, setFullVisitReanalyzing] = useState(false);
  const [appUserRole, setAppUserRole] = useState<string | null>(null);
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
  const [rowEdit, setRowEdit] = useState<RowEditState | null>(null);
  const [rowEditSaving, setRowEditSaving] = useState(false);
  const [matchOptions, setMatchOptions] = useState<MatchOptionState>({ materials: [], products: [] });
  const [matchOptionsLoading, setMatchOptionsLoading] = useState(false);
  const [matchOptionsError, setMatchOptionsError] = useState<string | null>(null);
  const cameraRetakeInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const albumRetakeInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

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

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/session")
      .then((response) => response.json())
      .then((payload) => {
        if (!cancelled) setAppUserRole(typeof payload.user?.role === "string" ? payload.user.role : null);
      })
      .catch(() => {
        if (!cancelled) setAppUserRole(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function refreshVisitDetail() {
    if (refreshingVisit || analysisPhase !== "idle") return;
    setRefreshingVisit(true);
    try {
      await loadVisit({ preserveLoading: true });
    } finally {
      setRefreshingVisit(false);
    }
  }

  async function reanalyzeFullVisit() {
    if (fullVisitReanalyzing || analysisPhase !== "idle") return;
    setFullVisitReanalyzing(true);
    setAnalysisPhase("running");
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/store-visit/${id}/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ full_visit: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 409) {
        throw new Error(text.analysisBusy ?? data.error ?? copy.aiAnalysisFailed);
      }
      if (!res.ok) {
        throw new Error(data.error ?? copy.aiAnalysisFailed);
      }
      setAnalysisPhase("refreshing");
      await loadVisit({ preserveLoading: true });
      setNotice(text.reanalyzeFullVisitSubmitted);
    } catch (reanalyzeError) {
      setError(reanalyzeError instanceof Error ? reanalyzeError.message : copy.networkRetry);
      await loadVisit({ preserveLoading: true });
    } finally {
      setFullVisitReanalyzing(false);
      setAnalysisPhase("idle");
    }
  }

  const loadMatchOptions = useCallback(async () => {
    if (matchOptions.materials.length > 0 || matchOptions.products.length > 0 || matchOptionsLoading) return;
    setMatchOptionsError(null);
    setMatchOptionsLoading(true);
    try {
      const response = await fetch("/api/store-visit/match-options");
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? text.loadMatchOptionsFailed);
      setMatchOptions({
        materials: (payload.items ?? []) as MaterialMaster[],
        products: (payload.products ?? []) as CompetitorProduct[],
      });
    } catch (caught) {
      setMatchOptionsError(caught instanceof Error ? caught.message : text.loadMatchOptionsFailed);
    } finally {
      setMatchOptionsLoading(false);
    }
  }, [matchOptions.materials.length, matchOptions.products.length, matchOptionsLoading, text.loadMatchOptionsFailed]);

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

  function openRowEditor(section: PriceParseSection, row: StoreVisitPriceImageAnalysis["rows"][number], rowIndex: number) {
    const candidate = matchCandidateForRow(visit?.ai_price_candidates ?? [], section.image.id, row);
    setRowEdit({
      imageId: section.image.id,
      rowIndex,
      sku: row.sku,
      candidateId: candidate?.id ?? null,
      netPrice: String(candidate?.net_price_idr ?? row.net_price_idr ?? ""),
      pieceCount: String(candidateDisplayPieceCount(candidate, row.piece_count) ?? ""),
      matchedEntityType: candidate?.matched_entity_type ?? "unmatched",
      matchedEntityId: candidate?.matched_entity_id ?? "",
      selectedMatchLabel: candidate?.matched_sku_label ?? candidate?.matched_label ?? "",
      matchSearchQuery: "",
      originalMatchedEntityType: candidate?.matched_entity_type ?? "unmatched",
      originalMatchedEntityId: candidate?.matched_entity_id ?? "",
    });
  }

  function applySavedRowCandidate(candidate: AiPriceCandidate) {
    setVisit((current) => {
      if (!current) return current;
      return {
        ...current,
        ai_price_candidates: (current.ai_price_candidates ?? []).map((item) => (
          item.id === candidate.id ? candidate : item
        )),
      };
    });
  }

  async function saveRowEdit() {
    if (!rowEdit?.candidateId) {
      setError(text.saveRowFailed);
      return;
    }
    const price = Number(rowEdit.netPrice);
    const pieces = Number(rowEdit.pieceCount);
    if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(pieces) || pieces <= 0) {
      setError(text.saveRowFailed);
      return;
    }
    if (rowEdit.matchedEntityType !== "unmatched" && !rowEdit.matchedEntityId) {
      setError(text.selectMatchFirst);
      return;
    }

    setRowEditSaving(true);
    setError(null);
    try {
      const saveRes = await fetch(`/api/store-visit/price-candidates/${rowEdit.candidateId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save_h5_row",
          net_price_idr: Math.round(price),
          piece_count: Math.floor(pieces),
          matched_entity_type: rowEdit.matchedEntityType,
          matched_entity_id: rowEdit.matchedEntityType === "unmatched" ? null : rowEdit.matchedEntityId,
          matched_label: resolveMatchLabel(rowEdit, matchOptions),
        }),
      });
      const savePayload = await saveRes.json().catch(() => ({}));
      if (!saveRes.ok) throw new Error(savePayload.error ?? text.saveRowFailed);
      const candidate = savePayload.candidate;
      if (candidate) applySavedRowCandidate(candidate as AiPriceCandidate);
      setRowEdit(null);
      void loadVisit({ preserveLoading: true });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : text.saveRowFailed);
    } finally {
      setRowEditSaving(false);
    }
  }

  const status = visit?.analysis_status ?? "pending";
  const businessRetakeImages = (visit?.offline_visit_images ?? []).filter(isRetakeRequiredPriceImage);
  const systemFailedImages = (visit?.offline_visit_images ?? []).filter((image) => image.analysis_status === "failed" && !isRetakeRequiredPriceImage(image) && (image.analysis_error || image.error_message));
  const canRunWholeVisitAnalysis = status === "pending" && visit?.visit_status === "uploaded";
  const canRunFullVisitReanalysis = appUserRole === "admin";
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
  const actionSheetImage = actionSheet
    ? priceParseSections.find((section) => section.image.id === actionSheet.imageId)?.image ?? null
    : null;
  const actionSheetImageIsAnalyzing = actionSheetImage?.analysis_status === "analyzing";

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
      if (res.status === 409) {
        throw new Error(text.analysisBusy ?? data.error ?? copy.aiAnalysisFailed);
      }
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
      const file = await prepareImageForUpload(params.file);
      if (file.size > maxUploadBytes) {
        throw new Error(`Photo is still ${formatMb(file.size)} after compression. Please choose a smaller photo.`);
      }

      const formData = new FormData();
      formData.set("image", file);
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
      if (analyzeRes.status === 409) {
        throw new Error(text.analysisBusy ?? analyzeData.error ?? copy.aiAnalysisFailed);
      }
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
                <div className="min-w-0">
                  <div className="text-xs font-medium uppercase text-slate-500">{copy.analysisStatus}</div>
                  <div className="mt-1 text-lg font-bold">{mobileAnalysisStatusLabel(locale, status)}</div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {canRunWholeVisitAnalysis ? (
                    <button type="button" onClick={analyze} disabled={analyzing} className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-3 text-sm font-bold text-white disabled:opacity-60">
                      {analyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                      {copy.analyzeStore}
                    </button>
                  ) : null}
                  {canRunFullVisitReanalysis ? (
                    <button
                      type="button"
                      onClick={reanalyzeFullVisit}
                      disabled={fullVisitReanalyzing || analysisPhase !== "idle"}
                      aria-label={text.reanalyzeFullVisit}
                      title={text.reanalyzeFullVisit}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-amber-200 bg-amber-50 text-amber-700 shadow-sm transition hover:border-amber-300 hover:bg-amber-100 disabled:opacity-60"
                    >
                      {fullVisitReanalyzing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={refreshVisitDetail}
                    disabled={refreshingVisit || analysisPhase !== "idle"}
                    aria-label={text.refreshVisit}
                    title={text.refreshVisit}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-slate-50/70 text-slate-500 shadow-sm transition hover:border-slate-300 hover:bg-white hover:text-slate-700 disabled:opacity-60"
                  >
                    {refreshingVisit ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>
              {status === "partial" ? (
                <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  <div className="font-semibold">{text.partialSuccess}</div>
                  <div className="mt-1">{text.businessAnalysisError}</div>
                </div>
              ) : null}
              {businessRetakeImages.length > 0 ? (
                <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  <div className="font-semibold">{text.retakeRequired}</div>
                  <div className="mt-1">{text.retakeRequiredSummary}</div>
                </div>
              ) : null}
              {visit.analysis_error && status !== "partial" && status !== "action_required" ? <p className="mt-3 text-sm text-red-600">{copy.aiAnalysisFailed}: {visit.analysis_error}</p> : null}
              {systemFailedImages.length > 0 ? (
                <div className="mt-3 space-y-2">
                  {systemFailedImages.map((image, index) => {
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
                  candidates={visit?.ai_price_candidates ?? []}
                  onPreview={setActiveImage}
                  deletingImageIds={deletingImageIds}
                  retryingImageIds={retryingImageIds}
                  onOpenActions={(imageId, imageCategory, label) => setActionSheet({ imageId, category: imageCategory, label })}
                  onOpenRowEditor={openRowEditor}
                  onRetakeFile={(imageId, file) => void uploadPricePhoto({ file, category: "makuku_shelf", targetImageId: imageId })}
                  cameraRetakeInputRefs={cameraRetakeInputRefs}
                  albumRetakeInputRefs={albumRetakeInputRefs}
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
                  candidates={visit?.ai_price_candidates ?? []}
                  onPreview={setActiveImage}
                  deletingImageIds={deletingImageIds}
                  retryingImageIds={retryingImageIds}
                  onOpenActions={(imageId, imageCategory, label) => setActionSheet({ imageId, category: imageCategory, label })}
                  onOpenRowEditor={openRowEditor}
                  onRetakeFile={(imageId, file) => void uploadPricePhoto({ file, category: "competitor_shelf", targetImageId: imageId })}
                  cameraRetakeInputRefs={cameraRetakeInputRefs}
                  albumRetakeInputRefs={albumRetakeInputRefs}
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

        {rowEdit ? (
          <RowEditSheet
            rowEdit={rowEdit}
            rowEditSaving={rowEditSaving}
            matchOptions={matchOptions}
            matchOptionsLoading={matchOptionsLoading}
            matchOptionsError={matchOptionsError}
            text={text}
            onClose={() => setRowEdit(null)}
            onChange={setRowEdit}
            onRequestMatchOptions={() => void loadMatchOptions()}
            onSave={() => void saveRowEdit()}
          />
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
                  disabled={updateLocked || actionSheetImageIsAnalyzing}
                  onClick={() => {
                    setActionSheet(null);
                    cameraRetakeInputRefs.current[actionSheet.imageId]?.click();
                  }}
                  className="flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left text-sm font-medium text-slate-800 disabled:opacity-50"
                >
                  <span>{retakePhotoLabel}</span>
                  <Camera className="h-4 w-4 text-slate-400" />
                </button>
                <button
                  type="button"
                  disabled={updateLocked || actionSheetImageIsAnalyzing}
                  onClick={() => {
                    setActionSheet(null);
                    albumRetakeInputRefs.current[actionSheet.imageId]?.click();
                  }}
                  className="flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left text-sm font-medium text-slate-800 disabled:opacity-50"
                >
                  <span>{replaceFromAlbumLabel}</span>
                  <ImageIcon className="h-4 w-4 text-slate-400" />
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
                  disabled={updateLocked || actionSheetImageIsAnalyzing || deletingImageIds.includes(actionSheet.imageId)}
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
  candidates,
  deletingImageIds,
  retryingImageIds,
  onPreview,
  onOpenActions,
  onOpenRowEditor,
  onRetakeFile,
  cameraRetakeInputRefs,
  albumRetakeInputRefs,
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
  candidates: AiPriceCandidate[];
  deletingImageIds: string[];
  retryingImageIds: string[];
  onPreview: (image: { url: string; label: string }) => void;
  onOpenActions: (imageId: string, category: "makuku_shelf" | "competitor_shelf", label: string) => void;
  onOpenRowEditor: (section: PriceParseSection, row: StoreVisitPriceImageAnalysis["rows"][number], rowIndex: number) => void;
  onRetakeFile: (imageId: string, file: File) => void;
  cameraRetakeInputRefs: MutableRefObject<Record<string, HTMLInputElement | null>>;
  albumRetakeInputRefs: MutableRefObject<Record<string, HTMLInputElement | null>>;
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
            const needsRetake = isRetakeRequiredPriceImage(section.image);
            const isActionDisabled = updateLocked || retryingImageIds.includes(section.image.id) || deletingImageIds.includes(section.image.id);

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
                  ref={(node) => { cameraRetakeInputRefs.current[section.image.id] = node; }}
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
                <input
                  ref={(node) => { albumRetakeInputRefs.current[section.image.id] = node; }}
                  type="file"
                  accept="image/*"
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
                {needsRetake && !isProcessingRetake && !isAnalyzingImage ? (
                  <span className="rounded-full bg-red-100 px-2 py-[1px] text-[10px] font-semibold leading-5 text-red-700">
                    {text.retakeRequired}
                  </span>
                ) : null}
                {section.image.analysis_status === "failed" && !needsRetake && !isProcessingRetake ? (
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
          {needsRetake && !isProcessingRetake && !isAnalyzingImage ? (
            <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              <div className="font-semibold">{text.retakeRequired}</div>
              <div className="mt-1 text-xs leading-5">{retakeRequiredMessage(section.image, text.retakeRequiredFallback)}</div>
            </div>
          ) : null}

          <div className="mt-3 space-y-2">
            {section.result?.rows.length ? section.result.rows.map((row, rowIndex) => {
              const candidate = matchCandidateForRow(candidates, section.image.id, row);
              const displayPieceCount = candidateDisplayPieceCount(candidate, row.piece_count);
              const displayPricePerPiece = candidateDisplayPricePerPiece(candidate, row.price_per_piece_idr);
              const matchInfo = candidateMatchDisplay(candidate);
              const {
                package_price_idr: packagePrice,
                net_price_idr: netPrice,
              } = row;
              return (
                <div key={`${section.image.id}-${rowIndex}`} className="rounded-lg bg-white px-3 py-2 text-xs shadow-sm">
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
                    <div className="line-clamp-1 min-w-0 text-sm font-semibold leading-5 text-slate-900">{row.sku}</div>
                    <button
                      type="button"
                      onClick={() => onOpenRowEditor(section, row, rowIndex)}
                      className="shrink-0 whitespace-nowrap text-[11px] font-semibold leading-5 text-blue-600"
                    >
                      {text.editRow}
                    </button>
                  </div>
                  <div className={`mt-1 break-words text-[10px] leading-4 ${matchInfo.matched ? "text-slate-500" : "font-semibold text-red-600"}`}>
                    {matchInfo.matched ? matchInfo.label : text.rowUnmatched}
                  </div>
                  <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1">
                    <PriceMetricRow label={text.listPrice} value={formatMoney(packagePrice)} />
                    <PriceMetricRow label={text.pieceCount} value={displayPieceCount ? String(displayPieceCount) : "-"} />
                    <PriceMetricRow label={text.netPrice} value={formatMoney(netPrice)} />
                    <PriceMetricRow label={text.pricePerPiece} value={formatMoney(displayPricePerPiece)} />
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

function H5SkuMatchSearchSheet({
  open,
  query,
  placeholder,
  loading,
  error,
  emptyText,
  selectedValue,
  options,
  onQueryChange,
  onClose,
  onSelect,
}: {
  open: boolean;
  query: string;
  placeholder: string;
  loading: boolean;
  error: string | null;
  emptyText: string;
  selectedValue: string;
  options: { value: string; label: string }[];
  onQueryChange: (value: string) => void;
  onClose: () => void;
  onSelect: (item: { value: string; label: string }) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [viewportHeight, setViewportHeight] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;

    function syncViewportHeight() {
      const visualViewport = window.visualViewport;
      setViewportHeight(visualViewport ? Math.round(visualViewport.height) : null);
    }

    syncViewportHeight();
    window.visualViewport?.addEventListener("resize", syncViewportHeight);
    window.visualViewport?.addEventListener("scroll", syncViewportHeight);
    const focusTimeout = window.setTimeout(() => inputRef.current?.focus(), 0);

    return () => {
      window.clearTimeout(focusTimeout);
      window.visualViewport?.removeEventListener("resize", syncViewportHeight);
      window.visualViewport?.removeEventListener("scroll", syncViewportHeight);
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex justify-center bg-white" style={{ height: viewportHeight ? `${viewportHeight}px` : "100dvh" }}>
      <div className="flex h-full w-full max-w-md flex-col bg-white">
        <div className="shrink-0 border-b border-slate-100 bg-white px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <div className="flex h-11 items-center gap-2">
            <button type="button" onClick={onClose} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-600" aria-label={placeholder}>
              <ArrowLeft className="h-5 w-5" />
            </button>
            <label className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 focus-within:border-blue-500">
              <Search className="h-4 w-4 shrink-0 text-slate-400" />
              <input
                ref={inputRef}
                autoFocus
                value={query}
                onChange={(event) => onQueryChange(event.target.value)}
                placeholder={placeholder}
                className="h-10 min-w-0 flex-1 bg-transparent text-sm outline-none"
              />
            </label>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-slate-50 px-4 py-3">
          {loading ? <div className="rounded-xl bg-white px-3 py-3 text-sm text-slate-500">{placeholder}</div> : null}
          {!loading && error ? <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-700">{error}</div> : null}
          {!loading && !error && options.length === 0 ? <div className="rounded-xl bg-white px-3 py-3 text-sm text-slate-500">{emptyText}</div> : null}
          {!loading && !error && options.length > 0 ? (
            <div className="space-y-2">
              {options.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  role="option"
                  aria-selected={selectedValue === item.value}
                  onClick={() => onSelect(item)}
                  className={`block w-full rounded-xl border px-3 py-3 text-left text-sm ${selectedValue === item.value ? "border-blue-200 bg-blue-50 font-semibold text-blue-700" : "border-slate-200 bg-white text-slate-700"}`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function RowEditSheet({
  rowEdit,
  rowEditSaving,
  matchOptions,
  matchOptionsLoading,
  matchOptionsError,
  text,
  onClose,
  onChange,
  onRequestMatchOptions,
  onSave,
}: {
  rowEdit: RowEditState;
  rowEditSaving: boolean;
  matchOptions: MatchOptionState;
  matchOptionsLoading: boolean;
  matchOptionsError: string | null;
  text: ReturnType<typeof detailText>;
  onClose: () => void;
  onChange: Dispatch<SetStateAction<RowEditState | null>>;
  onRequestMatchOptions: () => void;
  onSave: () => void;
}) {
  const [matchPickerOpen, setMatchPickerOpen] = useState(false);
  const options = filterValidMatchOptions(rowEdit.matchedEntityType === "material_master" ? matchOptions.materials : matchOptions.products);
  const selectedMatchOptionLabel = rowEdit.matchedEntityId
    ? rowEdit.selectedMatchLabel || rowEdit.matchedEntityId
    : null;
  const selectedMatchOption = selectedMatchOptionLabel
    ? { value: rowEdit.matchedEntityId, label: selectedMatchOptionLabel }
    : null;
  const optionItems = options
    .map((item) => {
      const value = rowEdit.matchedEntityType === "material_master"
        ? materialOptionValue(item as MaterialMaster)
        : competitorOptionValue(item as CompetitorProduct);
      const label = rowEdit.matchedEntityType === "material_master"
        ? formatMaterialOptionLabel(item as MaterialMaster)
        : formatCompetitorOptionLabel(item as CompetitorProduct);
      return value ? { value, label: label ?? value } : null;
    })
    .filter((item): item is { value: string; label: string } => Boolean(item));
  const hasSelectedMatchOption = selectedMatchOption
    ? optionItems.some((item) => item.value === selectedMatchOption.value)
    : false;
  const searchableMatchOptions = selectedMatchOption && !hasSelectedMatchOption ? [selectedMatchOption, ...optionItems] : optionItems;
  const matchQueryValue = rowEdit.matchSearchQuery;
  const visibleMatchOptions = searchableMatchOptions
    .filter((item) => fuzzyMatchSkuOption(`${item.value} ${item.label}`, matchQueryValue))
    .slice(0, 50);

  return (
    <div className="fixed inset-0 z-[58] flex items-end bg-slate-950/45" role="dialog" aria-modal="true" onClick={() => !rowEditSaving && onClose()}>
      <div className="max-h-[calc(100dvh-24px)] w-full overflow-y-auto rounded-t-3xl bg-white px-4 pt-4 shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-slate-200" />
        <div className="text-sm font-semibold text-slate-900">{text.rowEditorTitle}</div>
        <div className="mt-1 text-sm text-slate-500">{rowEdit.sku}</div>

        <div className="mt-4 space-y-3">
          <label className="block">
            <div className="mb-1 text-xs font-medium text-slate-500">{text.netPrice}</div>
            <input
              value={rowEdit.netPrice}
              onChange={(event) => onChange((current) => current ? { ...current, netPrice: event.target.value } : current)}
              className="h-11 w-full rounded-xl border border-slate-300 px-3 text-sm outline-none focus:border-blue-500"
              inputMode="numeric"
            />
          </label>

          <label className="block">
            <div className="mb-1 text-xs font-medium text-slate-500">{text.pieceCount}</div>
            <input
              value={rowEdit.pieceCount}
              onChange={(event) => onChange((current) => current ? { ...current, pieceCount: event.target.value } : current)}
              className="h-11 w-full rounded-xl border border-slate-300 px-3 text-sm outline-none focus:border-blue-500"
              inputMode="numeric"
            />
          </label>

          <label className="block">
            <div className="mb-1 text-xs font-medium text-slate-500">{text.skuMatch}</div>
            <select
              value={rowEdit.matchedEntityType}
              onChange={(event) => {
                const nextType = event.target.value as AiPriceCandidateMatchType;
                if (nextType !== "unmatched") onRequestMatchOptions();
                onChange((current) => current ? {
                  ...current,
                  matchedEntityType: nextType,
                  matchedEntityId: "",
                  selectedMatchLabel: "",
                  matchSearchQuery: "",
                } : current);
              }}
              className="h-11 w-full rounded-xl border border-slate-300 px-3 text-sm outline-none focus:border-blue-500"
            >
              <option value="material_master">{text.matchTypeOwn}</option>
              <option value="competitor_product">{text.matchTypeCompetitor}</option>
              <option value="unmatched">{text.matchTypeNone}</option>
            </select>
          </label>

          {rowEdit.matchedEntityType !== "unmatched" ? (
            <div>
              <div className="mb-2 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2">
                <div className="text-[11px] font-medium uppercase tracking-wide text-blue-500">Current SKU</div>
                <div className="mt-0.5 truncate text-sm font-semibold text-blue-900">
                  {selectedMatchOptionLabel ?? text.unmatched}
                </div>
              </div>
              <div className="mb-1 text-xs font-medium text-slate-500">{text.searchMatch}</div>
              <button
                type="button"
                onClick={() => {
                  onRequestMatchOptions();
                  setMatchPickerOpen(true);
                }}
                className="flex min-h-11 w-full items-center justify-between gap-3 rounded-xl border border-slate-300 bg-white px-3 py-2 text-left text-sm"
              >
                <span className="min-w-0 flex-1 truncate text-slate-400">{matchOptionsError ?? (matchOptionsLoading ? text.loadingMatchOptions : text.searchMatch)}</span>
                <Search className="h-4 w-4 shrink-0 text-slate-400" />
              </button>
              <H5SkuMatchSearchSheet
                open={matchPickerOpen}
                query={matchQueryValue}
                placeholder={matchOptionsError ?? (matchOptionsLoading ? text.loadingMatchOptions : text.searchMatch)}
                loading={matchOptionsLoading}
                error={matchOptionsError}
                emptyText={text.searchMatch}
                selectedValue={rowEdit.matchedEntityId}
                options={visibleMatchOptions}
                onQueryChange={(value) => onChange((current) => current ? { ...current, matchSearchQuery: value } : current)}
                onClose={() => setMatchPickerOpen(false)}
                onSelect={(item) => {
                  onChange((current) => current ? {
                    ...current,
                    matchedEntityId: item.value,
                    selectedMatchLabel: item.label,
                    matchSearchQuery: "",
                  } : current);
                  setMatchPickerOpen(false);
                }}
              />
            </div>
          ) : null}
        </div>

        <div className="sticky bottom-0 -mx-4 mt-4 flex gap-2 bg-white px-4 pb-6 pt-3">
          <button
            type="button"
            disabled={rowEditSaving}
            onClick={onSave}
            className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
          >
            {rowEditSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {text.save}
          </button>
          <button
            type="button"
            disabled={rowEditSaving}
            onClick={onClose}
            className="flex flex-1 items-center justify-center rounded-2xl bg-slate-100 px-4 py-3 text-sm font-medium text-slate-700 disabled:opacity-60"
          >
            {text.cancel}
          </button>
        </div>
      </div>
    </div>
  );
}

function EmptyLine({ text }: { text: string }) {
  return <div className="rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm text-slate-500">{text}</div>;
}

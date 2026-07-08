"use client";

import { ArrowLeft, Camera, Check, ChevronDown, ChevronRight, Copy, Ellipsis, Image as ImageIcon, Loader2, Pencil, RefreshCw, RotateCcw, Search, Trash2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { withMinimumDelay } from "@/lib/async-ui";
import { formatIdr, formatShortImageId } from "@/lib/format";
import type { Locale } from "@/lib/i18n/config";
import { isSupportedStoreVisitImageFile, summarizeStoreVisitImageError, unsupportedStoreVisitImageFormatMessage } from "@/lib/store-visit-image-errors";
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
  StoreVisitAiJobSummary,
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
  active_ai_job?: StoreVisitAiJobSummary | null;
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

type RowActionSheetState = {
  section: PriceParseSection;
  row: StoreVisitPriceImageAnalysis["rows"][number];
  rowIndex: number;
  candidate: AiPriceCandidate;
  label: string;
};

type PriceDisplayRow = {
  row: StoreVisitPriceImageAnalysis["rows"][number];
  rowIndex: number;
  rowKey: string;
  candidate: AiPriceCandidate | null;
  displayCandidate: AiPriceCandidate | null;
  legacyDisplayOnly: boolean;
};

type DeleteConfirmState = {
  imageId: string;
  label: string;
};

type RowDeleteConfirmState = {
  candidateId: string;
  label: string;
};

type ReanalyzeConfirmState = {
  imageId: string;
  label: string;
};

type GroupedSystemFailedImage = {
  message: string;
  images: OfflineVisitImage[];
};

type ActiveImageState = {
  status: "loading" | "ready" | "error";
  label: string;
  url?: string;
  error?: string;
};

function isActiveAiJob(job: StoreVisitAiJobSummary | null | undefined) {
  return job?.status === "queued" || job?.status === "running";
}

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

function rowNeedsConfirmation(row: StoreVisitPriceImageAnalysis["rows"][number], candidate: AiPriceCandidate | null) {
  if (candidate?.status === "approved") return false;
  return row.review_decision === "NEED_REVIEW"
    || candidate?.review_decision === "NEED_REVIEW"
    || row.price_evidence_status !== "CLEAR"
    || candidate?.price_evidence_status !== "CLEAR";
}

function canQuickConfirmRow(candidate: AiPriceCandidate | null) {
  const price = Number(candidate?.net_price_idr ?? candidate?.parsed_price_idr);
  const pieceCount = Number(candidate?.reviewed_piece_count ?? candidate?.piece_count);
  return Boolean(
    candidate
    && candidate.status === "pending"
    && candidate.matched_entity_type !== "unmatched"
    && candidate.matched_entity_id
    && Number.isFinite(price)
    && price > 0
    && Number.isFinite(pieceCount)
    && pieceCount > 0,
  );
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
  if (!isSupportedStoreVisitImageFile({ contentType: file.type, fileName: file.name })) {
    throw new Error(unsupportedStoreVisitImageFormatMessage(file.name));
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

function candidateDisplayListPrice(candidate: AiPriceCandidate | null, fallback: number | null | undefined) {
  return candidate?.list_price_idr
    ?? candidate?.package_price_idr
    ?? candidate?.net_price_idr
    ?? candidate?.parsed_price_idr
    ?? fallback
    ?? null;
}

function candidateDisplayNetPrice(candidate: AiPriceCandidate | null, fallback: number | null | undefined) {
  return candidate?.net_price_idr
    ?? candidate?.parsed_price_idr
    ?? fallback
    ?? null;
}

function candidateDisplayPricePerPiece(candidate: AiPriceCandidate | null, fallback: number | null | undefined) {
  return candidate?.reviewed_price_per_piece ?? candidate?.price_per_piece ?? fallback ?? null;
}

function candidateMatchDisplay(candidate: AiPriceCandidate | null) {
  const label = String(candidate?.matched_sku_label ?? candidate?.matched_label ?? candidate?.matched_entity_id ?? "").trim();
  const matched = Boolean(candidate && candidate.matched_entity_type !== "unmatched" && candidate.matched_entity_id && label);
  return { matched, label };
}

function exactCandidateForRow(
  candidates: AiPriceCandidate[],
  imageId: string,
  rowIndex: number,
) {
  return candidates.find((candidate) => (
    candidate.source_image_id === imageId
    && candidate.source_row_index === rowIndex
  )) ?? null;
}

function legacyDisplayCandidateForRow(
  candidates: AiPriceCandidate[],
  imageId: string,
  row: StoreVisitPriceImageAnalysis["rows"][number],
) {
  const normalizedSku = normalizeMatchText(row.sku);
  const rowPieceCount = row.piece_count ?? null;
  const rowNetPrice = row.net_price_idr ?? null;
  const sameRowCandidates = candidates.filter((candidate) => (
    candidate.source_image_id === imageId
    && candidate.source_row_index == null
    && candidate.h5_lifecycle_status !== "deleted"
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

function buildPriceDisplayRows(
  candidates: AiPriceCandidate[],
  imageId: string,
  rows: StoreVisitPriceImageAnalysis["rows"],
): PriceDisplayRow[] {
  return rows.flatMap((row, rowIndex) => {
    const candidate = exactCandidateForRow(candidates, imageId, rowIndex);
    if (candidate?.h5_lifecycle_status === "deleted") return [];
    const legacyCandidate = candidate ? null : legacyDisplayCandidateForRow(candidates, imageId, row);
    return [{
      row,
      rowIndex,
      rowKey: `${imageId}:${rowIndex}`,
      candidate,
      displayCandidate: candidate ?? legacyCandidate,
      legacyDisplayOnly: !candidate && Boolean(legacyCandidate),
    }];
  });
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
  /*
  const rowEditPreviewText = locale === "zh"
    ? {
        ...rowEditPreviewText,
        pricePerPieceAuto: "閼奉亜濮╅崡鏇犲娴?,
        autoCalculated: "閼奉亜濮╃拋锛勭暬",
      }
    : {
        ...rowEditPreviewText,
        pricePerPieceAuto: "Per Piece",
        autoCalculated: "Auto-calculated",
      };
  */
  const rowEditPreviewText = locale === "zh"
    ? {
        pricePerPieceAuto: "Per Piece",
        autoCalculated: "Auto",
      }
    : {
        pricePerPieceAuto: "Per Piece",
        autoCalculated: "Auto-calculated",
      };
  void rowEditPreviewText;
  return locale === "zh"
    ? {
        batchCode: "Batch code",
        priceParsing: "Price Parsing",
        displayAnalysis: "Store Display",
        listPrice: "List Price",
        promoType: "Activity Type",
        netPrice: "Net Price",
        pricePerPiece: "Per Piece",
        pieceCount: "Pcs",
        needsConfirmationText: "Needs confirmation",
        editRow: "Edit",
        deleteRow: "Delete SKU",
        confirmRow: "Confirm",
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
        reAnalyze: "Analyze",
        confirmReanalyzeTitle: "Analyze this photo?",
        confirmReanalyzeDescription: "This will rerun AI analysis for this single photo. Existing linked price snapshots from this photo may be refreshed.",
        confirmReanalyzeAction: "Confirm Analyze",
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
        reanalyzeFullVisit: "Analyze full visit",
        reanalyzeFullVisitSubmitted: "Full visit AI analysis submitted. Analysis is running in the background.",
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
        needsConfirmationText: "Needs confirmation",
        editRow: "Edit",
        deleteRow: "Delete SKU",
        confirmRow: "Confirm",
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
        reAnalyze: "Analyze",
        confirmReanalyzeTitle: "Analyze this photo?",
        confirmReanalyzeDescription: "This will rerun AI analysis for this single photo. Existing linked price snapshots from this photo may be refreshed.",
        confirmReanalyzeAction: "Confirm Analyze",
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
        reanalyzeFullVisit: "Analyze full visit",
        reanalyzeFullVisitSubmitted: "Full visit AI analysis submitted. Analysis is running in the background.",
      };
}

function rowEditorPreviewText() {
  return {
    pricePerPieceAuto: "Per Piece",
    autoCalculated: "Auto-calculated",
  };
}

export function StoreVisitDetailH5({ locale, id }: { locale: Locale; id: string }) {
  const copy = getMobileCopy(locale);
  const text = detailText(locale);
  const deleteRowLabel = "deleteRow" in text ? text.deleteRow : "Delete SKU";
  const fullVisitReanalyzeCopy = {
    confirmFullVisitReanalyzeTitle: "Analyze this full visit?",
    confirmFullVisitReanalyzeDescription: "This will rerun AI analysis for the entire visit. Existing price results may be refreshed and it can take a few minutes.",
    confirmFullVisitReanalyzeAction: "Confirm Full AI analysis",
  };
  const confirmReanalyzeTitle = textOrFallback(text.confirmReanalyzeTitle, "Analyze this photo?");
  const confirmReanalyzeDescription = textOrFallback(text.confirmReanalyzeDescription, "This will rerun AI analysis for this single photo. Existing linked price snapshots from this photo may be refreshed.");
  const confirmReanalyzeActionLabel = textOrFallback(text.confirmReanalyzeAction, "Confirm Analyze");
  const confirmFullVisitReanalyzeTitle = fullVisitReanalyzeCopy.confirmFullVisitReanalyzeTitle;
  const confirmFullVisitReanalyzeDescription = fullVisitReanalyzeCopy.confirmFullVisitReanalyzeDescription;
  const confirmFullVisitReanalyzeActionLabel = fullVisitReanalyzeCopy.confirmFullVisitReanalyzeAction;
  const reanalyzingLabel = textOrFallback(text.reanalyzing, "Re-analyzing...");
  const confirmDeleteTitle = textOrFallback(text.confirmDeleteTitle, "Delete this photo?");
  const confirmDeleteDescription = textOrFallback(text.confirmDeleteDescription, "This will remove the photo from H5 and delete its linked price snapshots. This action cannot be undone.");
  const confirmDeleteActionLabel = textOrFallback(text.confirmDeleteAction, "Confirm Delete");
  const deletingLabel = textOrFallback(text.deleting, "Deleting...");
  const photoActionsLabel = textOrFallback(text.photoActions, "Photo actions");
  const retakePhotoLabel = textOrFallback(text.retakePhoto, "Retake Photo");
  const replaceFromAlbumLabel = textOrFallback(text.replaceFromAlbum, "Replace from Album");
  const reAnalyzeLabel = textOrFallback(text.reAnalyze, "Analyze");
  const deleteLabel = textOrFallback(text.delete, "Delete");
  const [visit, setVisit] = useState<StoreVisitDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshingVisit, setRefreshingVisit] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [fullVisitReanalyzing, setFullVisitReanalyzing] = useState(false);
  const [fullVisitReanalyzeConfirmOpen, setFullVisitReanalyzeConfirmOpen] = useState(false);
  const [appUserRole, setAppUserRole] = useState<string | null>(null);
  const [analysisPhase, setAnalysisPhase] = useState<"idle" | "running" | "refreshing">("idle");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [activeImage, setActiveImage] = useState<ActiveImageState | null>(null);
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
  const [rowActionSheet, setRowActionSheet] = useState<RowActionSheetState | null>(null);
  const [reanalyzeConfirm, setReanalyzeConfirm] = useState<ReanalyzeConfirmState | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirmState | null>(null);
  const [rowDeleteConfirm, setRowDeleteConfirm] = useState<RowDeleteConfirmState | null>(null);
  const [rowEdit, setRowEdit] = useState<RowEditState | null>(null);
  const [rowEditSaving, setRowEditSaving] = useState(false);
  const [confirmingRowCandidateIds, setConfirmingRowCandidateIds] = useState<string[]>([]);
  const [deletingRowCandidateIds, setDeletingRowCandidateIds] = useState<string[]>([]);
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

  function openDirectPreview(url: string, label: string) {
    setActiveImage({ status: "ready", url, label });
  }

  async function fetchOriginalImageUrl(input: { imageId?: string; path?: string }) {
    const params = new URLSearchParams();
    if (input.imageId) {
      params.set("image_id", input.imageId);
    } else if (input.path) {
      params.set("path", input.path);
    }
    const response = await fetch(`/api/store-visit/${id}/image-url?${params.toString()}`);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || typeof payload.url !== "string" || !payload.url) {
      throw new Error(copy.loadVisitFailed);
    }
    return payload.url;
  }

  async function openStoredImagePreview(input: { imageId?: string; path: string; label: string }) {
    setActiveImage({ status: "loading", label: input.label });
    try {
      const url = await fetchOriginalImageUrl({ imageId: input.imageId, path: input.path });
      setActiveImage({ status: "ready", label: input.label, url });
    } catch (error) {
      setActiveImage({
        status: "error",
        label: input.label,
        error: error instanceof Error ? error.message : copy.networkRetry,
      });
    }
  }

  useEffect(() => {
    const timeout = setTimeout(() => {
      void loadVisit();
    }, 0);
    return () => clearTimeout(timeout);
  }, [loadVisit]);

  const activeAiJobForPolling = visit?.active_ai_job ?? null;
  const activeAiJobId = activeAiJobForPolling?.id;
  const activeAiJobStatus = activeAiJobForPolling?.status;

  useEffect(() => {
    if (!activeAiJobId || !isActiveAiJob(activeAiJobForPolling)) return undefined;

    let cancelled = false;
    async function pollAiJob() {
      try {
        const response = await fetch(`/api/store-visit/ai-jobs/${activeAiJobId}`);
        const payload = await response.json().catch(() => ({}));
        if (cancelled || !response.ok) return;
        const summary = payload.summary as StoreVisitAiJobSummary | null | undefined;
        if (summary) {
          setVisit((current) => current ? { ...current, active_ai_job: summary } : current);
        }
        if (!isActiveAiJob(summary)) {
          await loadVisit({ preserveLoading: true });
        }
      } catch {
        if (!cancelled) void loadVisit({ preserveLoading: true });
      }
    }

    void pollAiJob();
    const interval = window.setInterval(pollAiJob, 2500);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [activeAiJobForPolling, activeAiJobId, activeAiJobStatus, loadVisit]);

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
      await loadVisit({ preserveLoading: true });
      setNotice(text.reanalyzeFullVisitSubmitted);
    } catch (reanalyzeError) {
      setError(reanalyzeError instanceof Error ? reanalyzeError.message : copy.networkRetry);
      await loadVisit({ preserveLoading: true });
    } finally {
      setFullVisitReanalyzing(false);
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
    const candidate = exactCandidateForRow(visit?.ai_price_candidates ?? [], section.image.id, rowIndex);
    if (!candidate || candidate.h5_lifecycle_status === "deleted") {
      setError(text.saveRowFailed);
      return;
    }
    setRowEdit({
      imageId: section.image.id,
      rowIndex,
      sku: row.sku,
      candidateId: candidate.id,
      netPrice: String(candidate.net_price_idr ?? row.net_price_idr ?? ""),
      pieceCount: String(candidateDisplayPieceCount(candidate, row.piece_count) ?? ""),
      matchedEntityType: candidate.matched_entity_type ?? "unmatched",
      matchedEntityId: candidate.matched_entity_id ?? "",
      selectedMatchLabel: candidate.matched_sku_label ?? candidate.matched_label ?? "",
      matchSearchQuery: "",
      originalMatchedEntityType: candidate.matched_entity_type ?? "unmatched",
      originalMatchedEntityId: candidate.matched_entity_id ?? "",
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

  async function confirmRow(candidateId: string) {
    if (confirmingRowCandidateIds.includes(candidateId)) return;
    setConfirmingRowCandidateIds((current) => [...current, candidateId]);
    setError(null);
    try {
      const response = await fetch(`/api/store-visit/price-candidates/${candidateId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "confirm_h5_row" }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? text.saveRowFailed);
      const candidate = payload.candidate;
      if (candidate) applySavedRowCandidate(candidate as AiPriceCandidate);
      await loadVisit({ preserveLoading: true });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : text.saveRowFailed);
    } finally {
      setConfirmingRowCandidateIds((current) => current.filter((id) => id !== candidateId));
    }
  }

  async function deleteRow(candidateId: string) {
    if (deletingRowCandidateIds.includes(candidateId)) return false;
    setDeletingRowCandidateIds((current) => [...current, candidateId]);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/store-visit/price-candidates/${candidateId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete_h5_row" }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? text.saveRowFailed);
      const candidate = payload.candidate;
      if (candidate) applySavedRowCandidate(candidate as AiPriceCandidate);
      await loadVisit({ preserveLoading: true });
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : text.saveRowFailed);
      return false;
    } finally {
      setDeletingRowCandidateIds((current) => current.filter((id) => id !== candidateId));
    }
  }

  const status = visit?.analysis_status ?? "pending";
  const activeAiJob = isActiveAiJob(visit?.active_ai_job) ? visit?.active_ai_job ?? null : null;
  const activeAiJobImageIds = useMemo(() => (
    new Set(activeAiJob?.target_image_ids ?? [])
  ), [activeAiJob?.target_image_ids]);
  const fullVisitAiActive = activeAiJob?.job_type === "full_visit_reanalysis";
  const hasPendingOrAnalyzingImage = (visit?.offline_visit_images ?? []).some((image) => image.analysis_status === "pending" || image.analysis_status === "analyzing");
  const visitAnalysisInProgress = analyzing || fullVisitReanalyzing || fullVisitAiActive || hasPendingOrAnalyzingImage || status === "analyzing";
  const businessRetakeImages = (visit?.offline_visit_images ?? []).filter(isRetakeRequiredPriceImage);
  const systemFailedImages = (visit?.offline_visit_images ?? []).filter((image) => image.analysis_status === "failed" && !isRetakeRequiredPriceImage(image) && (image.analysis_error || image.error_message));
  const groupedSystemFailedImages = useMemo(() => {
    const groups = new Map<string, { message: string; images: OfflineVisitImage[] }>();
    for (const image of systemFailedImages) {
      const message = summarizeStoreVisitImageError({
        error: image.analysis_error ?? image.error_message ?? "",
        contentType: image.content_type,
        fileName: image.file_name,
      });
      const existing = groups.get(message);
      if (existing) {
        existing.images.push(image);
      } else {
        groups.set(message, { message, images: [image] });
      }
    }
    return Array.from(groups.values()) as GroupedSystemFailedImage[];
  }, [systemFailedImages]);
  const canRunWholeVisitAnalysis = status === "pending" && visit?.visit_status === "uploaded" && !hasPendingOrAnalyzingImage && !activeAiJob;
  const canRunFullVisitAi = appUserRole === "admin";
  const canShowFullVisitReanalysis = canRunFullVisitAi && status !== "pending" && !hasPendingOrAnalyzingImage;
  const updateLocked = analysisPhase !== "idle" || fullVisitAiActive;
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
  const actionSheetImageIsAnalyzing = actionSheetImage?.analysis_status === "analyzing"
    || (actionSheet ? activeAiJobImageIds.has(actionSheet.imageId) : false);

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
      setNotice("Retry submitted. Analysis is running in the background.");
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
            ? "Analysis complete. Refreshing results..."
            : "Re-analyzing the visit..."
        }
        description="Please wait and avoid tapping repeatedly."
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
        {activeAiJob ? (
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-medium text-blue-800">
            <Loader2 className="h-4 w-4 animate-spin" />
            AI analysis running in background
          </div>
        ) : null}

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
                  {canShowFullVisitReanalysis ? (
                    <button
                      type="button"
                      onClick={() => setFullVisitReanalyzeConfirmOpen(true)}
                      disabled={fullVisitReanalyzing || analysisPhase !== "idle" || Boolean(activeAiJob)}
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
                  {/* 请重新上传该图片 */}
                  <div className="font-semibold">{text.retakeRequired}</div>
                  <div className="mt-1">{text.retakeRequiredSummary}</div>
                </div>
              ) : null}
              {visit.analysis_error && status !== "partial" && status !== "action_required" ? <p className="mt-3 text-sm text-red-600">{copy.aiAnalysisFailed}: {visit.analysis_error}</p> : null}
              {systemFailedImages.length > 0 ? (
                <div className="mt-3 space-y-2">
                  {groupedSystemFailedImages.map(({ message, images }, index) => {
                    const primaryImageId = images[0]?.id ?? `system-error-${index}`;
                    const imageLabels = images.map((image) => formatImageShortCode(image.id)).join(", ");
                    return (
                      <details key={`${primaryImageId}-${index}`} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                        <summary className="cursor-pointer font-semibold">{text.systemError} {index + 1}</summary>
                        {images.length > 1 ? (
                          <p className="mt-2 text-[11px] text-slate-500">{images.length} photos: {imageLabels}</p>
                        ) : (
                          <p className="mt-2 text-[11px] text-slate-500">{imageLabels}</p>
                        )}
                        <pre className="mt-2 max-h-36 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-white p-2 text-[11px] text-slate-700">{message}</pre>
                        <button
                          type="button"
                          onClick={() => copySystemError(primaryImageId, message)}
                          className="mt-2 inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2 text-xs font-semibold text-slate-700"
                        >
                          {copiedErrorId === primaryImageId ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                          {copiedErrorId === primaryImageId ? text.copiedSystemError : text.copySystemError}
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
                  visitAnalysisInProgress={visitAnalysisInProgress}
                  text={text}
                  localUploadsByImageId={localUploads}
                  candidates={visit?.ai_price_candidates ?? []}
                  onPreview={({ url, label }) => openDirectPreview(url, label)}
                  onPreviewStored={({ imageId, path, label }) => void openStoredImagePreview({ imageId, path, label })}
                  deletingImageIds={deletingImageIds}
                  retryingImageIds={retryingImageIds}
                  aiJobImageIds={activeAiJob?.target_image_ids ?? []}
                  onOpenActions={(imageId, imageCategory, label) => setActionSheet({ imageId, category: imageCategory, label })}
                  onOpenRowActions={(section, row, rowIndex, candidate) => setRowActionSheet({
                    section,
                    row,
                    rowIndex,
                    candidate,
                    label: row.sku,
                  })}
                  onConfirmRow={(candidateId) => void confirmRow(candidateId)}
                  confirmingRowCandidateIds={confirmingRowCandidateIds}
                  deletingRowCandidateIds={deletingRowCandidateIds}
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
                  visitAnalysisInProgress={visitAnalysisInProgress}
                  text={text}
                  localUploadsByImageId={localUploads}
                  candidates={visit?.ai_price_candidates ?? []}
                  onPreview={({ url, label }) => openDirectPreview(url, label)}
                  onPreviewStored={({ imageId, path, label }) => void openStoredImagePreview({ imageId, path, label })}
                  deletingImageIds={deletingImageIds}
                  retryingImageIds={retryingImageIds}
                  aiJobImageIds={activeAiJob?.target_image_ids ?? []}
                  onOpenActions={(imageId, imageCategory, label) => setActionSheet({ imageId, category: imageCategory, label })}
                  onOpenRowActions={(section, row, rowIndex, candidate) => setRowActionSheet({
                    section,
                    row,
                    rowIndex,
                    candidate,
                    label: row.sku,
                  })}
                  onConfirmRow={(candidateId) => void confirmRow(candidateId)}
                  confirmingRowCandidateIds={confirmingRowCandidateIds}
                  deletingRowCandidateIds={deletingRowCandidateIds}
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
                      onClick={() => item.signedImage?.url && void openStoredImagePreview({
                        imageId: item.image.id,
                        path: item.signedImage.path,
                        label: `${text.photoPrefix}${index + 1}`,
                      })}
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
            <div>This visit record could not be found.</div>
            <button
              type="button"
              onClick={() => void loadVisit()}
              className="mt-4 inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white"
            >
              <RefreshCw className="h-4 w-4" />
              {locale === "zh" ? "閲嶆柊鍔犺浇" : "Reload"}
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
              {activeImage.status === "loading" ? (
                <div className="flex h-64 w-64 items-center justify-center rounded-xl bg-white/90 text-slate-700">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : null}
              {activeImage.status === "error" ? (
                <div className="w-72 rounded-xl bg-white p-4 text-sm text-red-600">{activeImage.error}</div>
              ) : null}
              {activeImage.status === "ready" && activeImage.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={activeImage.url}
                  alt={activeImage.label}
                  className="max-h-[82vh] max-w-full rounded-xl object-contain shadow-2xl"
                />
              ) : null}
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

        {rowActionSheet ? (
          <div className="fixed inset-0 z-[60] flex items-end bg-slate-950/45" role="dialog" aria-modal="true" onClick={() => setRowActionSheet(null)}>
            <div className="w-full rounded-t-3xl bg-white px-4 pb-6 pt-4 shadow-2xl" onClick={(event) => event.stopPropagation()}>
              <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-slate-200" />
              <div className="line-clamp-2 text-sm font-semibold text-slate-900">{rowActionSheet.label}</div>
              <div className="mt-4 space-y-2">
                <button
                  type="button"
                  onClick={() => {
                    const current = rowActionSheet;
                    setRowActionSheet(null);
                    openRowEditor(current.section, current.row, current.rowIndex);
                  }}
                  className="flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left text-sm font-medium text-slate-800"
                >
                  <span>{text.editRow}</span>
                  <Pencil className="h-4 w-4 text-slate-400" />
                </button>
                <button
                  type="button"
                  disabled={deletingRowCandidateIds.includes(rowActionSheet.candidate.id)}
                  onClick={() => {
                    setRowDeleteConfirm({ candidateId: rowActionSheet.candidate.id, label: rowActionSheet.label });
                    setRowActionSheet(null);
                  }}
                  className="flex w-full items-center justify-between rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-left text-sm font-medium text-red-700 disabled:opacity-50"
                >
                  <span>{deleteRowLabel}</span>
                  {deletingRowCandidateIds.includes(rowActionSheet.candidate.id)
                    ? <Loader2 className="h-4 w-4 animate-spin text-red-400" />
                    : <Trash2 className="h-4 w-4 text-red-400" />}
                </button>
              </div>
              <button
                type="button"
                onClick={() => setRowActionSheet(null)}
                className="mt-3 flex w-full items-center justify-center rounded-2xl bg-slate-100 px-4 py-3 text-sm font-medium text-slate-700"
              >
                {text.close}
              </button>
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

        {fullVisitReanalyzeConfirmOpen ? (
          <div
            className="fixed inset-0 z-[64] flex items-end bg-slate-950/45"
            role="dialog"
            aria-modal="true"
            onClick={() => {
              if (!fullVisitReanalyzing) setFullVisitReanalyzeConfirmOpen(false);
            }}
          >
            <div className="w-full rounded-t-3xl bg-white px-4 pb-6 pt-4 shadow-2xl" onClick={(event) => event.stopPropagation()}>
              <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-slate-200" />
              <div className="text-sm font-semibold text-slate-900">{visit?.visit_code ?? visit?.store_name ?? text.reanalyzeFullVisit}</div>
              <div className="mt-1 text-sm font-semibold text-slate-900">{confirmFullVisitReanalyzeTitle}</div>
              <div className="mt-2 text-sm leading-6 text-slate-600">{confirmFullVisitReanalyzeDescription}</div>
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  disabled={fullVisitReanalyzing}
                  onClick={() => {
                    void reanalyzeFullVisit().then(() => {
                      setFullVisitReanalyzeConfirmOpen(false);
                    });
                  }}
                  className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {fullVisitReanalyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                  {fullVisitReanalyzing ? reanalyzingLabel : confirmFullVisitReanalyzeActionLabel}
                </button>
                <button
                  type="button"
                  disabled={fullVisitReanalyzing}
                  onClick={() => setFullVisitReanalyzeConfirmOpen(false)}
                  className="flex flex-1 items-center justify-center rounded-2xl bg-slate-100 px-4 py-3 text-sm font-medium text-slate-700 disabled:opacity-60"
                >
                  {text.close}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {rowDeleteConfirm ? (
          <div
            className="fixed inset-0 z-[65] flex items-end bg-slate-950/45"
            role="dialog"
            aria-modal="true"
            onClick={() => {
              if (!deletingRowCandidateIds.includes(rowDeleteConfirm.candidateId)) setRowDeleteConfirm(null);
            }}
          >
            <div className="w-full rounded-t-3xl bg-white px-4 pb-6 pt-4 shadow-2xl" onClick={(event) => event.stopPropagation()}>
              <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-slate-200" />
              <div className="line-clamp-2 text-sm font-semibold text-slate-900">{rowDeleteConfirm.label}</div>
              <div className="mt-1 text-sm font-semibold text-red-700">{deleteRowLabel}</div>
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  disabled={deletingRowCandidateIds.includes(rowDeleteConfirm.candidateId)}
                  onClick={() => {
                    const candidateId = rowDeleteConfirm.candidateId;
                    void deleteRow(candidateId).then((deleted) => {
                      if (deleted) setRowDeleteConfirm((current) => current?.candidateId === candidateId ? null : current);
                    });
                  }}
                  className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-red-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {deletingRowCandidateIds.includes(rowDeleteConfirm.candidateId) ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  {deletingRowCandidateIds.includes(rowDeleteConfirm.candidateId) ? deletingLabel : deleteRowLabel}
                </button>
                <button
                  type="button"
                  disabled={deletingRowCandidateIds.includes(rowDeleteConfirm.candidateId)}
                  onClick={() => setRowDeleteConfirm(null)}
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
  visitAnalysisInProgress,
  text,
  localUploadsByImageId,
  candidates,
  deletingImageIds,
  retryingImageIds,
  aiJobImageIds,
  onPreview,
  onOpenActions,
  onOpenRowActions,
  onConfirmRow,
  confirmingRowCandidateIds,
  deletingRowCandidateIds,
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
  visitAnalysisInProgress: boolean;
  text: ReturnType<typeof detailText>;
  localUploadsByImageId: Record<string, LocalUploadState>;
  candidates: AiPriceCandidate[];
  deletingImageIds: string[];
  retryingImageIds: string[];
  aiJobImageIds: string[];
  onPreview: (image: { url: string; label: string }) => void;
  onPreviewStored: (image: { imageId?: string; path: string; label: string }) => void;
  onOpenActions: (imageId: string, category: "makuku_shelf" | "competitor_shelf", label: string) => void;
  onOpenRowActions: (section: PriceParseSection, row: StoreVisitPriceImageAnalysis["rows"][number], rowIndex: number, candidate: AiPriceCandidate) => void;
  onConfirmRow: (candidateId: string) => void;
  confirmingRowCandidateIds: string[];
  deletingRowCandidateIds: string[];
  onRetakeFile: (imageId: string, file: File) => void;
  cameraRetakeInputRefs: MutableRefObject<Record<string, HTMLInputElement | null>>;
  albumRetakeInputRefs: MutableRefObject<Record<string, HTMLInputElement | null>>;
}) {
  const photoActionsLabel = textOrFallback(text.photoActions, locale === "zh" ? "鐓х墖鎿嶄綔" : "Photo actions");

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
            const isReanalyzingImage = aiJobImageIds.includes(section.image.id);
            const priceRowsPending = visitAnalysisInProgress || retryingImageIds.includes(section.image.id) || isAnalyzingImage || isReanalyzingImage || (isProcessingRetake && sectionLocalUpload?.status === "analyzing");
            const displayRows = buildPriceDisplayRows(candidates, section.image.id, section.result?.rows ?? []);
            const needsRetake = isRetakeRequiredPriceImage(section.image);
            const isActionDisabled = updateLocked || isReanalyzingImage || retryingImageIds.includes(section.image.id) || deletingImageIds.includes(section.image.id);

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
                  disabled={updateLocked || isAnalyzingImage || isReanalyzingImage}
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
                  disabled={updateLocked || isAnalyzingImage || isReanalyzingImage}
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
                {(isAnalyzingImage || isReanalyzingImage) && !isProcessingRetake ? (
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
                  onClick={() => sectionLocalUpload?.previewUrl
                    ? onPreview({ url: previewUrl, label: `${text.photoPrefix}${index + 1}` })
                    : onPreviewStored({
                      imageId: section.image.id,
                      path: section.signedImage?.path ?? section.image.image_path,
                      label: `${text.photoPrefix}${index + 1}`,
                    })}
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
            {priceRowsPending ? null : displayRows.length ? displayRows.map((displayRow) => {
              const { row, rowIndex, rowKey, candidate, displayCandidate } = displayRow;
              const displayPieceCount = candidateDisplayPieceCount(displayCandidate, row.piece_count);
              const displayPricePerPiece = candidateDisplayPricePerPiece(displayCandidate, row.price_per_piece_idr);
              const matchInfo = candidateMatchDisplay(displayCandidate);
              const listPrice = candidateDisplayListPrice(displayCandidate, row.list_price_idr ?? row.package_price_idr ?? null);
              const netPrice = candidateDisplayNetPrice(displayCandidate, row.net_price_idr ?? null);
              const needsConfirmation = rowNeedsConfirmation(row, displayCandidate);
              const quickConfirmAvailable = needsConfirmation && canQuickConfirmRow(candidate);
              const isConfirmingRow = Boolean(candidate?.id && confirmingRowCandidateIds.includes(candidate.id));
              const isDeletingRow = Boolean(candidate?.id && deletingRowCandidateIds.includes(candidate.id));
              return (
                <div key={rowKey} className="rounded-lg bg-white px-3 py-2 text-xs shadow-sm">
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
                    <div className="line-clamp-1 min-w-0 text-sm font-semibold leading-5 text-slate-900">{row.sku}</div>
                    <div className="flex shrink-0 items-center gap-2">
                      {quickConfirmAvailable && candidate?.id ? (
                        <button
                          type="button"
                          disabled={isConfirmingRow}
                          onClick={() => onConfirmRow(candidate.id)}
                          className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-emerald-600 px-2 py-0.5 text-[11px] font-semibold leading-5 text-white disabled:opacity-60"
                        >
                          {isConfirmingRow ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                          {text.confirmRow}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        disabled={!candidate || isDeletingRow}
                        onClick={() => {
                          if (candidate) onOpenRowActions(section, row, rowIndex, candidate);
                        }}
                        className="shrink-0 whitespace-nowrap text-[11px] font-semibold leading-5 text-blue-600 disabled:text-slate-300"
                      >
                        {text.editRow}
                      </button>
                    </div>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    {needsConfirmation ? (
                      <span className="rounded-full bg-amber-100 px-2 py-[1px] text-[10px] font-semibold leading-4 text-amber-700">
                        {text.needsConfirmationText}
                      </span>
                    ) : null}
                    <span className={`break-words text-[10px] leading-4 ${matchInfo.matched ? "text-slate-500" : "font-semibold text-red-600"}`}>
                      {matchInfo.matched ? matchInfo.label : text.rowUnmatched}
                    </span>
                  </div>
                  <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1">
                    <PriceMetricRow label={text.listPrice} value={formatMoney(listPrice)} />
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
  const previewText = rowEditorPreviewText();
  const previewNetPrice = Number(rowEdit.netPrice);
  const previewPieceCount = Number(rowEdit.pieceCount);
  const computedRowPricePerPiece = Number.isFinite(previewNetPrice) && previewNetPrice > 0 && Number.isFinite(previewPieceCount) && previewPieceCount > 0
    ? Math.round((previewNetPrice / previewPieceCount) * 100) / 100
    : null;
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
        <div className="mt-1 line-clamp-2 text-[13px] leading-5 text-slate-500">{rowEdit.sku}</div>

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
            <div className="mb-1 flex items-center justify-between gap-2 text-xs font-medium text-slate-500">
              <span>{previewText.pricePerPieceAuto}</span>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                {previewText.autoCalculated}
              </span>
            </div>
            <input
              value={computedRowPricePerPiece === null ? "-" : formatMoney(computedRowPricePerPiece)}
              readOnly
              className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-700 outline-none"
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

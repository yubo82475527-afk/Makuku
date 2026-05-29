import type { Dictionary } from "@/lib/i18n/get-dictionary";
import type { OfflineImageAnalysisStatus, OfflineImageType, OfflineVisitStatus } from "@/lib/types";

export function imageTypeLabel(dict: Dictionary, imageType: OfflineImageType) {
  const labels: Record<OfflineImageType, string> = {
    own_shelf: dict.offlineUploads.ownShelf,
    competitor_shelf: dict.offlineUploads.competitorShelf,
    promo_tag: dict.offlineUploads.promoTag,
    other: dict.offlineUploads.otherImage,
  };
  return labels[imageType];
}

export function analysisStatusLabel(dict: Dictionary, status: OfflineImageAnalysisStatus) {
  const labels: Record<OfflineImageAnalysisStatus, string> = {
    pending: dict.offlineUploads.statusPending,
    analyzing: dict.offlineUploads.statusAnalyzing,
    analyzed: dict.offlineUploads.statusAnalyzed,
    failed: dict.offlineUploads.statusFailed,
    reviewed: dict.offlineUploads.statusReviewed,
  };
  return labels[status];
}

export function visitStatusLabel(status: OfflineVisitStatus) {
  return status.replaceAll("_", " ");
}

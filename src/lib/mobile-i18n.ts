import type { Locale } from "@/lib/i18n/config";
import type { OfflineImageType, StoreVisitAnalysisStatus, StoreVisitImageCategory } from "@/lib/types";

type ResultCopy = Record<
  | "validation"
  | "validAnalysis"
  | "needsReview"
  | "warnings"
  | "rawExtraction"
  | "missingBrand"
  | "missingProduct"
  | "noPriceCaptured"
  | "confidence"
  | "noRawItems"
  | "shelfUnderstanding"
  | "coverage"
  | "condition"
  | "shelfShare"
  | "noShelfData"
  | "priceInsights"
  | "priceUnclear"
  | "packagePrice"
  | "pieceCount"
  | "perPiecePrice"
  | "stockRisk"
  | "promotionInsights"
  | "promoPressure"
  | "storeSummary"
  | "debugRawAi",
  string
>;

export type MobileCopy = Record<
  | "myVisits"
  | "signInFirst"
  | "goToCapture"
  | "new"
  | "newVisit"
  | "refreshVisits"
  | "todaysVisitCount"
  | "visits"
  | "loadingVisits"
  | "loadingVisit"
  | "loadMore"
  | "loading"
  | "noVisitsYet"
  | "noSummaryYet"
  | "photos"
  | "photoSection"
  | "aiStoreVisit"
  | "newVisitHint"
  | "storeInformation"
  | "storeName"
  | "region"
  | "promoter"
  | "shelfPhotos"
  | "makukuShelfPhotos"
  | "competitorShelfPhotos"
  | "storefrontPhotos"
  | "uncategorizedPhotos"
  | "uploaded"
  | "add"
  | "noPhotosYet"
  | "submitStoreVisit"
  | "submitting"
  | "completeStoreInfo"
  | "uploadAtLeastOnePhoto"
  | "uploadMakukuShelfRequired"
  | "submitFailed"
  | "networkRetry"
  | "storeVisit"
  | "loadVisitFailed"
  | "analysisStatus"
  | "analyzeStore"
  | "retryAnalyze"
  | "aiAnalysisFailed"
  | "resultEmpty"
  | "statusPending"
  | "statusAnalyzing"
  | "statusCompleted"
  | "statusFailed",
  string
> & { result: ResultCopy };

export const mobileCopy: Record<Locale, MobileCopy> = {
  en: {
    myVisits: "My Visits",
    signInFirst: "Sign in from the mobile capture page first.",
    goToCapture: "Go to Capture",
    new: "New",
    newVisit: "New Visit",
    refreshVisits: "Refresh visits",
    todaysVisitCount: "Today's Visit Count",
    visits: "visits",
    loadingVisits: "Loading visits...",
    loadingVisit: "Loading visit...",
    loadMore: "Load More",
    loading: "Loading...",
    noVisitsYet: "No visits yet.",
    noSummaryYet: "No summary yet.",
    photos: "photos",
    photoSection: "Photos",
    aiStoreVisit: "AI Store Visit",
    newVisitHint: "Upload Makuku shelf photos, competitor shelf photos, and storefront photos for one store-level analysis.",
    storeInformation: "Store Information",
    storeName: "Store Name",
    region: "Region",
    promoter: "Promoter",
    shelfPhotos: "Visit Photos",
    makukuShelfPhotos: "Makuku Shelf",
    competitorShelfPhotos: "Competitor Shelf",
    storefrontPhotos: "Storefront Photo",
    uncategorizedPhotos: "Photos",
    uploaded: "uploaded",
    add: "Add",
    noPhotosYet: "No photos yet",
    submitStoreVisit: "Submit Store Visit",
    submitting: "Submitting...",
    completeStoreInfo: "Please complete store information.",
    uploadAtLeastOnePhoto: "Please upload at least one shelf photo.",
    uploadMakukuShelfRequired: "Please upload at least one Makuku shelf photo.",
    submitFailed: "Failed to submit store visit.",
    networkRetry: "Network error. Please retry.",
    storeVisit: "Store Visit",
    loadVisitFailed: "Failed to load store visit.",
    analysisStatus: "Analysis Status",
    analyzeStore: "Analyze Store",
    retryAnalyze: "Retry Analyze",
    aiAnalysisFailed: "AI analysis failed",
    resultEmpty: "Click Analyze Store to generate the AI Result Card.",
    statusPending: "Pending",
    statusAnalyzing: "Analyzing",
    statusCompleted: "Completed",
    statusFailed: "Failed",
    result: {
      validation: "Validation",
      validAnalysis: "Valid analysis",
      needsReview: "Needs review",
      warnings: "warning(s)",
      rawExtraction: "Raw Extraction",
      missingBrand: "Missing brand",
      missingProduct: "Missing product",
      noPriceCaptured: "No price captured",
      confidence: "confidence",
      noRawItems: "No raw extraction items were returned by the model.",
      shelfUnderstanding: "A. Shelf Understanding",
      coverage: "Coverage",
      condition: "Condition",
      shelfShare: "shelf share",
      noShelfData: "No brand-level shelf data detected.",
      priceInsights: "B. Price Insights",
      priceUnclear: "Price unclear",
      packagePrice: "Package",
      pieceCount: "Pcs",
      perPiecePrice: "Per piece",
      stockRisk: "C. Stock Risk",
      promotionInsights: "D. Promotion Insights",
      promoPressure: "Promo Pressure",
      storeSummary: "E. Store Summary",
      debugRawAi: "Debug Raw AI",
    },
  },
  zh: {
    myVisits: "我的巡店",
    signInFirst: "请先从移动采集页登录。",
    goToCapture: "去采集",
    new: "新增",
    newVisit: "新增巡店",
    refreshVisits: "刷新巡店列表",
    todaysVisitCount: "今日巡店数",
    visits: "次巡店",
    loadingVisits: "正在加载巡店...",
    loadingVisit: "正在加载巡店详情...",
    loadMore: "加载更多",
    loading: "加载中...",
    noVisitsYet: "暂无巡店记录。",
    noSummaryYet: "暂无摘要。",
    photos: "张照片",
    photoSection: "照片",
    aiStoreVisit: "AI 巡店采集",
    newVisitHint: "上传 Makuku 货架、竞品货架和店面图片，系统会生成一份门店级分析结果。",
    storeInformation: "门店信息",
    storeName: "门店名称",
    region: "区域",
    promoter: "导购员",
    shelfPhotos: "巡店照片",
    makukuShelfPhotos: "Makuku 货架",
    competitorShelfPhotos: "竞品货架",
    storefrontPhotos: "店面图片",
    uncategorizedPhotos: "照片",
    uploaded: "已上传",
    add: "添加",
    noPhotosYet: "暂无照片",
    submitStoreVisit: "提交巡店",
    submitting: "提交中...",
    completeStoreInfo: "请完整填写门店信息。",
    uploadAtLeastOnePhoto: "请至少上传一张货架照片。",
    uploadMakukuShelfRequired: "请至少上传一张 Makuku 货架照片。",
    submitFailed: "提交巡店失败。",
    networkRetry: "网络错误，请重试。",
    storeVisit: "巡店详情",
    loadVisitFailed: "加载巡店详情失败。",
    analysisStatus: "分析状态",
    analyzeStore: "分析门店",
    retryAnalyze: "重新分析",
    aiAnalysisFailed: "AI 分析失败",
    resultEmpty: "点击分析门店，生成 AI 结果卡片。",
    statusPending: "待分析",
    statusAnalyzing: "分析中",
    statusCompleted: "已完成",
    statusFailed: "失败",
    result: {
      validation: "校验",
      validAnalysis: "分析有效",
      needsReview: "需要复核",
      warnings: "条提醒",
      rawExtraction: "原始识别",
      missingBrand: "缺少品牌",
      missingProduct: "缺少商品",
      noPriceCaptured: "未识别到价格",
      confidence: "置信度",
      noRawItems: "模型未返回原始识别项。",
      shelfUnderstanding: "A. 货架理解",
      coverage: "覆盖度",
      condition: "陈列状态",
      shelfShare: "货架占比",
      noShelfData: "未识别到品牌级货架数据。",
      priceInsights: "B. 价格洞察",
      priceUnclear: "价格不清晰",
      packagePrice: "包价格",
      pieceCount: "片数",
      perPiecePrice: "片价格",
      stockRisk: "C. 库存风险",
      promotionInsights: "D. 促销洞察",
      promoPressure: "促销压力",
      storeSummary: "E. 门店摘要",
      debugRawAi: "调试：AI 原始返回",
    },
  },
};

export function getMobileCopy(locale: Locale): MobileCopy {
  return mobileCopy[locale] ?? mobileCopy.en;
}

export function mobileAnalysisStatusLabel(locale: Locale, status: StoreVisitAnalysisStatus | null | undefined) {
  const copy = getMobileCopy(locale);
  switch (status) {
    case "analyzing":
      return copy.statusAnalyzing;
    case "completed":
      return copy.statusCompleted;
    case "failed":
      return copy.statusFailed;
    default:
      return copy.statusPending;
  }
}

export function mobileImageCategoryLabel(locale: Locale, category: OfflineImageType | StoreVisitImageCategory | "uncategorized" | null | undefined) {
  const copy = getMobileCopy(locale);
  switch (category) {
    case "makuku_shelf":
    case "own_shelf":
      return copy.makukuShelfPhotos;
    case "competitor_shelf":
      return copy.competitorShelfPhotos;
    case "storefront":
      return copy.storefrontPhotos;
    default:
      return copy.uncategorizedPhotos;
  }
}

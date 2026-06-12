export type Channel = "shopee" | "tiktok" | "offline" | "manual";
export type ChannelType = "online" | "offline";
export type PackType = "pants" | "tape" | "unknown";
export type Segment = "AD" | "BD Eco" | "BD MID" | "unknown";
export type MatchMethod = "rule" | "ai" | "manual";
export type Severity = "low" | "medium" | "high" | "critical";
export type PromoEventType =
  | "price_drop"
  | "flash_sale"
  | "voucher"
  | "bundle"
  | "offline_display"
  | "buy_more_save"
  | "unknown";
export type OfflineVisitStatus = "draft" | "uploaded" | "analyzing" | "analyzed" | "reviewed" | "failed";
export type OfflineImageType = "own_shelf" | "competitor_shelf" | "promo_tag" | "other";
export type OfflineImageAnalysisStatus = "pending" | "analyzing" | "analyzed" | "failed" | "reviewed";
export type StoreVisitAnalysisStatus = "pending" | "analyzing" | "completed" | "failed";
export type StoreVisitImageCategory = "makuku_shelf" | "competitor_shelf" | "storefront";
export type StockRiskLevel = "Normal" | "Low Stock" | "Out of Stock Risk";
export type PromotionType = "Discount" | "Buy 1 Get 1" | "Buy 2 Get 1" | "Promo Tag" | "Special Offer";
export type CategoryCoverage = "FULL" | "PARTIAL" | "FRAGMENTED";
export type ShelfCondition = "WELL_ORGANISED" | "NORMAL" | "MESSY";
export type PriceInsightTag = "HERO" | "PROMO" | "ANOMALY";
export type StockRiskSignal = "EMPTY_FACING" | "LOW_FACING" | "BLOCKED_SHELF";
export type PromotionVisibility = "LOW" | "MEDIUM" | "HIGH";
export type PromoPressureLevel = "LOW" | "MEDIUM" | "HIGH";
export type RawExtractionType = "SKU" | "PROMO" | "SHELF_SIGNAL";
export type ValidationWarningType = "MISSING_DATA" | "LOW_CONFIDENCE" | "PARSE_RISK";

export type StoreVisitAiResult = {
  raw_extraction: {
    detected_items: {
      brand: string;
      product: string;
      price: string;
      type: RawExtractionType;
      confidence: number;
    }[];
  };
  validation: {
    is_valid: boolean;
    warnings: {
      type: ValidationWarningType;
      message: string;
    }[];
  };
  shelf_understanding: {
    brands_present: {
      brand: string;
      shelf_share_estimate: number;
    }[];
    category_coverage: CategoryCoverage;
    shelf_condition: ShelfCondition;
    facings_estimate: {
      brand: string;
      facing_count_estimate: number;
    }[];
  };
  price_insights: {
    brand_price_range: {
      brand: string;
      min_price: string;
      max_price: string;
    }[];
    key_sku_prices: {
      brand: string;
      product: string;
      price: string;
      piece_count: number | null;
      tag: PriceInsightTag;
      confidence: number;
    }[];
  };
  price_detection: {
    brand: string;
    product: string;
    price: string;
  }[];
  stock_risk: {
    level: StockRiskLevel;
    affected_brands: {
      brand: string;
      risk_signal: StockRiskSignal;
    }[];
    reason: string;
  };
  promotion_insights: {
    competitor_promotions: {
      brand: string;
      type: PromotionType;
      visibility: PromotionVisibility;
      description: string;
    }[];
    promo_pressure_level: PromoPressureLevel;
  };
  competitor_promotion: {
    brand: string;
    promotion_type: PromotionType;
    description: string;
  }[];
  store_summary: string;
};

export type StoreVisitAiConfig = {
  id?: string;
  version_name: string;
  system_prompt: string;
  temperature: number;
  max_tokens: number;
  status?: "active" | "archived";
  last_test_visit_id?: string | null;
  last_test_result?: Record<string, unknown> | null;
  created_at?: string;
  activated_at?: string | null;
};

export type Brand = {
  id: string;
  name: string;
  country: string;
  is_own_brand: boolean;
  created_at: string;
};

export type CompetitorProduct = {
  id: string;
  brand_id: string;
  raw_title: string;
  normalized_name: string;
  channel: Channel;
  shop_name: string | null;
  product_url: string | null;
  image_url: string | null;
  pack_type: PackType;
  package_type: string;
  size: string | null;
  piece_count: number | null;
  segment: Segment;
  created_at: string;
  brands?: Pick<Brand, "id" | "name"> | null;
  sku_matches?: SkuMatch[];
};

export type SkuMaster = {
  id: string;
  makuku_sku_name: string;
  pack_type: PackType;
  size: string;
  piece_count: number;
  segment: Segment;
  target_price_per_piece: number;
  floor_price_per_piece: number;
  gross_margin_rate: number;
  active: boolean;
  created_at: string;
};

export type MaterialMaster = {
  tenant_sku_code: string;
  tenant_sku_name: string;
  category: string;
  sub_category: string;
  brand: string;
  sub_brand: string | null;
  type: string | null;
  sub_type: string | null;
  pack_count: number;
  box_count: number;
  pcs_price: number;
  f_expiry_date: string;
};

export type ChannelMaster = {
  id: string;
  code: string;
  name: string;
  type: ChannelType;
  sort_order: number;
  active: boolean;
  created_at: string;
};

export type AppUserStatus = "enabled" | "disabled";
export type AppUserRole = "field_agent" | "manager" | "admin";

export type AppUser = {
  id: string;
  username: string;
  display_name: string;
  role: AppUserRole;
  status?: AppUserStatus | null;
  disabled_at?: string | null;
  updated_at?: string | null;
  created_at: string;
};

export type OfflineStore = {
  id: string;
  name: string;
  city: string;
  province?: string | null;
  city_name?: string | null;
  district?: string | null;
  channel_type: string;
  channel_id: string | null;
  address: string | null;
  latitude?: number | null;
  longitude?: number | null;
  location_accuracy_m?: number | null;
  location_captured_at?: string | null;
  status?: "enabled" | "disabled" | null;
  disabled_at?: string | null;
  deleted_at?: string | null;
  created_by?: string | null;
  created_by_user_id?: string | null;
  created_by_name?: string | null;
  created_by_user?: string | null;
  created_at: string;
  channels?: Pick<ChannelMaster, "id" | "code" | "name" | "type"> | null;
};

export type MarketBenchmark = {
  id: string;
  market: string;
  province: string | null;
  city_name: string | null;
  district: string | null;
  category: string;
  product_line: string;
  price_band: string;
  size: string;
  benchmark_competitor_product_id: string | null;
  benchmark_sku_name: string;
  benchmark_price_per_piece: number;
  currency: string;
  active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string | null;
  competitor_products?: CompetitorProduct | null;
};

export type SkuMatch = {
  id: string;
  competitor_product_id: string;
  sku_master_id: string;
  match_score: number;
  match_method: MatchMethod;
  reviewed: boolean;
  created_at: string;
  sku_master?: SkuMaster | null;
};

export type PriceSnapshotVisit = {
  id: string;
  store_name: string;
  city: string;
  province?: string | null;
  city_name?: string | null;
  district?: string | null;
  channel_type?: string | null;
  visit_date?: string | null;
  uploader_name?: string | null;
  created_at?: string | null;
};

export type PriceSnapshotCandidate = {
  id: string;
  offline_store_visits?: PriceSnapshotVisit | null;
};

export type PriceSnapshot = {
  id: string;
  competitor_product_id: string;
  channel: Channel;
  list_price_idr: number;
  promo_price_idr: number;
  voucher_value_idr: number;
  shipping_subsidy_idr: number;
  net_price_idr: number;
  price_per_piece: number;
  promo_type: string | null;
  captured_at: string;
  source: string | null;
  evidence_url: string | null;
  created_at: string;
  competitor_products?: CompetitorProduct | null;
  ai_price_candidates?: PriceSnapshotCandidate[];
};

export type OfflineUpload = {
  id: string;
  uploader_name: string;
  city: string;
  store_name: string;
  channel_type: string;
  image_path: string;
  image_url: string | null;
  upload_status: "uploaded" | "ocr_processing" | "ocr_done" | "reviewed" | "rejected";
  created_at: string;
  offline_ocr_results?: OfflineOcrResult[];
};

export type OfflineOcrResult = {
  id: string;
  upload_id: string;
  detected_brand: string | null;
  detected_product: string | null;
  detected_price_idr: number | null;
  detected_promo_text: string | null;
  detected_piece_count: number | null;
  confidence_score: number | null;
  reviewed: boolean;
  corrected_brand: string | null;
  corrected_product: string | null;
  corrected_price_idr: number | null;
  corrected_piece_count: number | null;
  created_at: string;
};

export type VisionDetectedProduct = {
  brand_name: string | null;
  product_name_raw: string | null;
  product_name_normalized: string | null;
  pack_type: PackType;
  size: string | null;
  piece_count: number | null;
  bundle_count: number | null;
  total_piece_count: number | null;
  list_price_idr: number | null;
  promo_price_idr: number | null;
  promo_mechanic: PromoEventType | "gift" | "cashback";
  promo_text_raw: string | null;
  confidence?: {
    brand?: number | null;
    product?: number | null;
    price?: number | null;
    piece_count?: number | null;
  };
};

export type OfflineImageVisionResult = {
  schema_version: "offline_image_vision_v1";
  image_type: OfflineImageType;
  target_brand?: string | null;
  image_quality: "good" | "blurry" | "dark" | "cropped" | "glare" | "low_resolution";
  needs_human_review: boolean;
  review_reasons: string[];
  detected_products: VisionDetectedProduct[];
  overall_confidence: number;
};

export type OfflineVisitImage = {
  id: string;
  visit_id: string;
  image_type: OfflineImageType;
  image_path: string;
  image_url: string | null;
  file_name: string;
  content_type: string;
  file_size: number;
  analysis_status: OfflineImageAnalysisStatus;
  vision_result: Partial<OfflineImageVisionResult> | null;
  error_message: string | null;
  uploaded_at: string;
  created_at: string;
};

export type OfflineStoreVisit = {
  id: string;
  store_name: string;
  region?: string | null;
  channel?: string | null;
  promoter?: string | null;
  image_urls?: string[] | null;
  image_categories?: StoreVisitImageCategory[] | null;
  ai_result?: StoreVisitAiResult | null;
  analysis_status?: StoreVisitAnalysisStatus | null;
  analysis_error?: string | null;
  city: string;
  province?: string | null;
  city_name?: string | null;
  district?: string | null;
  channel_type: string;
  store_id?: string | null;
  channel_id?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  location_accuracy_m?: number | null;
  location_captured_at?: string | null;
  uploader_name: string;
  user_id?: string | null;
  uploader_user_id?: string | null;
  visit_date: string;
  visit_status: OfflineVisitStatus;
  summary_result: Record<string, unknown> | null;
  created_at: string;
  offline_visit_images?: OfflineVisitImage[];
  signed_images?: {
    path: string;
    url: string | null;
    category?: OfflineImageType | StoreVisitImageCategory;
  }[];
};

export type AiPriceCandidateStatus = "pending" | "approved" | "rejected";
export type AiPriceCandidateMatchType = "material_master" | "competitor_product" | "unmatched";
export type AiPriceCandidateReviewMethod = "auto_rule" | "manual" | "bulk_manual";

export type AiPriceCandidate = {
  id: string;
  visit_id: string | null;
  raw_brand: string;
  raw_product: string;
  raw_price: string;
  parsed_price_idr: number | null;
  piece_count: number | null;
  price_per_piece: number | null;
  candidate_type: RawExtractionType;
  ai_confidence: number;
  matched_entity_type: AiPriceCandidateMatchType;
  matched_entity_id: string | null;
  matched_label: string | null;
  match_score: number;
  warnings: { type?: string; message: string }[];
  status: AiPriceCandidateStatus;
  price_snapshot_id: string | null;
  reviewed_piece_count: number | null;
  reviewed_price_per_piece: number | null;
  created_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  rejection_reason?: string | null;
  review_job_id?: string | null;
  review_method?: AiPriceCandidateReviewMethod | null;
  offline_store_visits?: Pick<OfflineStoreVisit, "id" | "store_name" | "city" | "province" | "city_name" | "district" | "channel_type" | "visit_date" | "created_at"> | null;
};

export type AiPriceReviewRule = {
  id: string;
  name: string;
  min_ai_confidence: number;
  min_match_score: number;
  require_matched_entity: boolean;
  require_no_warnings: boolean;
  require_price_and_piece: boolean;
  active: boolean;
  created_at: string;
  updated_at: string | null;
};

export type AiPriceReviewJobStatus = "queued" | "running" | "completed" | "failed";
export type AiPriceReviewJobAction = "approve" | "reject";
export type AiPriceReviewJobItemStatus = "queued" | "processing" | "succeeded" | "skipped" | "failed";

export type AiPriceReviewJob = {
  id: string;
  action: AiPriceReviewJobAction;
  status: AiPriceReviewJobStatus;
  rule_snapshot: Partial<AiPriceReviewRule>;
  filter_snapshot: Record<string, unknown>;
  rejection_reason: string | null;
  total_count: number;
  success_count: number;
  skipped_count: number;
  failed_count: number;
  created_by: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string | null;
};

export type AiPriceReviewJobItem = {
  id: string;
  job_id: string;
  candidate_id: string;
  status: AiPriceReviewJobItemStatus;
  error_message: string | null;
  created_at: string;
  updated_at: string | null;
  ai_price_candidates?: AiPriceCandidate | null;
};

export type PromoEvent = {
  id: string;
  competitor_product_id: string;
  sku_master_id: string | null;
  channel: Channel;
  event_type: PromoEventType;
  event_title: string;
  event_summary: string | null;
  old_price_per_piece: number | null;
  new_price_per_piece: number | null;
  price_gap_vs_makuku_pct: number | null;
  severity: Severity;
  city: string | null;
  started_at: string;
  ended_at: string | null;
  evidence_url: string | null;
  created_at: string;
  competitor_products?: CompetitorProduct | null;
  sku_master?: SkuMaster | null;
  ai_strategy_recommendations?: AiStrategyRecommendation[];
};

export type PromoEventFeedSource = "promo_event" | "offline_capture" | "offline_upload";

export type PromoEventFeedStatus = "confirmed" | "pending_review";

export type PromoEventFeedItem = {
  id: string;
  source: PromoEventFeedSource;
  sourceId: string;
  detailHref?: string | null;
  channel: Channel;
  channelCode: string;
  severity: Severity | null;
  brandName: string | null;
  brandId: string | null;
  category: string;
  productName: string | null;
  city: string | null;
  date: string;
  storeName: string | null;
  activityName: string;
  discountRate: number | null;
  discountLabel: string;
  status: PromoEventFeedStatus;
  evidenceUrl: string | null;
};

export type DashboardCategoryChannelCell = {
  category: string;
  channelCode: string;
  promoCount: number;
  maxSeverity: Severity | null;
  maxDiscountRate: number | null;
  recentPromoCount: number;
  signalType: "risk" | "opportunity" | "neutral";
  href: string;
};

export type DashboardCategoryChannelRow = {
  category: string;
  totalPromoCount: number;
  cells: DashboardCategoryChannelCell[];
};

export type DashboardCityChannelCell = {
  city: string;
  channelCode: string;
  promoCount: number;
  maxSeverity: Severity | null;
  maxDiscountRate: number | null;
  recentPromoCount: number;
  signalType: "risk" | "opportunity" | "neutral";
  href: string;
};

export type DashboardCityChannelRow = {
  city: string;
  storeCount: number;
  totalPromoCount: number;
  cells: DashboardCityChannelCell[];
};

export type DashboardBattleMapCity = {
  city: string;
  storeCount: number;
  promoCount: number;
  recentPromoCount: number;
  maxSeverity: Severity | null;
  maxDiscountRate: number | null;
  makukuShareAvg: number | null;
  shareSampleCount: number;
  captured: boolean;
  competitionLevel: "strong" | "medium" | "weak" | "unknown";
  x: number;
  y: number;
  href: string;
};

export type DashboardInsight = {
  id: string;
  title: string;
  summary: string;
  level: Severity;
  href: string | null;
};

export type DashboardLowAccuracyItem = {
  id: string;
  brand: string;
  product: string;
  accuracy: number;
  aiPricePerPiece: number;
  reviewedPricePerPiece: number;
  reviewedAt: string | null;
};

export type DashboardCollectionEfficiency = {
  todayVisitCount: number;
  weekVisitCount: number;
  weekStoreCount: number;
  aiCandidateCount: number;
  pendingCandidateCount: number;
  approvedCandidateCount: number;
  approvedAccuracy: number | null;
  lowAccuracyItems: DashboardLowAccuracyItem[];
};

export type DashboardCategoryChannelMatrix = {
  categories: string[];
  channels: ChannelMaster[];
  rows: DashboardCategoryChannelRow[];
  cityRows: DashboardCityChannelRow[];
  battleMapCities: DashboardBattleMapCity[];
  collection: DashboardCollectionEfficiency;
  insights: {
    growthOpportunities: DashboardInsight[];
    riskInsights: DashboardInsight[];
  };
  totals: {
    categoryCount: number;
    channelCount: number;
    cityCount: number;
    storeCount: number;
    recentPromoCount: number;
  };
};

export type ProductSegmentBattle = {
  id: string;
  market: string;
  province: string | null;
  cityName: string | null;
  district: string | null;
  category: string;
  line: string;
  size: string;
  priceBand: string;
  label: string;
  segmentLabels: Segment[];
  makukuSkuCount: number;
  makukuSkuNames: string[];
  targetPriceMin: number | null;
  targetPriceMax: number | null;
  floorPriceMin: number | null;
  floorPriceMax: number | null;
  competitorProductCount: number;
  evidenceCount: number;
  promoEventCount: number;
  lowestCompetitorPricePerPiece: number | null;
  strongestCompetitorBrand: string | null;
  strongestChannel: Channel | null;
  benchmarkSkuName: string | null;
  benchmarkPricePerPiece: number | null;
  priceIndex: number | null;
  problemStoreCount: number;
  pendingEvidenceCount: number;
  worstProblemStore: {
    id: string | null;
    name: string;
    province: string | null;
    cityName: string | null;
    district: string | null;
    evidence: string;
    pricePerPiece: number | null;
    tags: string[];
  } | null;
  problemStoreNames: string[];
  targetGapPct: number | null;
  floorGapPct: number | null;
  severity: Severity;
  latestCapturedAt: string | null;
  href: string;
};

export type ProductSegmentBattleSummary = {
  segmentCount: number;
  pressuredSegmentCount: number;
  belowFloorSegmentCount: number;
  evidenceCount: number;
  competitorProductCount: number;
  lowIndexSegmentCount: number;
  nearIndexSegmentCount: number;
  missingBenchmarkSegmentCount: number;
  problemStoreCount: number;
};

export type OpportunityActionType =
  | "review_price"
  | "capture_evidence"
  | "inspect_promo"
  | "defend_city"
  | "expand_channel";

export type OpportunityActionStatus =
  | "open"
  | "pending_review"
  | "capture_needed"
  | "completed";

export type OpportunityAction = {
  id: string;
  type: OpportunityActionType;
  status: OpportunityActionStatus;
  title: string;
  reason: string;
  evidence: string;
  priorityScore: number;
  severity: Severity | null;
  city: string | null;
  channelCode: string | null;
  category: string | null;
  brandName: string | null;
  productName: string | null;
  href: string;
  sourceIds: string[];
};

export type RecommendedAction = {
  channel: string;
  action: string;
  reason: string;
  priority: "low" | "medium" | "high";
};

export type AiStrategyRecommendation = {
  id: string;
  promo_event_id: string;
  risk_level: Severity;
  impact_summary: string;
  recommended_actions: RecommendedAction[];
  suggested_price_per_piece: number | null;
  margin_impact_summary: string | null;
  confidence_score: number | null;
  status: "draft" | "accepted" | "rejected" | "edited";
  reviewer_note: string | null;
  created_at: string;
};

export type AlertRule = {
  id: string;
  name: string;
  rule_type: "price_gap" | "price_drop" | "new_promo" | "offline_event";
  threshold: number | null;
  channel: string | null;
  active: boolean;
  created_at: string;
};

export type Alert = {
  id: string;
  promo_event_id: string | null;
  alert_rule_id: string | null;
  title: string;
  message: string;
  severity: Severity;
  read: boolean;
  created_at: string;
  promo_events?: PromoEvent | null;
};

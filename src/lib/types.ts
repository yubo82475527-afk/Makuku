export type Channel = "shopee" | "tiktok" | "offline" | "manual";
export type PackType = "pants" | "tape" | "unknown";
export type Segment = "premium" | "mid" | "value" | "unknown";
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
  channel_type: string;
  uploader_name: string;
  user_id?: string | null;
  uploader_user_id?: string | null;
  visit_date: string;
  visit_status: OfflineVisitStatus;
  summary_result: Record<string, unknown> | null;
  created_at: string;
  offline_visit_images?: OfflineVisitImage[];
};

export type AiPriceCandidateStatus = "pending" | "approved" | "rejected";
export type AiPriceCandidateMatchType = "material_master" | "competitor_product" | "unmatched";

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
  offline_store_visits?: Pick<OfflineStoreVisit, "id" | "store_name" | "city" | "channel_type" | "visit_date" | "created_at"> | null;
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

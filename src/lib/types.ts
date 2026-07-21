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
export type StoreVisitAnalysisStatus = "pending" | "analyzing" | "completed" | "partial" | "action_required" | "failed";
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
export type PriceBasis =
  | "VISIBLE_PACKAGE_PRICE"
  | "VISIBLE_PROMO_PACKAGE_PRICE"
  | "VISIBLE_PRICE_PER_PIECE"
  | "RECONCILED_PACKAGE_PRICE";
export type PriceEvidenceStatus = "CLEAR" | "LOW_CONFIDENCE" | "DERIVED" | "CONFLICT" | "REVIEW_REQUIRED";
export type PriceReviewDecision = "AUTO_APPROVE" | "NEED_REVIEW";
export type PriceEvidenceReasonCode =
  | "PRODUCT_PRICE_BINDING_UNCLEAR"
  | "PRICE_TAG_UNCLEAR"
  | "PIECE_COUNT_UNCLEAR"
  | "PRICE_MATH_CONFLICT"
  | "PRICE_DERIVED"
  | "LEGACY_EVIDENCE_UNAVAILABLE";

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
      list_price?: string | null;
      package_price?: string | null;
      net_price?: string | null;
      promo_type?: string | null;
      piece_count: number | null;
      piece_count_text?: string | null;
      normal_package_text?: string | null;
      normal_piece_text?: string | null;
      promo_package_text?: string | null;
      promo_piece_text?: string | null;
      promo_label?: string | null;
      list_price_text?: string | null;
      package_price_text?: string | null;
      net_price_text?: string | null;
      visible_price_per_piece_text?: string | null;
      visible_price_per_piece_idr?: number | null;
      price_basis?: PriceBasis | null;
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

export type StoreVisitPriceImageRow = {
  source_type?: "PRICE_BOARD_ROW" | "PRICE_TAG" | string | null;
  group_id?: string | null;
  section_title?: string | null;
  row_anchor?: string | null;
  brand?: string | null;
  product_family_text?: string | null;
  sku: string;
  piece_count_text?: string | null;
  normal_package_text?: string | null;
  normal_piece_text?: string | null;
  promo_package_text?: string | null;
  promo_piece_text?: string | null;
  promo_label?: string | null;
  normal_package_price_confidence?: number | null;
  promo_package_price_confidence?: number | null;
  normal_per_piece_price_confidence?: number | null;
  promo_per_piece_price_confidence?: number | null;
  piece_count_confidence?: number | null;
  row_binding_confidence?: number | null;
  section_binding_confidence?: number | null;
  product_identity_confidence?: number | null;
  list_price_text?: string | null;
  package_price_text?: string | null;
  net_price_text?: string | null;
  visible_price_per_piece_text?: string | null;
  list_price_idr: number | null;
  package_price_idr: number | null;
  net_price_idr: number | null;
  visible_price_per_piece_idr?: number | null;
  price_basis?: PriceBasis | null;
  ai_confidence?: number | null;
  legacy_confidence_fallback?: boolean;
  price_evidence_status?: PriceEvidenceStatus | null;
  price_evidence_confidence?: number | null;
  price_evidence_detail?: Record<string, unknown> | null;
  price_evidence_reason_code?: PriceEvidenceReasonCode | null;
  conflicts?: { type?: string; message: string }[];
  review_decision?: PriceReviewDecision;
  promo_type: string | null;
  piece_count: number | null;
  price_per_piece_idr: number | null;
};

export type StoreVisitPhotoQualityReason =
  | "price_unclear"
  | "angled_affects_reading"
  | "price_obstructed";

export type StoreVisitPhotoQuality = {
  status: "pass" | "retake_required";
  reasons: StoreVisitPhotoQualityReason[];
  message: string;
};

export type StoreVisitPriceImageAnalysis = {
  schema_version: "store_visit_price_image_v1";
  upload_category: StoreVisitImageCategory;
  photo_quality: StoreVisitPhotoQuality;
  rows: StoreVisitPriceImageRow[];
  summary: string;
  warnings: {
    type: "MISSING_DATA" | "LOW_CONFIDENCE" | "PARSE_RISK";
    message: string;
  }[];
  prompt_version?: string;
  prompt_hash?: string;
  analysis_metadata?: Record<string, unknown>;
  review_decision?: PriceReviewDecision;
  conflicts?: { type?: string; message: string }[];
};

export type StoreVisitDisplayAnalysis = {
  schema_version: "store_visit_display_v1";
  summary: string;
  observations: string[];
  warnings: {
    type: "MISSING_DATA" | "LOW_CONFIDENCE" | "PARSE_RISK";
    message: string;
  }[];
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

export type AiApiFamily = "chat_completions" | "responses";

export type AiRequestDiagnostic = {
  model: string;
  base_url: string;
  api_family: AiApiFamily;
  request_url: string;
  response_format: "json_object" | "none";
  parse_repaired: boolean;
  fallback_used: boolean;
  fallback_reason?: string;
  attempt_count: number;
  http_status?: number;
  provider_request_id?: string;
  provider_error_type?: string;
  provider_error_code?: string;
  usage?: unknown;
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
  competitor_sku_code?: string | null;
  raw_title: string;
  normalized_name: string;
  product_series?: string | null;
  channel: Channel;
  shop_name: string | null;
  product_url: string | null;
  image_url: string | null;
  pack_type: PackType;
  package_type: string;
  size: string | null;
  piece_count: number | null;
  segment: Segment;
  status?: "active" | "disabled" | null;
  updated_at?: string | null;
  created_at: string;
  brands?: Pick<Brand, "id" | "name"> | null;
};

export type SkuMaster = {
  id: string;
  material_sku_code: string | null;
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
  material_master?: MaterialMaster | null;
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
export type AgentReportFamily = "daily" | "weekly" | "monthly";
export type AgentReportType = AgentReportFamily;
export type AgentReportScopeType = "global" | "organization" | "user";
export type AgentReportStatus = "draft" | "generated" | "sent" | "failed";
export type AgentReportRecipientStatus = "pending" | "sent" | "failed";
export type AgentReportDeliveryChannel = "user" | "chat";
export type AgentReportRecipientType = "user" | "chat";

export type AppUser = {
  id: string;
  username: string;
  display_name: string;
  email?: string | null;
  feishu_user_id?: string | null;
  password_login_enabled?: boolean | null;
  feishu_org_mismatch?: boolean | null;
  role: AppUserRole;
  status?: AppUserStatus | null;
  disabled_at?: string | null;
  updated_at?: string | null;
  created_at: string;
  organization_members?: OrganizationMember[];
};

export type OrganizationStatus = "active" | "inactive";
export type OrganizationAssignmentMethod = "auto_region_rule" | "manual" | "ai_suggested";

export type Organization = {
  id: string;
  name: string;
  status: OrganizationStatus;
  notes?: string | null;
  created_at: string;
  updated_at?: string | null;
  member_count?: number;
  region_rule_count?: number;
  organization_members?: OrganizationMember[];
  organization_region_rules?: OrganizationRegionRule[];
};

export type OrganizationMember = {
  id: string;
  organization_id: string;
  app_user_id: string;
  active: boolean;
  created_at: string;
  updated_at?: string | null;
  app_users?: Pick<AppUser, "id" | "username" | "display_name" | "email" | "feishu_user_id" | "role" | "status"> | null;
  organizations?: Pick<Organization, "id" | "name" | "status"> | null;
};

export type OrganizationRegionRule = {
  id: string;
  organization_id: string;
  province: string;
  city_name?: string | null;
  district?: string | null;
  active: boolean;
  created_at: string;
  updated_at?: string | null;
  organizations?: Pick<Organization, "id" | "name" | "status"> | null;
};

export type AgentReportMetricSummary = {
  visited_store_count: number;
  visiting_employee_count: number;
  makuku_price_record_count: number;
  competitor_price_record_count: number;
};

export type AgentReportMetricRow = {
  scope_name: string;
  visited_store_count: number;
  visiting_employee_count: number;
  makuku_price_record_count: number;
  competitor_price_record_count: number;
};

export type AgentReportPeriod = {
  reportFamily: AgentReportFamily;
  reportDefinitionCode: string;
  anchor: string;
  startDate: string;
  endDate: string;
  label: string;
  timezone: string;
};

export type AgentReportDefinition = {
  code: string;
  family: AgentReportFamily;
  name: string;
  description: string;
  enabled: boolean;
  supported_scope_types: AgentReportScopeType[];
  default_schedule_rule: {
    send_time_local: string;
    send_weekday?: number | null;
    send_day_of_month?: number | null;
  };
  template_version: number;
};

export type AgentReportMetricsJson = {
  summary: AgentReportMetricSummary;
  table_rows: AgentReportMetricRow[];
  period: AgentReportPeriod;
  scope: {
    scope_type: AgentReportScopeType;
    scope_id: string | null;
    scope_name: string;
  };
  warnings: string[];
};

export type AgentReportContentJson = {
  title: string;
  key_translations: string;
  ai_insight: string;
  highlights: string[];
  warnings: string[];
};

export type AgentReportDeliverySummary = {
  recipient_count: number;
  pending_count: number;
  sent_count: number;
  failed_count: number;
};

export type AgentReport = {
  id: string;
  report_type: AgentReportType;
  report_definition_code: string;
  report_family: AgentReportFamily;
  definition_name: string;
  template_version: number;
  period_start: string;
  period_end: string;
  timezone: string;
  scope_type: AgentReportScopeType;
  scope_id: string | null;
  scope_name: string;
  metrics_json: AgentReportMetricsJson;
  content_json: AgentReportContentJson;
  feishu_card_json: Record<string, unknown>;
  status: AgentReportStatus;
  generated_at: string;
  created_at: string;
  updated_at?: string | null;
  delivery_summary?: AgentReportDeliverySummary;
  matched_subscriptions_count?: number;
  recipients?: AgentReportRecipient[];
};

export type AgentReportRecipient = {
  id: string;
  report_id: string;
  app_user_id?: string | null;
  feishu_user_id?: string | null;
  feishu_chat_id?: string | null;
  delivery_channel: AgentReportDeliveryChannel;
  send_status: AgentReportRecipientStatus;
  feishu_message_id?: string | null;
  sent_at?: string | null;
  error_message?: string | null;
  created_at: string;
  updated_at?: string | null;
};

export type AgentReportSubscription = {
  id: string;
  report_type?: AgentReportType;
  report_definition_code: string;
  report_family: AgentReportFamily;
  scope_type: AgentReportScopeType;
  scope_id?: string | null;
  recipient_type: AgentReportRecipientType;
  app_user_id?: string | null;
  feishu_user_id?: string | null;
  feishu_chat_id?: string | null;
  send_time_local: string;
  send_weekday?: number | null;
  send_day_of_month?: number | null;
  timezone: string;
  enabled: boolean;
  created_at: string;
  updated_at?: string | null;
};

export type OfflineStore = {
  id: string;
  name: string;
  /** @deprecated Use city_name instead. Kept only for legacy compatibility. */
  city: string;
  province?: string | null;
  city_name?: string | null;
  district?: string | null;
  google_place_id?: string | null;
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
  external_store_id?: string | null;
  external_org_id?: string | null;
  external_org_name?: string | null;
  external_md_id?: string | null;
  external_md_name?: string | null;
  external_source?: string | null;
  external_synced_at?: string | null;
  organization_id?: string | null;
  organization_assignment_method?: OrganizationAssignmentMethod | null;
  organization_assigned_at?: string | null;
  organization_region_rule_id?: string | null;
  organization_assignment_confidence?: number | null;
  organization_assignment_reason?: string | null;
  organizations?: Pick<Organization, "id" | "name" | "status"> | null;
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

export type MarketBenchmarkPeriodType = "week" | "month";
export type MarketBenchmarkWeekMode = "month_fixed_4" | "natural_week";
export type MarketBenchmarkPeriodStatus = "calculated" | "carried_forward";

export type MarketBenchmarkPeriodPrice = {
  id: string;
  benchmark_rule_id: string;
  period_type: MarketBenchmarkPeriodType;
  start_date: string;
  end_date: string;
  benchmark_price_per_piece: number;
  sample_count: number;
  currency: string;
  status: MarketBenchmarkPeriodStatus;
  created_at: string;
  updated_at: string | null;
};

export type MarketBenchmarkRule = {
  id: string;
  market: string;
  province: string;
  city_name: string;
  district: string | null;
  brand_id: string;
  product_series: string | null;
  active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string | null;
  brands?: Pick<Brand, "id" | "name"> | null;
  market_benchmark_period_prices?: MarketBenchmarkPeriodPrice[];
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

export type CompetitorSeriesMapping = {
  id: string;
  brand_id: string;
  product_series: string | null;
  target_makuku_series: string;
  is_default_benchmark: boolean;
  active: boolean;
  created_at: string;
  updated_at: string | null;
  brands?: Pick<Brand, "id" | "name"> | null;
};

export type ProductMatchNormalizationField = "brand" | "series" | "size" | "piece_count";

export type ProductMatchNormalization = {
  id: string;
  field: ProductMatchNormalizationField;
  brand_scope: string | null;
  source_value: string;
  canonical_value: string;
  active: boolean;
  created_at: string;
  updated_at: string | null;
};

export type PriceSnapshotVisit = {
  id: string;
  visit_code?: string | null;
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
  competitor_product_id: string | null;
  sku_master_id: string | null;
  material_sku_code?: string | null;
  offline_store_id?: string | null;
  channel: Channel;
  list_price_idr: number;
  package_price_idr?: number | null;
  promo_price_idr: number;
  voucher_value_idr: number;
  shipping_subsidy_idr: number;
  net_price_idr: number;
  piece_count?: number | null;
  price_per_piece: number;
  promo_type: string | null;
  captured_at: string;
  source: string | null;
  source_visit_id?: string | null;
  source_image_id?: string | null;
  source_matched_entity_type?: AiPriceCandidateMatchType | null;
  source_matched_entity_id?: string | null;
  benchmark_assessment_at_approval?: BenchmarkAssessment | null;
  evidence_url: string | null;
  created_at: string;
  competitor_products?: CompetitorProduct | null;
  sku_master?: SkuMaster | null;
  material_master?: MaterialMaster | null;
  offline_stores?: Pick<OfflineStore, "id" | "name" | "city" | "province" | "city_name" | "district" | "channel_type" | "organization_id"> & {
    organizations?: Pick<Organization, "id" | "name" | "status"> | null;
  } | null;
  offline_store_visits?: PriceSnapshotVisit | null;
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
  replaces_image_id?: string | null;
  replaced_by_image_id?: string | null;
  deleted_at?: string | null;
  deletion_reason?: string | null;
  image_type: OfflineImageType;
  image_path: string;
  thumbnail_path?: string | null;
  thumbnail_url?: string | null;
  image_url: string | null;
  file_name: string;
  content_type: string;
  file_size: number;
  analysis_status: OfflineImageAnalysisStatus;
  vision_result: Partial<OfflineImageVisionResult | StoreVisitPriceImageAnalysis | StoreVisitDisplayAnalysis> | null;
  analysis_error?: string | null;
  error_message: string | null;
  uploaded_at: string;
  created_at: string;
};

export type OfflineStoreVisit = {
  id: string;
  visit_code?: string | null;
  store_name: string;
  region?: string | null;
  channel?: string | null;
  promoter?: string | null;
  image_urls?: string[] | null;
  image_thumbnail_paths?: string[] | null;
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
    id?: string;
    path: string;
    url: string | null;
    category?: OfflineImageType | StoreVisitImageCategory;
  }[];
  active_signed_images?: {
    id?: string;
    path: string;
    url: string | null;
    category?: OfflineImageType | StoreVisitImageCategory;
  }[];
  replaced_signed_images?: {
    id?: string;
    path: string;
    url: string | null;
    category?: OfflineImageType | StoreVisitImageCategory;
  }[];
};

export type AiPriceCandidateStatus = "pending" | "approved" | "rejected";
export type AiPriceCandidateMatchType = "material_master" | "competitor_product" | "unmatched";
export type AiProductMatchMethod = "EXACT_CODE" | "FULL_SIGNATURE" | "UNIQUE_SIGNATURE" | "MASTER_DATA_DUPLICATE" | "UNMATCHED";
export type AiPriceCandidateReviewMethod = "auto_rule" | "manual" | "bulk_manual";
export type BenchmarkAssessment = "READY" | "BUILDING" | "NOT_EVALUATED";
export type BenchmarkAssessmentReason =
  | "NO_HISTORY"
  | "LOW_SAMPLE"
  | "LOW_STORE"
  | "LOW_SAMPLE_AND_STORE";
export type AiPriceQualityGateStatus =
  | "PENDING"
  | "PROCESSING"
  | "PASSED"
  | "REVIEW_REQUIRED"
  | "INSUFFICIENT_BENCHMARK"
  | "FAILED"
  | "NOT_REQUIRED";
export type PriceQualityReasonCode =
  | "EVIDENCE_REVIEW_REQUIRED"
  | "SKU_MATCH_UNCERTAIN"
  | "INSUFFICIENT_BENCHMARK"
  | "PRICE_DEVIATION_HIGH"
  | "PRICE_DEVIATION_CRITICAL"
  | "AMOUNT_SCALE_SUSPECTED"
  | "PROMOTION_EVIDENCE";

export type AiPriceCandidate = {
  id: string;
  visit_id: string | null;
  candidate_key?: string | null;
  source_image_id?: string | null;
  source_image_path?: string | null;
  source_row_index?: number | null;
  raw_brand: string;
  raw_product: string;
  raw_price: string;
  parsed_price_idr: number | null;
  ai_list_price_idr?: number | null;
  ai_package_price_idr?: number | null;
  ai_net_price_idr?: number | null;
  list_price_idr?: number | null;
  package_price_idr?: number | null;
  net_price_idr?: number | null;
  raw_piece_count_text?: string | null;
  raw_package_price_text?: string | null;
  raw_net_price_text?: string | null;
  raw_price_per_piece_text?: string | null;
  visible_price_per_piece_idr?: number | null;
  price_basis?: PriceBasis | null;
  promo_type?: string | null;
  ai_piece_count?: number | null;
  ai_price_per_piece?: number | null;
  ai_promo_type?: string | null;
  piece_count: number | null;
  price_per_piece: number | null;
  candidate_type: RawExtractionType;
  ai_confidence: number | null;
  legacy_confidence_fallback?: boolean;
  price_evidence_status?: PriceEvidenceStatus | null;
  price_evidence_confidence?: number | null;
  price_evidence_detail?: Record<string, unknown> | null;
  price_evidence_reason_code?: PriceEvidenceReasonCode | null;
  conflicts?: { type?: string; message: string }[];
  review_decision?: PriceReviewDecision;
  evidence_review_decision?: PriceReviewDecision | null;
  quality_gate_status?: AiPriceQualityGateStatus;
  quality_gate_reason_codes?: PriceQualityReasonCode[];
  quality_gate_version?: string | null;
  benchmark_date?: string | null;
  benchmark_price_per_piece?: number | null;
  benchmark_deviation_pct?: number | null;
  benchmark_sample_count?: number | null;
  benchmark_store_count?: number | null;
  benchmark_assessment?: BenchmarkAssessment;
  benchmark_assessment_reason?: BenchmarkAssessmentReason | null;
  quality_gate_evaluated_at?: string | null;
  quality_gate_error?: string | null;
  quality_gate_attempt_count?: number;
  quality_gate_worker_id?: string | null;
  quality_gate_claimed_at?: string | null;
  quality_gate_input_fingerprint?: string | null;
  approval_input_fingerprint?: string | null;
  auto_approval_status?: "PENDING" | "PROCESSING" | "FAILED" | "EXHAUSTED" | "COMPLETED" | "NOT_REQUIRED";
  auto_approval_attempt_count?: number;
  auto_approval_worker_id?: string | null;
  auto_approval_claimed_at?: string | null;
  auto_approval_error?: string | null;
  ai_matched_entity_type?: AiPriceCandidateMatchType | null;
  ai_matched_entity_id?: string | null;
  ai_matched_label?: string | null;
  ai_match_rule_version?: string | null;
  ai_match_method?: AiProductMatchMethod | null;
  ai_match_evidence?: Record<string, unknown> | null;
  matched_entity_type: AiPriceCandidateMatchType;
  matched_entity_id: string | null;
  matched_label: string | null;
  matched_sku_label?: string | null;
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
  h5_lifecycle_status?: "deleted" | "replaced" | "reanalyzed" | null;
  h5_lifecycle_at?: string | null;
  offline_store_visits?: Pick<OfflineStoreVisit, "id" | "visit_code" | "store_name" | "city" | "province" | "city_name" | "district" | "channel_type" | "visit_date" | "created_at" | "uploader_name"> | null;
};

export type OperatorPriceReviewState = "pending" | "processed";
export type OperatorPriceReviewDecision = "confirmed" | "corrected" | "rejected";

export type OperatorPriceReviewReasonGroup = {
  kind: "PRICE" | "CONFIRMATION";
  title: string;
  messages: string[];
};

export type OperatorPriceReviewListItem = {
  id: string;
  state: OperatorPriceReviewState;
  source_thumbnail_url: string | null;
  source_image_available: boolean;
  product_name: string;
  sku_label: string | null;
  size: string | null;
  ai_package_price: number | null;
  ai_piece_count: number | null;
  ai_price_per_piece: number | null;
  operator_reason: string;
  operator_reason_groups: OperatorPriceReviewReasonGroup[];
  requires_product_correction: boolean;
  processed_decision: OperatorPriceReviewDecision | null;
  processed_at: string | null;
  created_at: string;
};

export type OperatorPriceReviewDetail = OperatorPriceReviewListItem & {
  visit_code: string | null;
  source_image_id: string | null;
  source_image_url: string | null;
  evidence_product_text: string;
  evidence_package_price: number | null;
  evidence_piece_count: number | null;
  evidence_price_per_piece: number | null;
  historical_common_price_per_piece: number | null;
  current_match_type: AiPriceCandidateMatchType;
  current_match_id: string | null;
  current_match_label: string | null;
  review_token: string;
  visit_detail_href: string;
};

export type PriceQualityBenchmarkDaily = {
  id: string;
  benchmark_date: string;
  matched_entity_type: Exclude<AiPriceCandidateMatchType, "unmatched">;
  matched_entity_id: string;
  channel: PriceSnapshot["channel"];
  window_start_date: string;
  window_end_date: string;
  median_price_per_piece: number;
  sample_count: number;
  store_count: number;
  benchmark_status: "READY" | "INSUFFICIENT";
  calculation_version: string;
  generated_at: string;
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

export type StoreVisitAiJobType = "initial_analysis" | "single_image_reanalysis" | "full_visit_reanalysis";
export type StoreVisitAiJobStatus = "queued" | "running" | "completed" | "failed" | "cancelled";
export type StoreVisitAiJobItemStatus = "queued" | "processing" | "succeeded" | "retake_required" | "failed";

export type StoreVisitAiJob = {
  id: string;
  visit_id: string;
  job_type: StoreVisitAiJobType;
  status: StoreVisitAiJobStatus;
  request_snapshot: Record<string, unknown>;
  total_count: number;
  success_count: number;
  failed_count: number;
  retake_required_count: number;
  remaining_count: number;
  created_by: string | null;
  started_at: string | null;
  completed_at: string | null;
  last_heartbeat_at: string | null;
  lease_expires_at: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string | null;
};

export type StoreVisitAiJobItem = {
  id: string;
  job_id: string;
  source_image_id: string;
  position: number;
  status: StoreVisitAiJobItemStatus;
  attempt_count: number;
  worker_id: string | null;
  last_heartbeat_at: string | null;
  lease_expires_at: string | null;
  next_attempt_at: string | null;
  error_message: string | null;
  result_summary: Record<string, unknown>;
  created_at: string;
  updated_at: string | null;
};

export type StoreVisitAiJobSummary = Pick<
  StoreVisitAiJob,
  "id" | "job_type" | "status" | "total_count" | "success_count" | "failed_count" | "retake_required_count" | "remaining_count"
> & {
  target_image_ids: string[];
};

export type StoreVisitRerunJobMode = "match_only" | "ai_reanalysis";
export type StoreVisitRerunJobStatus = "queued" | "running" | "completed" | "failed";

export type StoreVisitRerunJobFailure = {
  visitId: string;
  visitCode: string | null;
  error: string;
};

export type StoreVisitRerunChildAiJob = {
  visitId: string;
  visitCode: string | null;
  jobId: string;
};

export type StoreVisitRerunJob = {
  id: string;
  mode: StoreVisitRerunJobMode;
  status: StoreVisitRerunJobStatus;
  selector: Record<string, unknown>;
  locale: string;
  requested_by: string | null;
  total_visits: number;
  processed_visits: number;
  skipped_visits: number;
  failed_visits: number;
  inserted_candidate_count: number;
  deleted_snapshot_count: number;
  method_counts: Record<string, number>;
  child_ai_jobs: StoreVisitRerunChildAiJob[];
  failures: StoreVisitRerunJobFailure[];
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type StoreVisitMonitorExportJobStatus = "queued" | "running" | "completed" | "failed";

export type StoreVisitMonitorExportJob = {
  id: string;
  status: StoreVisitMonitorExportJobStatus;
  filters: Record<string, unknown>;
  locale: string;
  requested_by: string | null;
  total_rows: number;
  exported_rows: number;
  file_path: string | null;
  file_size_bytes: number | null;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string | null;
};

export type PriceSnapshotExportJobStatus = "queued" | "running" | "completed" | "failed";

export type PriceSnapshotExportJob = {
  id: string;
  status: PriceSnapshotExportJobStatus;
  filters: Record<string, unknown>;
  locale: string;
  requested_by: string | null;
  total_rows: number;
  exported_rows: number;
  file_path: string | null;
  file_size_bytes: number | null;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string | null;
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

export type WeeklyPriceCoefficientCell = {
  week: string;
  startDate: string;
  endDate: string;
  ownAvgPrice: number | null;
  ownCoefficient: number | null;
  ownSampleCount: number;
  ownHref: string;
  competitorCells: WeeklyPriceCoefficientCompetitorCell[];
};

export type WeeklyPriceCoefficientCompetitorSeries = {
  key: string;
  label: string;
  isBenchmark: boolean;
};

export type WeeklyPriceCoefficientCompetitorCell = {
  seriesKey: string;
  benchmarkAvgPrice: number | null;
  benchmarkSampleCount: number;
  coefficient: number | null;
  benchmarkHref: string;
};

export type WeeklyPriceCoefficientNodeLevel = "organization" | "province" | "city" | "district" | "sku";

export type WeeklyPriceCoefficientNode = {
  id: string;
  level: WeeklyPriceCoefficientNodeLevel;
  organization: string | null;
  province: string | null;
  cityName: string | null;
  district: string | null;
  skuCode: string | null;
  skuName: string | null;
  cells: WeeklyPriceCoefficientCell[];
  children: WeeklyPriceCoefficientNode[];
};

export type WeeklyPriceCoefficientBoard = {
  month: string;
  title: string;
  ownSeriesOptions: string[];
  selectedOwnSeries: string | null;
  skuOptions: Array<{ code: string; name: string }>;
  selectedSku: string | null;
  organizationOptions: string[];
  selectedOrganization: string | null;
  weeks: Array<{ key: string; label: string; startDate: string; endDate: string }>;
  competitorSeries: WeeklyPriceCoefficientCompetitorSeries[];
  rows: WeeklyPriceCoefficientNode[];
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

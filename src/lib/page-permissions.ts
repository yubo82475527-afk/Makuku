/** Pages shown in role management and assignable to non-admin roles. */
export const ROLE_PAGE_KEYS = [
  "dashboard",
  "standard-store",
  "prices",
  "goal-execution",
  "store-visit-monitor",
  "offline-price-candidates",
  "competitor-mappings",
  "sku-master",
  "competitor-products",
  "product-match-normalizations",
  "offline-stores",
  "organizations",
  "users",
  "roles",
  "report-center",
  "usage-assistant-knowledge",
  "store-visit-ai-debug",
] as const;

/**
 * Legacy routes still protected by proxy, but not shown in role management.
 * Direct URL access remains available to admin (full page set).
 */
export const LEGACY_PAGE_KEYS = [
  "offline-uploads",
  "channels",
  "promo-events",
  "alerts",
  "competitors",
] as const;

/** All proxy-protected PC page roots. */
export const PAGE_KEYS = [...ROLE_PAGE_KEYS, ...LEGACY_PAGE_KEYS] as const;

export type RolePageKey = (typeof ROLE_PAGE_KEYS)[number];
export type LegacyPageKey = (typeof LEGACY_PAGE_KEYS)[number];
export type PageKey = (typeof PAGE_KEYS)[number];

export const SYSTEM_ROLE_CODES = ["admin", "field_agent"] as const;
export type SystemRoleCode = (typeof SYSTEM_ROLE_CODES)[number];

export const DEFAULT_H5_ROLE_CODE = "field_agent";
export const SYSTEM_ADMIN_ROLE_CODE = "admin";

const pageKeySet = new Set<string>(PAGE_KEYS);
const rolePageKeySet = new Set<string>(ROLE_PAGE_KEYS);
const legacyPageKeySet = new Set<string>(LEGACY_PAGE_KEYS);

export function isPageKey(value: string | null | undefined): value is PageKey {
  return Boolean(value && pageKeySet.has(value));
}

export function isRolePageKey(value: string | null | undefined): value is RolePageKey {
  return Boolean(value && rolePageKeySet.has(value));
}

export function isLegacyPageKey(value: string | null | undefined): value is LegacyPageKey {
  return Boolean(value && legacyPageKeySet.has(value));
}

export function isSystemRoleCode(value: string | null | undefined): value is SystemRoleCode {
  return value === "admin" || value === "field_agent";
}

export function isSystemAdminRole(value: string | null | undefined) {
  return value === SYSTEM_ADMIN_ROLE_CODE;
}

/** Keep only assignable pages for role UI / non-admin role payloads. */
export function filterRoleAssignablePages(pages: string[] | null | undefined): RolePageKey[] {
  const unique = new Set<RolePageKey>();
  for (const page of pages ?? []) {
    if (isRolePageKey(page)) unique.add(page);
  }
  return [...unique];
}

export type PageKeyLabel = { zh: string; en: string };

export const PAGE_KEY_LABELS: Record<PageKey, PageKeyLabel> = {
  dashboard: { zh: "价格指数", en: "Price Index" },
  "standard-store": { zh: "完美终端2.0", en: "Perfect Store 2.0" },
  prices: { zh: "真实价格", en: "Real Prices" },
  "goal-execution": { zh: "目标执行2.0", en: "Goal Execution 2.0" },
  "offline-price-candidates": { zh: "价格审核", en: "Price Review" },
  "store-visit-monitor": { zh: "巡店记录", en: "Store Visit Records" },
  "competitor-mappings": { zh: "竞品对标", en: "Competitor Benchmarking" },
  "sku-master": { zh: "自有产品", en: "Own Products" },
  "competitor-products": { zh: "竞品产品", en: "Competitor Products" },
  "product-match-normalizations": { zh: "商品匹配规则", en: "Product Match Rules" },
  "offline-stores": { zh: "门店", en: "Stores" },
  organizations: { zh: "组织", en: "Organizations" },
  users: { zh: "用户", en: "Users" },
  roles: { zh: "角色权限", en: "Roles & Permissions" },
  "report-center": { zh: "报表中心", en: "Report Center" },
  "usage-assistant-knowledge": { zh: "使用助手知识库", en: "Usage Assistant KB" },
  "store-visit-ai-debug": { zh: "巡店 AI 调试", en: "Store Visit AI Debug" },
  "offline-uploads": { zh: "离线上传（遗留）", en: "Offline Uploads (legacy)" },
  channels: { zh: "渠道（遗留）", en: "Channels (legacy)" },
  "promo-events": { zh: "促销活动（遗留）", en: "Promo Events (legacy)" },
  alerts: { zh: "告警（遗留）", en: "Alerts (legacy)" },
  competitors: { zh: "竞品（遗留）", en: "Competitors (legacy)" },
};

/** Map locale path root segment to page key. */
export function pageKeyFromPathRoot(root: string | null | undefined): PageKey | null {
  if (!root) return null;
  return isPageKey(root) ? root : null;
}

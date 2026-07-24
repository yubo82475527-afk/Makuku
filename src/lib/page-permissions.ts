/** Pages shown in role management and assignable to non-admin roles. */
export const ROLE_PAGE_KEYS = [
  "dashboard",
  "prices",
  "offline-price-candidates",
  "store-visit-monitor",
  "competitor-mappings",
  "sku-master",
  "competitor-products",
  "product-match-normalizations",
  "offline-stores",
  "organizations",
  "users",
  "roles",
  "report-center",
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
  prices: { zh: "市场价格", en: "Market Price" },
  "offline-price-candidates": { zh: "人工审核", en: "Manual Review" },
  "store-visit-monitor": { zh: "巡店记录", en: "Store Visit Records" },
  "competitor-mappings": { zh: "竞品映射", en: "Competitor Mapping" },
  "sku-master": { zh: "产品主数据", en: "Product Master" },
  "competitor-products": { zh: "竞品主数据", en: "Competitor Product Master" },
  "product-match-normalizations": { zh: "商品匹配设置", en: "Product Match Settings" },
  "offline-stores": { zh: "门店主数据", en: "Store Master" },
  organizations: { zh: "组织管理", en: "Organization Management" },
  users: { zh: "用户管理", en: "User Management" },
  roles: { zh: "角色管理", en: "Role Management" },
  "report-center": { zh: "自动化报表", en: "Automated Reports" },
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

import type { PageKey } from "@/lib/page-permissions";

export type NavLabel = { zh: string; en: string };

export type NavItemConfig = {
  href: string;
  pageKey: PageKey;
  label: NavLabel;
  placeholder?: boolean;
};

export type NavGroupConfig = {
  label: NavLabel;
  items: NavItemConfig[];
};

/** Shared PC sidebar structure (icons stay in app-shell). */
export const NAV_GROUP_CONFIGS: NavGroupConfig[] = [
  {
    label: { zh: "经营看板", en: "Command" },
    items: [
      { href: "/dashboard", pageKey: "dashboard", label: { zh: "价格指数", en: "Price Index" } },
      { href: "/standard-store", pageKey: "standard-store", label: { zh: "完美终端2.0", en: "Perfect Store 2.0" }, placeholder: true },
      { href: "/prices", pageKey: "prices", label: { zh: "真实价格", en: "Real Prices" } },
    ],
  },
  {
    label: { zh: "执行跟进", en: "Execution" },
    items: [
      { href: "/goal-execution", pageKey: "goal-execution", label: { zh: "目标执行2.0", en: "Goal Execution 2.0" }, placeholder: true },
      { href: "/store-visit-monitor", pageKey: "store-visit-monitor", label: { zh: "巡店记录", en: "Store Visit Records" } },
    ],
  },
  {
    label: { zh: "价格治理", en: "Price Governance" },
    items: [
      { href: "/offline-price-candidates", pageKey: "offline-price-candidates", label: { zh: "价格审核", en: "Price Review" } },
    ],
  },
  {
    label: { zh: "对标与匹配", en: "Matching & Rules" },
    items: [
      { href: "/competitor-mappings", pageKey: "competitor-mappings", label: { zh: "竞品对标", en: "Competitor Benchmarking" } },
      { href: "/product-match-normalizations", pageKey: "product-match-normalizations", label: { zh: "商品匹配规则", en: "Product Match Rules" } },
    ],
  },
  {
    label: { zh: "主数据", en: "Master Data" },
    items: [
      { href: "/sku-master", pageKey: "sku-master", label: { zh: "自有产品", en: "Own Products" } },
      { href: "/competitor-products", pageKey: "competitor-products", label: { zh: "竞品产品", en: "Competitor Products" } },
      { href: "/offline-stores", pageKey: "offline-stores", label: { zh: "门店", en: "Stores" } },
    ],
  },
  {
    label: { zh: "报表", en: "Reports" },
    items: [
      { href: "/report-center", pageKey: "report-center", label: { zh: "报表中心", en: "Report Center" } },
    ],
  },
  {
    label: { zh: "系统管理", en: "System Admin" },
    items: [
      { href: "/organizations", pageKey: "organizations", label: { zh: "组织", en: "Organizations" } },
      { href: "/users", pageKey: "users", label: { zh: "用户", en: "Users" } },
      { href: "/roles", pageKey: "roles", label: { zh: "角色权限", en: "Roles & Permissions" } },
      {
        href: "/usage-assistant-knowledge",
        pageKey: "usage-assistant-knowledge",
        label: { zh: "使用助手知识库", en: "Usage Assistant KB" },
      },
    ],
  },
];

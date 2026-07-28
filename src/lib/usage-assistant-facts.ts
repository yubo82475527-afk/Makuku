import { createHash } from "crypto";
import { NAV_GROUP_CONFIGS } from "@/lib/nav-config";
import {
  LEGACY_PAGE_KEYS,
  PAGE_KEY_LABELS,
  ROLE_PAGE_KEYS,
  type PageKey,
} from "@/lib/page-permissions";
import { OPERATOR_PRICE_REVIEW_REASON_FILTERS } from "@/lib/operator-price-review-reasons";

export type UsageAssistantFacts = {
  menus: Array<{
    groupZh: string;
    groupEn: string;
    href: string;
    pageKey: string;
    zh: string;
    en: string;
    placeholder: boolean;
  }>;
  pageKeys: Array<{ pageKey: string; zh: string; en: string; assignable: boolean; legacy: boolean }>;
  reviewReasons: Array<{ value: string; zh: string; en: string }>;
  visitAnalysisStatuses: Array<{ value: string; zh: string; en: string }>;
  systemRoles: Array<{ code: string; zh: string; en: string }>;
  environment: { timezone: string; currency: string };
};

export const VISIT_ANALYSIS_STATUS_FACTS = [
  { value: "pending", zh: "待处理", en: "Pending" },
  { value: "analyzing", zh: "分析中", en: "Analyzing" },
  { value: "completed", zh: "已完成", en: "Completed" },
  { value: "partial", zh: "部分完成", en: "Partial" },
  { value: "action_required", zh: "需处理", en: "Action required" },
  { value: "failed", zh: "失败", en: "Failed" },
] as const;

const legacySet = new Set<string>(LEGACY_PAGE_KEYS);
const assignableSet = new Set<string>(ROLE_PAGE_KEYS);

export function buildUsageAssistantFacts(): UsageAssistantFacts {
  const menus = NAV_GROUP_CONFIGS.flatMap((group) =>
    group.items.map((item) => ({
      groupZh: group.label.zh,
      groupEn: group.label.en,
      href: item.href,
      pageKey: item.pageKey,
      zh: item.label.zh,
      en: item.label.en,
      placeholder: Boolean(item.placeholder),
    })),
  );

  const pageKeys = (Object.keys(PAGE_KEY_LABELS) as PageKey[]).map((pageKey) => ({
    pageKey,
    zh: PAGE_KEY_LABELS[pageKey].zh,
    en: PAGE_KEY_LABELS[pageKey].en,
    assignable: assignableSet.has(pageKey),
    legacy: legacySet.has(pageKey),
  }));

  return {
    menus,
    pageKeys,
    reviewReasons: OPERATOR_PRICE_REVIEW_REASON_FILTERS.map((item) => ({
      value: item.value,
      zh: item.zh,
      en: item.en,
    })),
    visitAnalysisStatuses: VISIT_ANALYSIS_STATUS_FACTS.map((item) => ({ ...item })),
    systemRoles: [
      { code: "admin", zh: "系统管理员（页面权限完整）", en: "System admin (full page access)" },
      { code: "field_agent", zh: "巡店人员（主要使用移动端采价）", en: "Field agent (mainly mobile capture)" },
    ],
    environment: { timezone: "Asia/Jakarta", currency: "IDR" },
  };
}

export function hashUsageAssistantFacts(facts: UsageAssistantFacts) {
  return createHash("sha256").update(JSON.stringify(facts)).digest("hex").slice(0, 16);
}

export const USAGE_ASSISTANT_KB_MAX_BYTES = 200 * 1024;

export function assertUsageAssistantPackSize(serialized: string) {
  const bytes = Buffer.byteLength(serialized, "utf8");
  if (bytes > USAGE_ASSISTANT_KB_MAX_BYTES) {
    throw new Error(`Usage assistant knowledge pack exceeds ${USAGE_ASSISTANT_KB_MAX_BYTES} bytes (${bytes})`);
  }
  return bytes;
}

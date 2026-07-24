"use client";

import {
  BarChart3,
  Building2,
  ClipboardCheck,
  ClipboardList,
  Database,
  FileSpreadsheet,
  Gauge,
  Link2,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Shield,
  Store,
  Tags,
  Users,
} from "lucide-react";
import Link from "next/link";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { localeLabels, replacePathLocale, type Locale } from "@/lib/i18n/config";
import type { Dictionary } from "@/lib/i18n/get-dictionary";
import { writeLocalePreferenceCookie } from "@/lib/locale-preference";
import { StoreVisitMonitorExportMenu } from "@/components/store-visit-monitor-export-menu";
import { StoreVisitRerunJobMenu } from "@/components/store-visit-rerun-job-menu";
import type { PageKey } from "@/lib/page-permissions";

const sidebarStorageKey = "makuku_sidebar_collapsed";

export type HeaderUser = {
  displayName: string;
  role: string;
  pages?: PageKey[];
};

type ShellState = {
  title: string;
  currentPath: string;
  isDemo?: boolean;
  headerUser?: HeaderUser | null;
};

type AppShellContextValue = {
  setShellState: (state: ShellState) => void;
};

export const AppShellContext = createContext<AppShellContextValue | null>(null);

function isSameHeaderUser(a: HeaderUser | null | undefined, b: HeaderUser | null | undefined) {
  const aPages = (a?.pages ?? []).join(",");
  const bPages = (b?.pages ?? []).join(",");
  return (
    (a?.displayName ?? null) === (b?.displayName ?? null)
    && (a?.role ?? null) === (b?.role ?? null)
    && aPages === bPages
  );
}

function isSameShellState(a: ShellState, b: ShellState) {
  return (
    a.title === b.title &&
    a.currentPath === b.currentPath &&
    Boolean(a.isDemo) === Boolean(b.isDemo) &&
    isSameHeaderUser(a.headerUser, b.headerUser)
  );
}

const navGroups = [
  {
    label: { zh: "经营看板", en: "Command" },
    items: [
      { href: "/dashboard", pageKey: "dashboard" as PageKey, label: { zh: "价格指数", en: "Price Index" }, icon: Gauge },
    ],
  },
  {
    label: { zh: "市场价格", en: "Market Prices" },
    items: [
      { href: "/prices", pageKey: "prices" as PageKey, label: { zh: "确认价格", en: "Confirmed Prices" }, icon: BarChart3 },
    ],
  },
  {
    label: { zh: "价格治理", en: "Price Governance" },
    items: [
      { href: "/offline-price-candidates", pageKey: "offline-price-candidates" as PageKey, label: { zh: "价格审核", en: "Price Review" }, icon: ClipboardCheck },
      { href: "/store-visit-monitor", pageKey: "store-visit-monitor" as PageKey, label: { zh: "巡店记录", en: "Store Visit Records" }, icon: ClipboardList },
    ],
  },
  {
    label: { zh: "价格标准", en: "Price Standards" },
    items: [
      { href: "/competitor-mappings", pageKey: "competitor-mappings" as PageKey, label: { zh: "竞品对标", en: "Competitor Benchmarking" }, icon: Tags },
      { href: "/product-match-normalizations", pageKey: "product-match-normalizations" as PageKey, label: { zh: "商品匹配规则", en: "Product Match Rules" }, icon: Link2 },
    ],
  },
  {
    label: { zh: "主数据", en: "Master Data" },
    items: [
      { href: "/sku-master", pageKey: "sku-master" as PageKey, label: { zh: "自有产品", en: "Own Products" }, icon: Database },
      { href: "/competitor-products", pageKey: "competitor-products" as PageKey, label: { zh: "竞品产品", en: "Competitor Products" }, icon: Tags },
      { href: "/offline-stores", pageKey: "offline-stores" as PageKey, label: { zh: "门店", en: "Stores" }, icon: Store },
    ],
  },
  {
    label: { zh: "报表", en: "Reports" },
    items: [
      { href: "/report-center", pageKey: "report-center" as PageKey, label: { zh: "报表中心", en: "Report Center" }, icon: FileSpreadsheet },
    ],
  },
  {
    label: { zh: "系统管理", en: "System Admin" },
    items: [
      { href: "/organizations", pageKey: "organizations" as PageKey, label: { zh: "组织", en: "Organizations" }, icon: Building2 },
      { href: "/users", pageKey: "users" as PageKey, label: { zh: "用户", en: "Users" }, icon: Users },
      { href: "/roles", pageKey: "roles" as PageKey, label: { zh: "角色权限", en: "Roles & Permissions" }, icon: Shield },
    ],
  },
] as const;

function NavLinks({
  locale,
  currentPath,
  className,
  collapsed = false,
  allowedPages,
}: {
  locale: Locale;
  currentPath: string;
  className: string;
  collapsed?: boolean;
  allowedPages?: PageKey[] | null;
}) {
  const allowed = allowedPages ? new Set(allowedPages) : null;
  const visibleGroups = navGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => !allowed || allowed.has(item.pageKey)),
    }))
    .filter((group) => group.items.length > 0);

  return (
    <nav className={className}>
      {visibleGroups.map((group, groupIndex) => (
        <div key={group.label?.en ?? "root"} className={groupIndex === 0 ? "" : collapsed ? "mt-3" : "mt-4"}>
          {group.label && !collapsed ? <div className="px-3 pb-1 text-xs font-semibold text-slate-500">{group.label[locale]}</div> : null}
          <div className="space-y-1">
            {group.items.map((item) => {
              const Icon = item.icon;
              const active = currentPath === item.href || currentPath.startsWith(`${item.href}?`);
              const baseClass = collapsed
                ? "flex h-10 items-center justify-center rounded-md text-sm font-medium"
                : "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium";
              return (
                <Link
                  key={item.href}
                  href={`/${locale}${item.href}`}
                  title={item.label[locale]}
                  aria-label={item.label[locale]}
                  className={active
                    ? `${baseClass} bg-slate-900 text-white`
                    : `${baseClass} text-slate-700 hover:bg-slate-100`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className={collapsed ? "sr-only" : "truncate"}>{item.label[locale]}</span>
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

function AppShellFrame({
  locale,
  dict,
  state,
  children,
}: {
  locale: Locale;
  dict: Dictionary;
  state: ShellState;
  children: ReactNode;
}) {
  const otherLocale: Locale = locale === "en" ? "zh" : "en";
  const appSubtitle = locale === "zh" ? "价格智能" : "Price Intelligence";
  const sampleBadge = locale === "zh" ? "7天样板数据" : "7-day pilot data";
  const timezonePricing = locale === "zh" ? "Asia/Jakarta 时区 / IDR 价格" : "Asia/Jakarta timezone / IDR pricing";
  const languageLabel = locale === "zh" ? "语言" : "Language";
  const mobileNavLabel = locale === "zh" ? "目录" : "Menu";
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const sidebarToggleLabel = sidebarCollapsed
    ? (locale === "zh" ? "展开菜单" : "Expand sidebar")
    : (locale === "zh" ? "缩小菜单" : "Collapse sidebar");

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setSidebarCollapsed(localStorage.getItem(sidebarStorageKey) === "true");
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  function toggleSidebar() {
    setSidebarCollapsed((current) => {
      const next = !current;
      localStorage.setItem(sidebarStorageKey, String(next));
      return next;
    });
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    window.location.href = `/${locale}/login`;
  }

  return (
    <div className="min-h-screen">
      <aside className={sidebarCollapsed
        ? "fixed inset-y-0 left-0 z-10 hidden w-[64px] flex-col border-r border-slate-200 bg-white transition-[width] duration-200 lg:flex"
        : "fixed inset-y-0 left-0 z-10 hidden w-64 flex-col border-r border-slate-200 bg-white transition-[width] duration-200 lg:flex"}
      >
        <div className={sidebarCollapsed ? "flex min-h-16 shrink-0 items-center justify-center border-b border-slate-200 px-2 py-3" : "flex min-h-16 shrink-0 items-center justify-between gap-3 border-b border-slate-200 px-5 py-3"}>
          <div className={sidebarCollapsed ? "sr-only" : "min-w-0"}>
            <div className="truncate text-lg font-semibold">{dict.app.name}</div>
            <div className="truncate text-xs text-slate-500">{appSubtitle}</div>
          </div>
          <button
            type="button"
            aria-label={sidebarToggleLabel}
            title={sidebarToggleLabel}
            onClick={toggleSidebar}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
          >
            {sidebarCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </button>
        </div>
        <NavLinks
          locale={locale}
          currentPath={state.currentPath}
          collapsed={sidebarCollapsed}
          allowedPages={state.headerUser?.pages}
          className={sidebarCollapsed
            ? "scrollbar-hidden min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-3"
            : "scrollbar-hidden min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-4"}
        />
      </aside>
      <main className={sidebarCollapsed ? "lg:pl-[64px]" : "lg:pl-64"}>
        <header className="sticky top-0 z-20 flex min-h-16 items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <details className="relative lg:hidden">
              <summary
                aria-label={mobileNavLabel}
                title={mobileNavLabel}
                className="flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 [&::-webkit-details-marker]:hidden"
              >
                <Menu className="h-5 w-5" />
              </summary>
              <div className="absolute left-0 top-12 max-h-[min(80vh,36rem)] w-64 overflow-hidden rounded-md border border-slate-200 bg-white shadow-lg">
                <div className="border-b border-slate-100 px-3 pb-2 pt-2">
                  <div className="text-sm font-semibold">{dict.app.name}</div>
                  <div className="text-xs text-slate-500">{appSubtitle}</div>
                </div>
                <NavLinks
                  locale={locale}
                  currentPath={state.currentPath}
                  allowedPages={state.headerUser?.pages}
                  className="scrollbar-hidden max-h-[min(72vh,32rem)] overflow-y-auto overscroll-contain px-2 pb-2 pt-2"
                />
              </div>
            </details>
            <div className="min-w-0">
              <h1 className="truncate text-xl font-semibold tracking-normal">{state.title}</h1>
              <p className="text-xs text-slate-500">{timezonePricing}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <StoreVisitRerunJobMenu locale={locale} />
            <StoreVisitMonitorExportMenu locale={locale} />
            {state.headerUser ? (
              <div className="hidden items-center gap-2 text-xs text-slate-600 sm:flex">
                <span className="max-w-32 truncate font-medium text-slate-800">{state.headerUser.displayName}</span>
                <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-500">{state.headerUser.role}</span>
                <button
                  type="button"
                  onClick={logout}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 font-medium text-slate-700 hover:bg-slate-50"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  {locale === "zh" ? "退出" : "Logout"}
                </button>
              </div>
            ) : null}
            <Link
              href={replacePathLocale(`/${locale}${state.currentPath}`, otherLocale)}
              onClick={() => {
                document.cookie = writeLocalePreferenceCookie(otherLocale);
              }}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              title={languageLabel}
            >
              {localeLabels[otherLocale]}
            </Link>
            {state.isDemo ? (
              <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800 ring-1 ring-amber-200">
                {sampleBadge}
              </span>
            ) : null}
          </div>
        </header>
        <div className="px-4 py-6 lg:px-8">{children}</div>
      </main>
    </div>
  );
}

function AppShellStateSync({
  title,
  currentPath,
  isDemo,
  headerUser,
  setShellState,
}: ShellState & AppShellContextValue) {
  useEffect(() => {
    setShellState({ title, currentPath, isDemo, headerUser });
  }, [currentPath, headerUser, isDemo, setShellState, title]);
  return null;
}

export function AppShell({
  locale,
  dict,
  title,
  currentPath,
  children,
  isDemo,
  headerUser = null,
}: {
  locale: Locale;
  dict: Dictionary;
  title: string;
  currentPath: string;
  children: ReactNode;
  isDemo?: boolean;
  headerUser?: HeaderUser | null;
}) {
  const shellContext = useContext(AppShellContext);
  const [shellState, setShellState] = useState<ShellState>({
    title,
    currentPath,
    isDemo,
    headerUser,
  });
  const updateShellState = useCallback((nextState: ShellState) => {
    setShellState((current) => {
      return isSameShellState(current, nextState) ? current : nextState;
    });
  }, []);
  const shellContextValue = useMemo(() => ({ setShellState: updateShellState }), [updateShellState]);

  if (shellContext) {
    return (
      <>
        <AppShellStateSync
          title={title}
          currentPath={currentPath}
          isDemo={isDemo}
          headerUser={headerUser}
          setShellState={shellContext.setShellState}
        />
        {children}
      </>
    );
  }

  return (
    <AppShellContext.Provider value={shellContextValue}>
      <AppShellFrame locale={locale} dict={dict} state={shellState}>
        {children}
      </AppShellFrame>
    </AppShellContext.Provider>
  );
}


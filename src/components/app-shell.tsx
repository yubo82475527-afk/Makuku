"use client";

import {
  BadgeCheck,
  BarChart3,
  BookOpen,
  Building2,
  ChevronDown,
  ClipboardCheck,
  ClipboardList,
  Database,
  FileSpreadsheet,
  Gauge,
  Languages,
  Link2,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Shield,
  Store,
  Tags,
  Target,
  Users,
  type LucideIcon,
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
import { ExportCreatedGuideLayer } from "@/components/export-created-guide";
import { StoreVisitRerunJobMenu } from "@/components/store-visit-rerun-job-menu";
import { UsageAssistantDrawer } from "@/components/usage-assistant-drawer";
import { NAV_GROUP_CONFIGS } from "@/lib/nav-config";
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

const navIconByPageKey: Partial<Record<PageKey, LucideIcon>> = {
  dashboard: Gauge,
  "standard-store": BadgeCheck,
  prices: BarChart3,
  "goal-execution": Target,
  "store-visit-monitor": ClipboardList,
  "offline-price-candidates": ClipboardCheck,
  "competitor-mappings": Tags,
  "product-match-normalizations": Link2,
  "sku-master": Database,
  "competitor-products": Tags,
  "offline-stores": Store,
  "report-center": FileSpreadsheet,
  organizations: Building2,
  users: Users,
  roles: Shield,
  "usage-assistant-knowledge": BookOpen,
};

const navGroups = NAV_GROUP_CONFIGS.map((group) => ({
  label: group.label,
  items: group.items.map((item) => ({
    ...item,
    icon: navIconByPageKey[item.pageKey] ?? BookOpen,
  })),
}));

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
          <div className="flex shrink-0 items-center gap-3">
            {/* 作业工具：后台任务 / 导出，与账号会话分离 */}
            <div className="flex items-center gap-2">
              <UsageAssistantDrawer locale={locale} currentPath={state.currentPath} />
              <StoreVisitRerunJobMenu locale={locale} />
              <StoreVisitMonitorExportMenu locale={locale} />
              {state.isDemo ? (
                <span className="hidden rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-medium text-amber-800 ring-1 ring-amber-200 sm:inline">
                  {sampleBadge}
                </span>
              ) : null}
            </div>

            {/* 账号会话：身份一眼可见，语言与退出收进菜单 */}
            {state.headerUser ? (
              <>
                <div className="hidden h-5 w-px bg-slate-200 sm:block" aria-hidden />
                <details className="relative shrink-0">
                  <summary
                    className="inline-flex h-8 max-w-[11rem] cursor-pointer list-none items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 text-xs hover:bg-slate-50 sm:max-w-none [&::-webkit-details-marker]:hidden"
                    title={locale === "zh" ? "账号与退出" : "Account & logout"}
                  >
                    <span className="min-w-0 truncate font-medium text-slate-800">{state.headerUser.displayName}</span>
                    <span className="hidden shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500 sm:inline">
                      {state.headerUser.role}
                    </span>
                    <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                  </summary>
                  <div className="absolute right-0 z-40 mt-2 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
                    <div className="border-b border-slate-100 px-3 py-2.5">
                      <div className="truncate text-sm font-semibold text-slate-900">{state.headerUser.displayName}</div>
                      <div className="mt-0.5 text-xs text-slate-500">{state.headerUser.role}</div>
                    </div>
                    <div className="p-1.5">
                      <Link
                        href={replacePathLocale(`/${locale}${state.currentPath}`, otherLocale)}
                        onClick={() => {
                          document.cookie = writeLocalePreferenceCookie(otherLocale);
                        }}
                        className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-slate-700 hover:bg-slate-50"
                        title={languageLabel}
                      >
                        <Languages className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                        <span className="flex-1 text-[13px] font-medium leading-5">{locale === "zh" ? "切换语言" : "Language"}</span>
                        <span className="text-[13px] font-medium leading-5 text-slate-500">{localeLabels[otherLocale]}</span>
                      </Link>
                      <button
                        type="button"
                        onClick={logout}
                        className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-slate-700 hover:bg-slate-50"
                      >
                        <LogOut className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                        <span className="text-[13px] font-medium leading-5">{locale === "zh" ? "退出登录" : "Log out"}</span>
                      </button>
                    </div>
                  </div>
                </details>
              </>
            ) : (
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
            )}
          </div>
        </header>
        <div className="px-4 py-6 lg:px-8">{children}</div>
      </main>
      <ExportCreatedGuideLayer />
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
      const merged: ShellState = {
        title: nextState.title,
        currentPath: nextState.currentPath,
        isDemo: nextState.isDemo,
        // undefined = caller did not touch user; keep layout-injected session
        headerUser: nextState.headerUser !== undefined ? nextState.headerUser : current.headerUser,
      };
      return isSameShellState(current, merged) ? current : merged;
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


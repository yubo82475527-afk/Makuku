"use client";

import {
  BarChart3,
  Building2,
  ClipboardCheck,
  Database,
  FileSpreadsheet,
  Gauge,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Store,
  Tags,
  Users,
} from "lucide-react";
import Link from "next/link";
import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useState,
  type ReactNode,
} from "react";
import { localeLabels, replacePathLocale, type Locale } from "@/lib/i18n/config";
import type { Dictionary } from "@/lib/i18n/get-dictionary";
import { writeLocalePreferenceCookie } from "@/lib/locale-preference";
import { StoreVisitMonitorExportMenu } from "@/components/store-visit-monitor-export-menu";

const sidebarStorageKey = "makuku_sidebar_collapsed";

export type HeaderUser = {
  displayName: string;
  role: string;
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

const AppShellContext = createContext<AppShellContextValue | null>(null);

const navGroups = [
  {
    label: null,
    items: [
      { href: "/dashboard", label: { zh: "仪表盘", en: "Dashboard" }, icon: Gauge },
    ],
  },
  {
    label: { zh: "价格监控", en: "Price Monitoring" },
    items: [
      { href: "/prices", label: { zh: "真实市场价格", en: "Real Market Price" }, icon: BarChart3 },
      { href: "/offline-price-candidates", label: { zh: "照片价格复核", en: "Photo Price Review" }, icon: ClipboardCheck },
      { href: "/store-visit-monitor", label: { zh: "巡店分析监控", en: "Store Visit Monitor" }, icon: ClipboardCheck },
    ],
  },
  {
    label: { zh: "价格定位管理", en: "Price Positioning" },
    items: [
      { href: "/competitor-mappings", label: { zh: "竞品映射", en: "Competitor Mapping" }, icon: Tags },
    ],
  },
  {
    label: { zh: "主数据", en: "Master Data" },
    items: [
      { href: "/sku-master", label: { zh: "产品主数据", en: "Product Master" }, icon: Database },
      { href: "/competitor-products", label: { zh: "竞品主数据", en: "Competitor Product Master" }, icon: Tags },
      { href: "/offline-stores", label: { zh: "门店主数据", en: "Store Master" }, icon: Store },
      { href: "/organizations", label: { zh: "组织管理", en: "Organization Management" }, icon: Building2 },
      { href: "/users", label: { zh: "用户管理", en: "User Management" }, icon: Users },
    ],
  },
  {
    label: { zh: "自动化报表", en: "Automated Reports" },
    items: [
      { href: "/report-center", label: { zh: "自动化报表", en: "Automated Reports" }, icon: FileSpreadsheet },
    ],
  },
] as const;

function NavLinks({
  locale,
  currentPath,
  className,
  collapsed = false,
}: {
  locale: Locale;
  currentPath: string;
  className: string;
  collapsed?: boolean;
}) {
  return (
    <nav className={className}>
      {navGroups.map((group, groupIndex) => (
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
  const appSubtitle = locale === "zh" ? "AI 终端增长闭环样板" : "AI Terminal Growth Loop";
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
        ? "fixed inset-y-0 left-0 z-10 hidden w-[64px] border-r border-slate-200 bg-white transition-[width] duration-200 lg:block"
        : "fixed inset-y-0 left-0 z-10 hidden w-64 border-r border-slate-200 bg-white transition-[width] duration-200 lg:block"}
      >
        <div className={sidebarCollapsed ? "flex min-h-16 items-center justify-center border-b border-slate-200 px-2 py-3" : "flex min-h-16 items-center justify-between gap-3 border-b border-slate-200 px-5 py-3"}>
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
        <NavLinks locale={locale} currentPath={state.currentPath} collapsed={sidebarCollapsed} className={sidebarCollapsed ? "px-2 py-3" : "px-3 py-4"} />
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
              <div className="absolute left-0 top-12 w-64 rounded-md border border-slate-200 bg-white p-2 shadow-lg">
                <div className="border-b border-slate-100 px-3 pb-2 pt-1">
                  <div className="text-sm font-semibold">{dict.app.name}</div>
                  <div className="text-xs text-slate-500">{appSubtitle}</div>
                </div>
                <NavLinks locale={locale} currentPath={state.currentPath} className="pt-2" />
              </div>
            </details>
            <div className="min-w-0">
              <h1 className="truncate text-xl font-semibold tracking-normal">{state.title}</h1>
              <p className="text-xs text-slate-500">{timezonePricing}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {state.headerUser ? <StoreVisitMonitorExportMenu locale={locale} /> : null}
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
  useLayoutEffect(() => {
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
    <AppShellContext.Provider value={{ setShellState }}>
      <AppShellFrame locale={locale} dict={dict} state={shellState}>
        {children}
      </AppShellFrame>
    </AppShellContext.Provider>
  );
}


import {
  BarChart3,
  ClipboardCheck,
  Database,
  Gauge,
  MapPinned,
  Menu,
  Store,
  Tags,
  Users,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { localeLabels, replacePathLocale, type Locale } from "@/lib/i18n/config";
import type { Dictionary } from "@/lib/i18n/get-dictionary";

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
      { href: "/prices", label: { zh: "SKU价格监控", en: "SKU Price Monitor" }, icon: BarChart3 },
      { href: "/offline-price-candidates", label: { zh: "照片价格复核", en: "Photo Price Review" }, icon: ClipboardCheck },
    ],
  },
  {
    label: { zh: "价格定位管理", en: "Price Positioning" },
    items: [
      { href: "/competitors", label: { zh: "竞品映射管理", en: "Competitor Mapping" }, icon: Tags },
      { href: "/market-benchmarks", label: { zh: "市场标杆管理", en: "Market Benchmarks" }, icon: MapPinned },
    ],
  },
  {
    label: { zh: "主数据", en: "Master Data" },
    items: [
      { href: "/sku-master", label: { zh: "产品主数据", en: "Product Master" }, icon: Database },
      { href: "/offline-stores", label: { zh: "门店主数据", en: "Store Master" }, icon: Store },
      { href: "/users", label: { zh: "用户管理", en: "User Management" }, icon: Users },
    ],
  },
] as const;

function NavLinks({ locale, currentPath, className }: { locale: Locale; currentPath: string; className: string }) {
  return (
    <nav className={className}>
      {navGroups.map((group, groupIndex) => (
        <div key={group.label?.en ?? "root"} className={groupIndex === 0 ? "" : "mt-4"}>
          {group.label ? <div className="px-3 pb-1 text-xs font-semibold text-slate-500">{group.label[locale]}</div> : null}
          <div className="space-y-1">
            {group.items.map((item) => {
              const Icon = item.icon;
              const active = currentPath === item.href || currentPath.startsWith(`${item.href}?`);
              return (
                <Link
                  key={item.href}
                  href={`/${locale}${item.href}`}
                  className={active
                    ? "flex items-center gap-3 rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white"
                    : "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"}
                >
                  <Icon className="h-4 w-4" />
                  {item.label[locale]}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

export function AppShell({
  locale,
  dict,
  title,
  currentPath,
  children,
  isDemo,
}: {
  locale: Locale;
  dict: Dictionary;
  title: string;
  currentPath: string;
  children: ReactNode;
  isDemo?: boolean;
}) {
  const otherLocale: Locale = locale === "en" ? "zh" : "en";
  const appSubtitle = locale === "zh" ? "AI 终端增长闭环样板" : "AI Terminal Growth Loop";
  const sampleBadge = locale === "zh" ? "7天样板数据" : "7-day pilot data";
  const timezonePricing = locale === "zh" ? "Asia/Jakarta 时区 / IDR 价格" : "Asia/Jakarta timezone / IDR pricing";
  const languageLabel = locale === "zh" ? "语言" : "Language";
  const mobileNavLabel = locale === "zh" ? "目录" : "Menu";

  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-10 hidden w-64 border-r border-slate-200 bg-white lg:block">
        <div className="border-b border-slate-200 px-5 py-4">
          <div className="text-lg font-semibold">{dict.app.name}</div>
          <div className="text-xs text-slate-500">{appSubtitle}</div>
        </div>
        <NavLinks locale={locale} currentPath={currentPath} className="px-3 py-4" />
      </aside>
      <main className="lg:pl-64">
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
                <NavLinks locale={locale} currentPath={currentPath} className="pt-2" />
              </div>
            </details>
            <div className="min-w-0">
              <h1 className="truncate text-xl font-semibold tracking-normal">{title}</h1>
              <p className="text-xs text-slate-500">{timezonePricing}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Link
              href={replacePathLocale(`/${locale}${currentPath}`, otherLocale)}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              title={languageLabel}
            >
              {localeLabels[otherLocale]}
            </Link>
            {isDemo ? (
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

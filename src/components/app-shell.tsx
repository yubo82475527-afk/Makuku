import {
  AlertTriangle,
  BarChart3,
  Boxes,
  ClipboardCheck,
  Gauge,
  ImageUp,
  SlidersHorizontal,
  PackageSearch,
  ReceiptText,
  Siren,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { localeLabels, replacePathLocale, type Locale } from "@/lib/i18n/config";
import type { Dictionary } from "@/lib/i18n/get-dictionary";

const navItems = [
  { href: "/dashboard", labelKey: "dashboard", icon: Gauge },
  { href: "/sku-master", labelKey: "skuMaster", icon: Boxes },
  { href: "/competitors", labelKey: "competitors", icon: PackageSearch },
  { href: "/prices", labelKey: "prices", icon: ReceiptText },
  { href: "/offline-uploads", labelKey: "offlineUploads", icon: ImageUp },
  { href: "/offline-price-candidates", labelKey: "offlineUploads", label: "AI Price Review", icon: ClipboardCheck },
  { href: "/store-visit-ai-debug", labelKey: "offlineUploads", label: "AI Debug", icon: SlidersHorizontal },
  { href: "/promo-events", labelKey: "promoEvents", icon: BarChart3 },
  { href: "/alerts", labelKey: "alerts", icon: Siren },
  { href: "#", labelKey: "tiktokPhase2", icon: AlertTriangle },
] as const;

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

  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-10 hidden w-64 border-r border-slate-200 bg-white lg:block">
        <div className="border-b border-slate-200 px-5 py-4">
          <div className="text-lg font-semibold">{dict.app.name}</div>
          <div className="text-xs text-slate-500">{dict.app.subtitle}</div>
        </div>
        <nav className="space-y-1 px-3 py-4">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href === "#" ? "#" : `/${locale}${item.href}`}
                className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
              >
                <Icon className="h-4 w-4" />
                {"label" in item ? item.label : dict.nav[item.labelKey]}
              </Link>
            );
          })}
        </nav>
      </aside>
      <main className="lg:pl-64">
        <header className="sticky top-0 z-10 flex min-h-16 items-center justify-between border-b border-slate-200 bg-white px-4 py-3 lg:px-8">
          <div>
            <h1 className="text-xl font-semibold tracking-normal">{title}</h1>
            <p className="text-xs text-slate-500">{dict.app.timezonePricing}</p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={replacePathLocale(`/${locale}${currentPath}`, otherLocale)}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              title={dict.app.language}
            >
              {localeLabels[otherLocale]}
            </Link>
            {isDemo ? (
              <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800 ring-1 ring-amber-200">
                {dict.app.demoData}
              </span>
            ) : null}
          </div>
        </header>
        <div className="px-4 py-6 lg:px-8">{children}</div>
      </main>
    </div>
  );
}

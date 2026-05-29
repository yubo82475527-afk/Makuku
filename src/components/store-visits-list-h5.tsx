"use client";

import { ArrowLeft, CalendarDays, ChevronRight, ImageIcon, Loader2, Plus, RefreshCw } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";
import type { Locale } from "@/lib/i18n/config";
import { getMobileCopy, mobileAnalysisStatusLabel } from "@/lib/mobile-i18n";
import type { StockRiskLevel, StoreVisitAnalysisStatus, StoreVisitAiResult } from "@/lib/types";
import { MobileLanguageSwitch } from "@/components/mobile-language-switch";

const storageKey = "makuku_app_user";

type AppUser = {
  id: string;
  displayName: string;
};

type VisitListItem = {
  id: string;
  store_name: string;
  region?: string | null;
  channel?: string | null;
  city?: string | null;
  channel_type?: string | null;
  visit_date: string;
  analysis_status?: StoreVisitAnalysisStatus | null;
  ai_result?: StoreVisitAiResult | null;
  photo_count?: number;
  created_at: string;
};

type Pagination = {
  page: number;
  page_size: number;
  total: number;
  has_next: boolean;
};

function loadUser(): AppUser | null {
  try {
    const raw = localStorage.getItem(storageKey);
    return raw ? (JSON.parse(raw) as AppUser) : null;
  } catch {
    return null;
  }
}

function statusClass(status: StoreVisitAnalysisStatus | null | undefined) {
  switch (status) {
    case "analyzing":
      return "bg-blue-50 text-blue-700 ring-blue-200";
    case "completed":
      return "bg-emerald-50 text-emerald-700 ring-emerald-200";
    case "failed":
      return "bg-red-50 text-red-700 ring-red-200";
    default:
      return "bg-amber-50 text-amber-700 ring-amber-200";
  }
}

function riskClass(level: StockRiskLevel) {
  switch (level) {
    case "Low Stock":
      return "bg-amber-50 text-amber-700 ring-amber-200";
    case "Out of Stock Risk":
      return "bg-red-50 text-red-700 ring-red-200";
    default:
      return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  }
}

function formatVisitDate(value: string, locale: Locale) {
  if (!value) return "-";
  return new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}

function Badge({ children, className }: { children: ReactNode; className: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${className}`}>
      {children}
    </span>
  );
}

export function StoreVisitsListH5({ locale }: { locale: Locale }) {
  const copy = getMobileCopy(locale);
  const [user, setUser] = useState<AppUser | null>(null);
  const [visits, setVisits] = useState<VisitListItem[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [todayCount, setTodayCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const newVisitHref = `/${locale}/mobile/offline-capture/new`;

  const loadVisits = useCallback(async (nextPage = 1, append = false, currentUser: AppUser | null = null) => {
    if (!currentUser?.id) return;
    if (append) setLoadingMore(true);
    else setLoading(true);
    setError(null);

    const params = new URLSearchParams({
      user_id: currentUser.id,
      page: String(nextPage),
      page_size: "20",
    });

    try {
      const res = await fetch(`/api/store-visits?${params.toString()}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? copy.loadVisitFailed);
        if (!append) setVisits([]);
        return;
      }
      const nextVisits = (data.visits ?? []) as VisitListItem[];
      setVisits((current) => (append ? [...current, ...nextVisits] : nextVisits));
      setPagination(data.pagination ?? null);
      setTodayCount(data.today_count ?? 0);
    } catch {
      setError(copy.networkRetry);
      if (!append) setVisits([]);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [copy.loadVisitFailed, copy.networkRetry]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      const stored = loadUser();
      setUser(stored);
      if (stored) {
        void loadVisits(1, false, stored);
      } else {
        setLoading(false);
      }
    }, 0);
    return () => clearTimeout(timeout);
  }, [loadVisits]);

  if (!user) {
    return (
      <main className="mx-auto min-h-screen max-w-md bg-slate-50 px-4 py-5 text-slate-950">
        <header className="mb-4 flex items-center gap-3">
          <Link href={`/${locale}/mobile/offline-capture`} className="rounded-full border border-slate-200 bg-white p-2 text-slate-700">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold">{copy.myVisits}</h1>
            <p className="text-sm text-slate-500">{copy.signInFirst}</p>
          </div>
          <MobileLanguageSwitch locale={locale} currentPath="/mobile/offline-capture/list" />
        </header>
        <Link href={newVisitHref} className="flex h-11 items-center justify-center rounded-lg bg-slate-900 text-sm font-semibold text-white">
          {copy.goToCapture}
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen max-w-md bg-slate-50 px-4 py-5 text-slate-950">
      <header className="sticky top-0 z-10 -mx-4 border-b border-slate-200 bg-slate-50/95 px-4 pb-4 pt-1 backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-normal text-blue-600">{user.displayName}</p>
            <h1 className="mt-1 text-2xl font-bold">{copy.myVisits}</h1>
          </div>
          <div className="flex items-center gap-2">
            <MobileLanguageSwitch locale={locale} currentPath="/mobile/offline-capture/list" />
            <button type="button" onClick={() => loadVisits(1, false, user)} className="rounded-full border border-slate-200 bg-white p-2 text-slate-700 shadow-sm" aria-label={copy.refreshVisits}>
              <RefreshCw className="h-4 w-4" />
            </button>
            <Link href={newVisitHref} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-slate-900 px-3 text-xs font-bold text-white shadow-sm">
              <Plus className="h-3.5 w-3.5" />
              {copy.new}
            </Link>
          </div>
        </div>
        <div className="mt-4 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-normal text-slate-500">{copy.todaysVisitCount}</div>
          <div className="mt-1 flex items-end gap-2">
            <span className="text-3xl font-bold">{todayCount}</span>
            <span className="pb-1 text-sm text-slate-500">{copy.visits}</span>
          </div>
        </div>
      </header>

      <section className="space-y-3 py-4">
        {error ? <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
        {loading ? (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 shadow-sm">
            <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
            {copy.loadingVisits}
          </div>
        ) : null}
        {!loading && visits.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
            <div>{copy.noVisitsYet}</div>
            <Link href={newVisitHref} className="mt-4 inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white">
              <Plus className="h-4 w-4" />
              {copy.newVisit}
            </Link>
          </div>
        ) : null}
        {visits.map((visit) => {
          const status = visit.analysis_status ?? "pending";
          const risk = visit.ai_result?.stock_risk?.level;
          const summary = visit.ai_result?.store_summary;
          return (
            <Link
              key={visit.id}
              href={`/${locale}/mobile/offline-capture/${visit.id}`}
              className="block rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm active:scale-[0.99]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate text-base font-bold">{visit.store_name}</h2>
                  <p className="mt-1 truncate text-xs text-slate-500">{visit.region ?? "-"} / {visit.channel ?? "-"}</p>
                </div>
                <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-slate-400" />
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Badge className={statusClass(status)}>{mobileAnalysisStatusLabel(locale, status)}</Badge>
                {risk ? <Badge className={riskClass(risk)}>{risk}</Badge> : null}
              </div>

              {summary ? (
                <p
                  className="mt-3 overflow-hidden text-sm leading-5 text-slate-700"
                  style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}
                >
                  {summary}
                </p>
              ) : (
                <p className="mt-3 text-sm text-slate-400">{copy.noSummaryYet}</p>
              )}

              <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-500">
                <span className="inline-flex items-center gap-1.5">
                  <CalendarDays className="h-3.5 w-3.5" />
                  {formatVisitDate(visit.visit_date, locale)}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <ImageIcon className="h-3.5 w-3.5" />
                  {visit.photo_count ?? 0} {copy.photos}
                </span>
              </div>
            </Link>
          );
        })}
      </section>

      {pagination?.has_next ? (
        <button
          type="button"
          onClick={() => loadVisits((pagination.page ?? 1) + 1, true, user)}
          disabled={loadingMore}
          className="mb-6 flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white text-sm font-semibold text-slate-700 disabled:opacity-60"
        >
          {loadingMore ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {loadingMore ? copy.loading : copy.loadMore}
        </button>
      ) : null}
      {visits.length > 0 ? (
        <div className="sticky bottom-0 -mx-4 border-t border-slate-200 bg-slate-50/95 px-4 py-3 backdrop-blur">
          <Link href={newVisitHref} className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-slate-900 text-sm font-bold text-white shadow-sm">
            <Plus className="h-4 w-4" />
            {copy.newVisit}
          </Link>
        </div>
      ) : null}
    </main>
  );
}

"use client";

import { ArrowLeft, CalendarDays, ChevronRight, ImageIcon, Languages, Loader2, LogIn, LogOut, Plus, RefreshCw, Settings } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { LoadingOverlay } from "@/components/loading-overlay";
import { withMinimumDelay } from "@/lib/async-ui";
import { localeLabels, replacePathLocale, type Locale } from "@/lib/i18n/config";
import { getMobileCopy, mobileAnalysisStatusLabel } from "@/lib/mobile-i18n";
import type { StockRiskLevel, StoreVisitAnalysisStatus, StoreVisitAiResult } from "@/lib/types";
import { MobileLanguageSwitch } from "@/components/mobile-language-switch";

const storageKey = "makuku_app_user";

type AppUser = {
  id: string;
  username?: string;
  displayName: string;
  role?: string;
};

type VisitListItem = {
  id: string;
  store_name: string;
  region?: string | null;
  channel?: string | null;
  city?: string | null;
  channel_type?: string | null;
  visit_date: string;
  visit_status?: string | null;
  analysis_status?: StoreVisitAnalysisStatus | null;
  analysis_error?: string | null;
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

function saveUser(user: AppUser) {
  localStorage.setItem(storageKey, JSON.stringify(user));
}

function statusClass(status: StoreVisitAnalysisStatus | null | undefined) {
  switch (status) {
    case "analyzing":
      return "bg-blue-50 text-blue-700 ring-blue-200";
    case "completed":
      return "bg-emerald-50 text-emerald-700 ring-emerald-200";
    case "partial":
      return "bg-amber-50 text-amber-700 ring-amber-200";
    case "failed":
      return "bg-red-50 text-red-700 ring-red-200";
    default:
      return "bg-amber-50 text-amber-700 ring-amber-200";
  }
}

function canRetryAnalysis(status: StoreVisitAnalysisStatus | null | undefined, visitStatus: string | null | undefined) {
  return status === "failed" || status === "partial" || (visitStatus === "uploaded" && (!status || status === "pending"));
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

function MobileCaptureSettingsMenu({
  locale,
  onLogout,
}: {
  locale: Locale;
  onLogout: () => void;
}) {
  const otherLocale: Locale = locale === "en" ? "zh" : "en";
  const labels = locale === "zh"
    ? {
        settings: "\u8bbe\u7f6e",
        language: "\u8bed\u8a00",
        logout: "\u9000\u51fa\u767b\u5f55",
      }
    : {
        settings: "Settings",
        language: "Language",
        logout: "Sign Out",
      };

  return (
    <details className="relative">
      <summary
        aria-label={labels.settings}
        title={labels.settings}
        className="flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-sm hover:bg-slate-50 [&::-webkit-details-marker]:hidden"
      >
        <Settings className="h-4 w-4" />
      </summary>
      <div className="absolute right-0 top-11 z-20 w-44 rounded-xl border border-slate-200 bg-white p-2 text-sm shadow-lg">
        <div className="px-2 py-1 text-xs font-semibold uppercase tracking-normal text-slate-500">{labels.language}</div>
        <Link
          href={`/${locale}/mobile/offline-capture`}
          className="flex items-center justify-between rounded-lg px-2 py-2 font-medium text-slate-700 hover:bg-slate-50"
        >
          <span>{localeLabels[locale]}</span>
          <Languages className="h-4 w-4 text-slate-400" />
        </Link>
        <Link
          href={replacePathLocale(`/${locale}/mobile/offline-capture`, otherLocale)}
          className="flex items-center justify-between rounded-lg px-2 py-2 font-medium text-slate-700 hover:bg-slate-50"
        >
          <span>{localeLabels[otherLocale]}</span>
          <Languages className="h-4 w-4 text-slate-400" />
        </Link>
        <button
          type="button"
          onClick={onLogout}
          className="mt-1 flex w-full items-center justify-between rounded-lg border-t border-slate-100 px-2 py-2 text-left font-semibold text-red-700 hover:bg-red-50"
        >
          <span>{labels.logout}</span>
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </details>
  );
}

export function StoreVisitsListH5({ locale }: { locale: Locale }) {
  const router = useRouter();
  const copy = getMobileCopy(locale);
  const [user, setUser] = useState<AppUser | null>(null);
  const [visits, setVisits] = useState<VisitListItem[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [todayCount, setTodayCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [reanalyzingVisitId, setReanalyzingVisitId] = useState<string | null>(null);
  const [autoAnalyzingVisitIds, setAutoAnalyzingVisitIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginPhase, setLoginPhase] = useState<"idle" | "submitting" | "redirecting">("idle");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [startingVisit, setStartingVisit] = useState(false);
  const autoAnalysisAttemptedIds = useRef<Set<string>>(new Set());
  const newVisitHref = `/${locale}/mobile/offline-capture/new`;

  const loginText = locale === "zh"
    ? {
        title: "\u79fb\u52a8\u5de1\u5e97\u767b\u5f55",
        username: "\u7528\u6237\u540d",
        password: "\u5bc6\u7801",
        usernamePlaceholder: "\u8f93\u5165\u7528\u6237\u540d",
        passwordPlaceholder: "\u8f93\u5165\u5bc6\u7801",
        submit: "\u767b\u5f55",
        submitting: "\u767b\u5f55\u4e2d...",
        required: "\u8bf7\u8f93\u5165\u7528\u6237\u540d\u548c\u5bc6\u7801\u3002",
        failed: "\u767b\u5f55\u5931\u8d25",
      }
    : {
        title: "Mobile Visit Login",
        username: "Username",
        password: "Password",
        usernamePlaceholder: "Enter username",
        passwordPlaceholder: "Enter password",
        submit: "Sign In",
        submitting: "Signing in...",
        required: "Enter username and password.",
        failed: "Sign-in failed",
      };

  const loadingText = locale === "zh"
    ? {
        loggingIn: "\u6b63\u5728\u9a8c\u8bc1\u8d26\u53f7...",
        redirecting: "\u767b\u5f55\u6210\u529f\uff0c\u6b63\u5728\u8fdb\u5165\u7cfb\u7edf...",
        openingVisit: "\u6b63\u5728\u6253\u5f00\u5de1\u5e97\u8868\u5355...",
        openingVisitHint: "\u8bf7\u7a0d\u5019\uff0c\u4e0d\u8981\u91cd\u590d\u70b9\u51fb\u3002",
      }
    : {
        loggingIn: "Verifying account...",
        redirecting: "Signed in. Entering the app...",
        openingVisit: "Opening the visit form...",
        openingVisitHint: "Please wait and avoid tapping repeatedly.",
      };

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

  async function handleLogin() {
    if (!username.trim() || !password) {
      setLoginError(loginText.required);
      return;
    }

    setLoginLoading(true);
    setLoginPhase("submitting");
    setLoginError(null);
    try {
      const res = await withMinimumDelay(fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      }));
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.user?.id) {
        setLoginError(data.error ?? loginText.failed);
        return;
      }

      const nextUser = data.user as AppUser;
      saveUser(nextUser);
      setLoginPhase("redirecting");
      setUser(nextUser);
      setPassword("");
      await loadVisits(1, false, nextUser);
    } catch {
      setLoginError(copy.networkRetry);
      setLoginPhase("idle");
    } finally {
      setLoginLoading(false);
      setLoginPhase((current) => (current === "redirecting" ? "idle" : current === "submitting" ? "idle" : current));
    }
  }

  function handleLogout() {
    localStorage.removeItem(storageKey);
    setUser(null);
    setVisits([]);
    setPagination(null);
    setTodayCount(0);
    setPassword("");
    setLoginError(null);
    setLoading(false);
  }

  function startNewVisit() {
    if (startingVisit) return;
    setStartingVisit(true);
    router.push(newVisitHref);
  }

  async function reanalyzeVisit(visitId: string) {
    if (!user?.id) return;
    setReanalyzingVisitId(visitId);
    setError(null);
    try {
      const res = await fetch("/api/store-visit/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visit_id: visitId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? copy.aiAnalysisFailed);
      }
      await loadVisits(1, false, user);
    } catch {
      setError(copy.aiAnalysisFailed);
      await loadVisits(1, false, user);
    } finally {
      setReanalyzingVisitId(null);
    }
  }

  const autoAnalyzeVisit = useCallback(async (visitId: string, currentUser: AppUser) => {
    autoAnalysisAttemptedIds.current.add(visitId);
    setAutoAnalyzingVisitIds((current) => current.includes(visitId) ? current : [...current, visitId]);
    setVisits((current) => current.map((visit) => (
      visit.id === visitId ? { ...visit, analysis_status: "analyzing", analysis_error: null } : visit
    )));

    try {
      await fetch("/api/store-visit/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visit_id: visitId }),
      });
    } finally {
      setAutoAnalyzingVisitIds((current) => current.filter((id) => id !== visitId));
      await loadVisits(1, false, currentUser);
    }
  }, [loadVisits]);

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

  useEffect(() => {
    if (!user?.id || loading || loadingMore) return;
    const pendingVisit = visits.find((visit) => (
      visit.visit_status === "uploaded"
      && (visit.analysis_status === "pending" || !visit.analysis_status)
      && !autoAnalyzingVisitIds.includes(visit.id)
      && !autoAnalysisAttemptedIds.current.has(visit.id)
    ));
    if (!pendingVisit) return;
    void autoAnalyzeVisit(pendingVisit.id, user);
  }, [autoAnalyzeVisit, autoAnalyzingVisitIds, loading, loadingMore, user, visits]);

  if (!user) {
    return (
      <>
        <LoadingOverlay
          open={loginPhase !== "idle"}
          title={loginPhase === "redirecting" ? loadingText.redirecting : loadingText.loggingIn}
          description={locale === "zh" ? "请稍候，不要重复点击。" : "Please wait and avoid tapping repeatedly."}
        />
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
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-base font-bold">{loginText.title}</h2>
            {loginError ? <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{loginError}</div> : null}
            {loginLoading ? (
              <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">
                {loginPhase === "redirecting" ? loadingText.redirecting : loadingText.loggingIn}
              </div>
            ) : null}
            <div className="mt-4 space-y-3">
              <label className="block">
                <span className="text-sm font-semibold text-slate-700">{loginText.username}</span>
                <input
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  onKeyDown={(event) => event.key === "Enter" && handleLogin()}
                  placeholder={loginText.usernamePlaceholder}
                  disabled={loginLoading}
                  className="mt-1 h-11 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-blue-500 disabled:bg-slate-100"
                />
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-slate-700">{loginText.password}</span>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  onKeyDown={(event) => event.key === "Enter" && handleLogin()}
                  placeholder={loginText.passwordPlaceholder}
                  disabled={loginLoading}
                  className="mt-1 h-11 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-blue-500 disabled:bg-slate-100"
                />
              </label>
            </div>
            <button
              type="button"
              onClick={handleLogin}
              disabled={loginLoading}
              className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-slate-900 text-sm font-semibold text-white disabled:opacity-60"
            >
              {loginLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
              {loginLoading ? loginText.submitting : loginText.submit}
            </button>
          </section>
        </main>
      </>
    );
  }

  return (
    <>
      <LoadingOverlay
        open={startingVisit}
        title={loadingText.openingVisit}
        description={loadingText.openingVisitHint}
      />
      <main className="mx-auto min-h-screen max-w-md bg-slate-50 px-4 py-5 text-slate-950">
        <header className="sticky top-0 z-10 -mx-4 border-b border-slate-200 bg-slate-50/95 px-4 pb-4 pt-1 backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-normal text-blue-600">{user.displayName}</p>
              <h1 className="mt-1 text-2xl font-bold">{copy.myVisits}</h1>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => loadVisits(1, false, user)} className="rounded-full border border-slate-200 bg-white p-2 text-slate-700 shadow-sm" aria-label={copy.refreshVisits}>
                <RefreshCw className="h-4 w-4" />
              </button>
              <MobileCaptureSettingsMenu locale={locale} onLogout={handleLogout} />
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
            <div className="space-y-3">
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="h-5 w-28 animate-pulse rounded bg-slate-200" />
                <div className="mt-3 h-4 w-40 animate-pulse rounded bg-slate-100" />
                <div className="mt-4 h-14 animate-pulse rounded-lg bg-slate-100" />
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="h-4 w-32 animate-pulse rounded bg-slate-200" />
                <div className="mt-3 h-4 w-52 animate-pulse rounded bg-slate-100" />
                <div className="mt-4 h-10 animate-pulse rounded-lg bg-slate-100" />
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4 text-center text-sm text-slate-500 shadow-sm">
                <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
                {copy.loadingVisits}
              </div>
            </div>
          ) : null}
        {!loading && visits.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
            <div>{copy.noVisitsYet}</div>
            <button type="button" onClick={startNewVisit} disabled={startingVisit} className="mt-4 inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white disabled:opacity-60">
              <Plus className="h-4 w-4" />
              {copy.newVisit}
            </button>
          </div>
        ) : null}
        {visits.map((visit) => {
          const status = visit.analysis_status ?? "pending";
          const retryable = canRetryAnalysis(status, visit.visit_status);
          const risk = visit.ai_result?.stock_risk?.level;
          const summary = visit.ai_result?.store_summary;
          return (
            <article key={visit.id} className="rounded-xl border border-slate-200 bg-white shadow-sm">
              <Link
                href={`/${locale}/mobile/offline-capture/${visit.id}`}
                className="block p-4 text-left active:scale-[0.99]"
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
                  <p className="mt-3 text-sm text-slate-400">{visit.analysis_error ?? copy.noSummaryYet}</p>
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
              {retryable ? (
                <div className="border-t border-slate-100 px-4 py-3">
                  <button
                    type="button"
                    onClick={() => reanalyzeVisit(visit.id)}
                    disabled={reanalyzingVisitId === visit.id}
                    className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-blue-600 text-sm font-bold text-white disabled:opacity-60"
                  >
                    {reanalyzingVisitId === visit.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    {copy.retryAnalyze}
                  </button>
                </div>
              ) : null}
            </article>
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
          <button type="button" onClick={startNewVisit} disabled={startingVisit} className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-slate-900 text-sm font-bold text-white shadow-sm disabled:opacity-60">
            <Plus className="h-4 w-4" />
            {copy.newVisit}
          </button>
        </div>
      ) : null}
      </main>
    </>
  );
}

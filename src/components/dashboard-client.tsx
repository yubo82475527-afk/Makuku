"use client";

import { useEffect, useMemo, useState } from "react";
import { ExceptionSection, ExecutionSection, PriceIndexSection } from "@/components/dashboard-content";
import { Card, DataNotice } from "@/components/ui";
import type {
  DashboardExceptionPayload,
  DashboardExecutionPayload,
  DashboardPricePayload,
  DashboardSearchParams,
} from "@/lib/dashboard-data";
import type { Dictionary } from "@/lib/i18n/get-dictionary";

export function DashboardClient({
  locale,
  dict,
  queryString,
}: {
  locale: string;
  dict: Dictionary;
  queryString: string;
}) {
  const [pricePayload, setPricePayload] = useState<DashboardPricePayload | null>(null);
  const [exceptionPayload, setExceptionPayload] = useState<DashboardExceptionPayload | null>(null);
  const [executionPayload, setExecutionPayload] = useState<DashboardExecutionPayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const query = useMemo(() => Object.fromEntries(new URLSearchParams(queryString)) as DashboardSearchParams, [queryString]);

  useEffect(() => {
    const controller = new AbortController();

    async function loadDashboardSection<T>(
      section: string,
      onPayload: (payload: T) => void,
    ) {
      try {
        const params = new URLSearchParams(queryString);
        params.set("locale", locale);
        params.set("section", section);
        const url = `/api/dashboard?${params.toString()}`;
        const response = await fetch(url, {
          cache: "no-store",
          signal: controller.signal,
        });
        const nextPayload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(nextPayload.error ?? "Failed to load dashboard");
        if (!controller.signal.aborted) onPayload(nextPayload as T);
      } catch (error) {
        if (controller.signal.aborted) return;
        setLoadError(error instanceof Error ? error.message : "Failed to load dashboard");
      }
    }

    const timer = window.setTimeout(() => {
      setPricePayload(null);
      setExceptionPayload(null);
      setExecutionPayload(null);
      setLoadError(null);
      void loadDashboardSection<DashboardPricePayload>("price", setPricePayload);
      void loadDashboardSection<DashboardExceptionPayload>("exceptions", setExceptionPayload);
      void loadDashboardSection<DashboardExecutionPayload>("execution", setExecutionPayload);
    }, 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [locale, queryString]);

  const dataError = pricePayload?.error ?? exceptionPayload?.error ?? executionPayload?.error ?? loadError;
  const isZh = locale === "zh";

  return (
    <>
      <DataNotice dict={dict} error={dataError} />
      <section className="space-y-6">
        {pricePayload ? (
          <PriceIndexSection locale={locale} board={pricePayload.data.priceBoard} isZh={isZh} />
        ) : (
          <DashboardSectionLoadingContent />
        )}
        {exceptionPayload ? (
          <ExceptionSection
            locale={locale}
            isZh={isZh}
            summary={exceptionPayload.data.exceptionSummary}
            battles={exceptionPayload.data.battles}
            alerts={exceptionPayload.data.alerts}
            query={query}
          />
        ) : (
          <DashboardSectionLoadingContent />
        )}
        {executionPayload ? (
          <ExecutionSection isZh={isZh} board={executionPayload.data.executionBoard} query={query} />
        ) : (
          <DashboardSectionLoadingContent />
        )}
      </section>
    </>
  );
}

function DashboardSectionLoadingContent() {
  return (
    <Card>
      <div className="h-4 w-32 animate-pulse rounded bg-slate-200" />
      <div className="mt-3 h-7 w-72 max-w-full animate-pulse rounded bg-slate-200" />
      <div className="mt-5 grid gap-3 md:grid-cols-3">
        <div className="h-10 animate-pulse rounded-md bg-slate-100" />
        <div className="h-10 animate-pulse rounded-md bg-slate-100" />
        <div className="h-10 animate-pulse rounded-md bg-slate-100" />
      </div>
      <div className="mt-4 h-40 animate-pulse rounded-md bg-slate-100" />
    </Card>
  );
}

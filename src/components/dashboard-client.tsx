"use client";

import { useEffect, useState } from "react";
import { PriceIndexSection } from "@/components/dashboard-content";
import { Card, DataNotice } from "@/components/ui";
import type { DashboardPricePayload } from "@/lib/dashboard-data";
import type { Dictionary } from "@/lib/i18n/get-dictionary";
import {
  DEFAULT_PRICE_INDEX_DIMENSIONS,
  PRICE_INDEX_DIMENSION_STORAGE_KEY,
  normalizePriceIndexDimensions,
  type PriceIndexDimension,
} from "@/lib/price-index-dimensions";

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
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState<PriceIndexDimension[] | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDimensions(readPriceIndexDimensions(window.localStorage));
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!dimensions) return;
    const controller = new AbortController();
    const params = new URLSearchParams(queryString);
    params.set("locale", locale);
    params.set("section", "price");
    params.set("dimensions", dimensions.join(","));

    async function loadPriceIndex() {
      try {
        const url = `/api/dashboard?${params.toString()}`;
        const response = await fetch(url, {
          cache: "no-store",
          signal: controller.signal,
        });
        const nextPayload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(nextPayload.error ?? "Failed to load dashboard");
        if (!controller.signal.aborted) setPricePayload(nextPayload as DashboardPricePayload);
      } catch (error) {
        if (controller.signal.aborted) return;
        setLoadError(error instanceof Error ? error.message : "Failed to load dashboard");
      }
    }

    const timer = window.setTimeout(() => {
      setPricePayload(null);
      setLoadError(null);
      void loadPriceIndex();
    }, 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [dimensions, locale, queryString]);

  function handleDimensionsChange(nextDimensions: PriceIndexDimension[]) {
    const normalized = normalizePriceIndexDimensions(nextDimensions);
    try {
      window.localStorage.setItem(PRICE_INDEX_DIMENSION_STORAGE_KEY, JSON.stringify(normalized));
    } catch {
      // Keep rendering even when storage is unavailable.
    }
    setDimensions(normalized);
  }

  const dataError = pricePayload?.error ?? loadError;
  const isZh = locale === "zh";

  return (
    <>
      <DataNotice dict={dict} error={dataError} />
      <section className="space-y-6">
        {pricePayload ? (
          <PriceIndexSection
            locale={locale}
            board={pricePayload.data.priceBoard}
            isZh={isZh}
            dimensions={dimensions ?? DEFAULT_PRICE_INDEX_DIMENSIONS}
            onDimensionsChange={handleDimensionsChange}
          />
        ) : (
          <DashboardSectionLoadingContent />
        )}
      </section>
    </>
  );
}

function readPriceIndexDimensions(storage: Pick<Storage, "getItem">) {
  try {
    return normalizePriceIndexDimensions(JSON.parse(storage.getItem(PRICE_INDEX_DIMENSION_STORAGE_KEY) ?? "null"));
  } catch {
    return DEFAULT_PRICE_INDEX_DIMENSIONS;
  }
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

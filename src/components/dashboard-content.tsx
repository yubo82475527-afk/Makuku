"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { PriceIndexExportButton } from "@/components/price-index-export-button";
import { PriceIndexLayoutDialog } from "@/components/price-index-layout-dialog";
import { PriceIndexTreeTable } from "@/components/price-index-tree-table";
import { QueryForm, QuerySubmitButton } from "@/components/query-form";
import { Card } from "@/components/ui";
import { normalizePriceIndexDimensions, type PriceIndexDimension } from "@/lib/price-index-dimensions";
import { joinPackageFilterList } from "@/lib/price-index-package-filters";
import type { WeeklyPriceCoefficientBoard } from "@/lib/types";

export function PriceIndexSection({
  locale,
  board,
  isZh,
  dimensions,
  onDimensionsChange,
}: {
  locale: string;
  board: WeeklyPriceCoefficientBoard;
  isZh: boolean;
  dimensions?: PriceIndexDimension[];
  onDimensionsChange?: (dimensions: PriceIndexDimension[]) => void;
}) {
  const activeDimensions = normalizePriceIndexDimensions(dimensions ?? board.dimensions);

  return (
    <Card>
      <div className="mb-4">
        <div className="text-xs font-semibold uppercase tracking-normal text-slate-500">
          {isZh ? "价格指数" : "Price Index"}
        </div>
        <h2 className="mt-1 text-2xl font-semibold tracking-normal text-slate-950">{board.title}</h2>
        <p className="mt-1 text-sm text-slate-600">
          {isZh
            ? "按组织、省、市、区和 SKU 逐层展开，查看每周单片价格与系数。"
            : "Expand by organization, province, city, district, and SKU to review weekly price per piece and coefficient."}
        </p>
      </div>
      <WeeklyPriceCoefficientFilters
        locale={locale}
        board={board}
        isZh={isZh}
        dimensions={activeDimensions}
        onDimensionsChange={onDimensionsChange}
      />
      <PriceIndexTreeTable board={board} isZh={isZh} />
    </Card>
  );
}

const dashboardFilterControlClassName =
  "flex h-10 items-center rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700 shadow-sm focus-within:border-slate-500 focus-within:ring-2 focus-within:ring-slate-200";

const dashboardFilterDisabledClassName =
  "flex h-10 items-center rounded-md border border-slate-200 bg-slate-50 px-3 text-sm text-slate-400";

function WeeklyPriceCoefficientFilters({
  locale,
  board,
  isZh,
  dimensions,
  onDimensionsChange,
}: {
  locale: string;
  board: WeeklyPriceCoefficientBoard;
  isZh: boolean;
  dimensions: PriceIndexDimension[];
  onDimensionsChange?: (dimensions: PriceIndexDimension[]) => void;
}) {
  const [ownSeries, setOwnSeries] = useState(board.selectedOwnSeries ?? "");
  const [ownPackages, setOwnPackages] = useState<string[]>(board.selectedOwnPackage);
  const [competitorPackages, setCompetitorPackages] = useState<string[]>(board.selectedCompetitorPackage);
  const [ownPackageOptions, setOwnPackageOptions] = useState(board.ownPackageOptions);
  const [competitorPackageOptions, setCompetitorPackageOptions] = useState(board.competitorPackageOptions);
  const [optionsLoading, setOptionsLoading] = useState(false);

  useEffect(() => {
    setOwnSeries(board.selectedOwnSeries ?? "");
    setOwnPackages(board.selectedOwnPackage);
    setCompetitorPackages(board.selectedCompetitorPackage);
    setOwnPackageOptions(board.ownPackageOptions);
    setCompetitorPackageOptions(board.competitorPackageOptions);
  }, [
    board.selectedOwnSeries,
    board.selectedOwnPackage,
    board.selectedCompetitorPackage,
    board.ownPackageOptions,
    board.competitorPackageOptions,
  ]);

  useEffect(() => {
    if (!ownSeries) {
      setOwnPackageOptions([]);
      setCompetitorPackageOptions([]);
      return;
    }

    const controller = new AbortController();
    const params = new URLSearchParams({
      section: "price-package-options",
      ownSeries,
    });
    const ownPackageParam = joinPackageFilterList(ownPackages);
    if (ownPackageParam) params.set("ownPackage", ownPackageParam);

    async function loadPackageOptions() {
      setOptionsLoading(true);
      try {
        const response = await fetch(`/api/dashboard?${params.toString()}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error ?? "Failed to load package options");
        if (controller.signal.aborted) return;
        const nextOwnOptions = Array.isArray(payload.data?.ownPackageOptions) ? payload.data.ownPackageOptions : [];
        const nextCompetitorOptions = Array.isArray(payload.data?.competitorPackageOptions)
          ? payload.data.competitorPackageOptions
          : [];
        setOwnPackageOptions(nextOwnOptions);
        setCompetitorPackageOptions(nextCompetitorOptions);
        setOwnPackages((current) => current.filter((item) => nextOwnOptions.includes(item)));
        setCompetitorPackages((current) => current.filter((item) => nextCompetitorOptions.includes(item)));
      } catch (error) {
        if (controller.signal.aborted) return;
        console.error(error);
      } finally {
        if (!controller.signal.aborted) setOptionsLoading(false);
      }
    }

    const timer = window.setTimeout(() => {
      void loadPackageOptions();
    }, 0);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [ownSeries, ownPackages.join(",")]);

  const ownPackageEnabled = Boolean(ownSeries);
  const competitorPackageEnabled = Boolean(ownSeries && ownPackages.length);

  return (
    <QueryForm className="mb-4 space-y-3">
      <div className="grid items-stretch gap-3 md:grid-cols-2 xl:grid-cols-5">
        <MonthFilter month={board.month} isZh={isZh} />
        <OrganizationFilter
          selectedOrganization={board.selectedOrganization}
          options={board.organizationOptions}
          isZh={isZh}
        />
        <OwnSeriesFilter
          selectedOwnSeries={ownSeries}
          options={board.ownSeriesOptions}
          isZh={isZh}
          onChange={(next) => {
            setOwnSeries(next);
            setOwnPackages([]);
            setCompetitorPackages([]);
            setCompetitorPackageOptions([]);
            if (!next) setOwnPackageOptions([]);
          }}
        />
        <PackageMultiSelect
          name="ownPackage"
          label="GPL2"
          selected={ownPackages}
          options={ownPackageOptions}
          enabled={ownPackageEnabled}
          loading={optionsLoading && ownPackageEnabled}
          isZh={isZh}
          disabledHint={isZh ? "请先选择 GPL1" : "Select GPL1 first"}
          emptyHint={isZh ? "全部 GPL2" : "All GPL2"}
          onChange={(next) => {
            setOwnPackages(next);
            setCompetitorPackages([]);
            if (!next.length) setCompetitorPackageOptions([]);
          }}
        />
        <PackageMultiSelect
          name="competitorPackage"
          label={isZh ? "竞品包装" : "Competitor package"}
          selected={competitorPackages}
          options={competitorPackageOptions}
          enabled={competitorPackageEnabled}
          loading={optionsLoading && competitorPackageEnabled}
          isZh={isZh}
          disabledHint={isZh ? "请先选择 GPL2" : "Select GPL2 first"}
          emptyHint={isZh ? "全部竞品包装" : "All competitor packages"}
          onChange={setCompetitorPackages}
        />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <QuerySubmitButton
          className="h-10 whitespace-nowrap"
          idleLabel={isZh ? "查询" : "Filter"}
          pendingLabel={isZh ? "加载中..." : "Loading..."}
        />
        <PriceIndexLayoutDialog
          dimensions={dimensions}
          isZh={isZh}
          onSave={(nextDimensions) => onDimensionsChange?.(nextDimensions)}
        />
        <PriceIndexExportButton
          locale={locale}
          filters={{
            month: board.month,
            organization: board.selectedOrganization ?? undefined,
            ownSeries: board.selectedOwnSeries ?? undefined,
            ownPackage: joinPackageFilterList(board.selectedOwnPackage),
            competitorPackage: joinPackageFilterList(board.selectedCompetitorPackage),
            dimensions: (dimensions.length ? dimensions : board.dimensions).join(","),
          }}
        />
      </div>
    </QueryForm>
  );
}

function MonthFilter({ month, isZh }: { month: string; isZh: boolean }) {
  return (
    <label className={dashboardFilterControlClassName}>
      <span className="mr-2 shrink-0 text-xs font-medium text-slate-500">{isZh ? "月份" : "Month"}</span>
      <input
        name="month"
        type="month"
        defaultValue={month}
        aria-label={isZh ? "月份" : "Month"}
        className="min-w-0 flex-1 bg-transparent outline-none [color-scheme:light]"
      />
    </label>
  );
}

function OrganizationFilter({
  selectedOrganization,
  options,
  isZh,
}: {
  selectedOrganization?: string | null;
  options: string[];
  isZh: boolean;
}) {
  return (
    <label className={dashboardFilterControlClassName}>
      <span className="mr-2 shrink-0 text-xs font-medium text-slate-500">{isZh ? "组织" : "Organization"}</span>
      <select
        name="organization"
        defaultValue={selectedOrganization ?? ""}
        className="min-w-0 flex-1 bg-transparent outline-none"
      >
        <option value="">{isZh ? "全部组织" : "All organizations"}</option>
        {options.map((item) => (
          <option key={item} value={item}>
            {item}
          </option>
        ))}
      </select>
    </label>
  );
}

function OwnSeriesFilter({
  selectedOwnSeries,
  options,
  isZh,
  onChange,
}: {
  selectedOwnSeries?: string | null;
  options: string[];
  isZh: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className={dashboardFilterControlClassName}>
      <span className="mr-2 shrink-0 text-xs font-medium text-slate-500">GPL1</span>
      <select
        name="ownSeries"
        value={selectedOwnSeries ?? ""}
        onChange={(event) => onChange(event.target.value)}
        className="min-w-0 flex-1 bg-transparent text-sm font-normal outline-none"
      >
        <option value="">{isZh ? "全部 GPL1" : "All GPL1"}</option>
        {options.map((series) => (
          <option key={series} value={series}>
            {series}
          </option>
        ))}
      </select>
    </label>
  );
}

function PackageMultiSelect({
  name,
  label,
  selected,
  options,
  enabled,
  loading,
  isZh,
  disabledHint,
  emptyHint,
  onChange,
}: {
  name: string;
  label: string;
  selected: string[];
  options: string[];
  enabled: boolean;
  loading?: boolean;
  isZh: boolean;
  disabledHint: string;
  emptyHint: string;
  onChange: (values: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const joinedValue = joinPackageFilterList(selected) ?? "";

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  const summary = !enabled
    ? disabledHint
    : loading
      ? (isZh ? "加载中..." : "Loading...")
      : selected.length
        ? selected.length === 1
          ? selected[0]
          : (isZh ? `已选 ${selected.length} 项` : `${selected.length} selected`)
        : emptyHint;

  return (
    <div ref={rootRef} className="relative">
      <input type="hidden" name={name} value={joinedValue} />
      <button
        type="button"
        disabled={!enabled}
        onClick={() => setOpen((current) => !current)}
        className={`${enabled ? dashboardFilterControlClassName : dashboardFilterDisabledClassName} w-full justify-between gap-2 text-left font-normal`}
      >
        <span className="mr-2 shrink-0 text-xs font-medium text-slate-500">{label}</span>
        <span className="min-w-0 flex-1 truncate text-sm font-normal">{summary}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
      </button>
      {open && enabled ? (
        <div className="absolute left-0 right-0 top-11 z-20 max-h-64 overflow-auto rounded-md border border-slate-200 bg-white p-2 shadow-lg">
          {!options.length ? (
            <div className="px-2 py-3 text-xs text-slate-500">{isZh ? "暂无可选项" : "No options"}</div>
          ) : (
            options.map((item) => {
              const checked = selected.includes(item);
              return (
                <label
                  key={item}
                  className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => {
                      onChange(
                        checked
                          ? selected.filter((value) => value !== item)
                          : [...selected, item],
                      );
                    }}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                  <span className="min-w-0 flex-1 truncate">{item}</span>
                </label>
              );
            })
          )}
        </div>
      ) : null}
    </div>
  );
}

"use client";

import { PriceIndexLayoutDialog } from "@/components/price-index-layout-dialog";
import { PriceIndexTreeTable } from "@/components/price-index-tree-table";
import { QueryForm, QuerySubmitButton } from "@/components/query-form";
import { Card } from "@/components/ui";
import { normalizePriceIndexDimensions, type PriceIndexDimension } from "@/lib/price-index-dimensions";
import type { WeeklyPriceCoefficientBoard } from "@/lib/types";

export function PriceIndexSection({
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

function WeeklyPriceCoefficientFilters({
  board,
  isZh,
  dimensions,
  onDimensionsChange,
}: {
  board: WeeklyPriceCoefficientBoard;
  isZh: boolean;
  dimensions: PriceIndexDimension[];
  onDimensionsChange?: (dimensions: PriceIndexDimension[]) => void;
}) {
  return (
    <QueryForm className="mb-4 grid items-stretch gap-3 md:grid-cols-2 xl:grid-cols-[minmax(180px,220px)_minmax(220px,1fr)_minmax(240px,1fr)_auto_auto]">
      <MonthFilter month={board.month} isZh={isZh} />
      <OrganizationFilter
        selectedOrganization={board.selectedOrganization}
        options={board.organizationOptions}
        isZh={isZh}
      />
      <OwnSeriesFilter selectedOwnSeries={board.selectedOwnSeries} options={board.ownSeriesOptions} isZh={isZh} />
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
}: {
  selectedOwnSeries?: string | null;
  options: string[];
  isZh: boolean;
}) {
  return (
    <label className={dashboardFilterControlClassName}>
      <span className="mr-2 shrink-0 text-xs font-medium text-slate-500">{isZh ? "自有系列" : "Own series"}</span>
      <select
        name="ownSeries"
        defaultValue={selectedOwnSeries ?? ""}
        className="min-w-0 flex-1 bg-transparent outline-none"
      >
        <option value="">{isZh ? "全部自有系列" : "All own series"}</option>
        {options.map((series) => (
          <option key={series} value={series}>
            {series}
          </option>
        ))}
      </select>
    </label>
  );
}

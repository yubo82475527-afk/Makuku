"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import type { PriceSnapshotOwnerFilter } from "@/lib/data";

const filterControlClassName =
  "h-auto w-full min-w-0 border-0 bg-transparent px-0 py-2 shadow-none focus:border-0 disabled:cursor-not-allowed disabled:text-slate-400";

export function PriceSnapshotLinkedFilters({
  locale,
  owner,
  brand,
  series,
  size,
  brandsByOwner,
  seriesByBrand,
  sizesByOwner,
  sizesByBrand,
}: {
  locale: string;
  owner: PriceSnapshotOwnerFilter;
  brand: string;
  series: string;
  size: string;
  brandsByOwner: Record<PriceSnapshotOwnerFilter, string[]>;
  seriesByBrand: Record<string, string[]>;
  sizesByOwner: Record<PriceSnapshotOwnerFilter, string[]>;
  sizesByBrand: Record<string, string[]>;
}) {
  const [ownerValue, setOwnerValue] = useState<PriceSnapshotOwnerFilter>(owner);
  const [brandValue, setBrandValue] = useState(brand);
  const [seriesValue, setSeriesValue] = useState(series);
  const [sizeValue, setSizeValue] = useState(size);

  const brandOptions = brandsByOwner[ownerValue] ?? [];
  const seriesOptions = brandValue ? seriesByBrand[brandValue] ?? [] : [];
  const sizeOptions = brandValue ? sizesByBrand[brandValue] ?? [] : sizesByOwner[ownerValue] ?? [];

  return (
    <>
      <LabeledSelect label={locale === "zh" ? "商品归属" : "Product ownership"}>
        <select
          name="owner"
          value={ownerValue}
          onChange={(event) => {
            setOwnerValue(event.target.value as PriceSnapshotOwnerFilter);
            setBrandValue("");
            setSeriesValue("");
            setSizeValue("");
          }}
          className={filterControlClassName}
        >
          <option value="all">{locale === "zh" ? "全部" : "All"}</option>
          <option value="makuku">{locale === "zh" ? "自有品牌" : "Own brands"}</option>
          <option value="competitor">{locale === "zh" ? "竞品" : "Competitors"}</option>
        </select>
      </LabeledSelect>
      <LabeledSelect label={locale === "zh" ? "品牌" : "Brand"}>
        <select
          name="brand"
          value={brandValue}
          onChange={(event) => {
            setBrandValue(event.target.value);
            setSeriesValue("");
            setSizeValue("");
          }}
          className={filterControlClassName}
        >
          <option value="">{locale === "zh" ? "全部品牌" : "All brands"}</option>
          {brandOptions.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </LabeledSelect>
      <LabeledSelect label={locale === "zh" ? "系列" : "Series"}>
        <select
          name="series"
          value={seriesValue}
          disabled={!brandValue}
          onChange={(event) => setSeriesValue(event.target.value)}
          className={filterControlClassName}
        >
          <option value="">{brandValue ? (locale === "zh" ? "全部系列" : "All series") : (locale === "zh" ? "请先选择品牌" : "Select a brand first")}</option>
          {seriesOptions.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </LabeledSelect>
      <LabeledSelect label={locale === "zh" ? "尺码" : "Size"}>
        <select
          name="size"
          value={sizeValue}
          onChange={(event) => setSizeValue(event.target.value)}
          className={filterControlClassName}
        >
          <option value="">{locale === "zh" ? "全部尺码" : "All sizes"}</option>
          {sizeOptions.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </LabeledSelect>
    </>
  );
}

function LabeledSelect({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex min-h-10 items-center rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700 shadow-sm focus-within:border-slate-500 focus-within:ring-2 focus-within:ring-slate-200">
      <span className="mr-2 shrink-0 text-xs font-medium text-slate-500">{label}</span>
      <span className="min-w-0 flex-1">{children}</span>
    </label>
  );
}

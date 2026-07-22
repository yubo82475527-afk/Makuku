"use client";

import Link from "next/link";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";
import { formatPricePerPiece } from "@/lib/format";
import type {
  WeeklyPriceCoefficientBoard,
  WeeklyPriceCoefficientNode,
  WeeklyPriceCoefficientNodeLevel,
} from "@/lib/types";

const WEEK_COLUMN_CLASS = "w-28 min-w-28";

export function PriceIndexTreeTable({
  board,
  isZh,
}: {
  board: WeeklyPriceCoefficientBoard;
  isZh: boolean;
}) {
  const ownLabel = board.selectedOwnSeries ? `MAKUKU ${board.selectedOwnSeries}` : "MAKUKU";
  const activeLevels = board.dimensions;
  const [expandedIds, setExpandedIds] = useState<Set<string>>(
    () => new Set(board.rows.map((row) => row.id)),
  );

  const nodesByLevel = useMemo(() => collectNodesByLevel(board.rows), [board.rows]);

  const toggle = (id: string) => {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const expandToLevel = (targetLevel: WeeklyPriceCoefficientNodeLevel) => {
    const targetIndex = activeLevels.indexOf(targetLevel);
    if (targetIndex < 0) return;
    const next = new Set<string>();
    for (const [index, level] of activeLevels.entries()) {
      if (index >= targetIndex) break;
      for (const id of nodesByLevel[level]) {
        next.add(id);
      }
    }
    setExpandedIds(next);
  };

  const collapseToLevel = (targetLevel: WeeklyPriceCoefficientNodeLevel) => {
    const targetIndex = activeLevels.indexOf(targetLevel);
    if (targetIndex < 0) return;
    const next = new Set<string>();
    const keepBeforeIndex = Math.max(targetIndex - 1, 0);
    for (const [index, level] of activeLevels.entries()) {
      if (index >= keepBeforeIndex) break;
      for (const id of nodesByLevel[level]) {
        next.add(id);
      }
    }
    setExpandedIds(next);
  };

  const headerLabels: Record<WeeklyPriceCoefficientNodeLevel, { label: string; widthClass: string }> = {
    organization: { label: isZh ? "组织" : "Organization", widthClass: "w-44" },
    province: { label: isZh ? "省" : "Province", widthClass: "w-40" },
    city: { label: isZh ? "市" : "City", widthClass: "w-36" },
    district: { label: isZh ? "区" : "District", widthClass: "w-48" },
    size: { label: isZh ? "\u5c3a\u7801" : "Size", widthClass: "w-28" },
    sku: { label: "SKU", widthClass: "w-[18rem]" },
  };

  return (
    <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
      <table className="w-full min-w-[1700px] text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-normal text-slate-500">
          <tr>
            {board.dimensions.map((level) => {
              const item = headerLabels[level];
              return (
                <th
                  key={level}
                  rowSpan={2}
                  className={`${item.widthClass} px-3 py-3 text-left font-semibold text-slate-500`}
                >
                  <div className="flex items-center gap-1.5">
                    <span>{item.label}</span>
                    <button
                      type="button"
                      onClick={() => expandToLevel(level)}
                      className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-200 bg-white text-[12px] font-semibold normal-case text-slate-500 hover:border-slate-300 hover:text-slate-900"
                      aria-label={isZh ? `展开到${item.label}` : `Expand to ${item.label}`}
                      title={isZh ? `展开到${item.label}` : `Expand to ${item.label}`}
                    >
                      +
                    </button>
                    <button
                      type="button"
                      onClick={() => collapseToLevel(level)}
                      className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-200 bg-white text-[12px] font-semibold normal-case text-slate-500 hover:border-slate-300 hover:text-slate-900"
                      aria-label={isZh ? `收起到${item.label}` : `Collapse to ${item.label}`}
                      title={isZh ? `收起到${item.label}` : `Collapse to ${item.label}`}
                    >
                      -
                    </button>
                  </div>
                </th>
              );
            })}
            <th colSpan={board.weeks.length} className="px-3 py-3 text-left font-semibold text-slate-500">
              <div className="flex justify-start text-left">{ownLabel}</div>
            </th>
            {board.competitorSeries.map((series) => (
              <th key={`series-${series.key}`} colSpan={board.weeks.length} className="px-3 py-3 text-left font-semibold text-slate-500">
                <div className="flex justify-start text-left">
                  {series.label}
                  {series.isBenchmark ? (isZh ? "（标杆）" : " (Benchmark)") : ""}
                </div>
              </th>
            ))}
          </tr>
          <tr className="border-t border-slate-200">
            {board.weeks.map((week) => (
              <th key={`own-${week.key}`} className={`${WEEK_COLUMN_CLASS} px-3 py-2 text-left font-medium text-slate-500`}>
                {/* PRICE/PCS {week.label} */}
                {week.label}
              </th>
            ))}
            {board.competitorSeries.flatMap((series) => board.weeks.map((week) => (
              <th key={`benchmark-${series.key}-${week.key}`} className={`${WEEK_COLUMN_CLASS} px-3 py-2 text-left font-medium text-slate-500`}>
                {week.label}
              </th>
            )))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {board.rows.flatMap((node) => renderNodeRows(node, expandedIds, toggle, activeLevels))}
        </tbody>
      </table>
      {board.rows.length === 0 ? (
        <div className="border-t border-slate-200 px-4 py-6 text-center text-sm text-slate-500">
          {isZh ? "当前没有可展示的价格数据。" : "No price data to display."}
        </div>
      ) : null}
    </div>
  );
}

function renderNodeRows(
  node: WeeklyPriceCoefficientNode,
  expandedIds: Set<string>,
  toggle: (id: string) => void,
  activeLevels: WeeklyPriceCoefficientNodeLevel[],
): ReactElement[] {
  const isExpanded = expandedIds.has(node.id);
  const hierarchyCells = activeLevels.map((level) => (
    <HierarchyCell
      key={`${node.id}-${level}`}
      label={nodeLabelForLevel(node, level)}
      show={node.level === level}
      expandable={node.children.length > 0 && node.level === level}
      expanded={isExpanded}
      onToggle={() => toggle(node.id)}
    />
  ));
  const rows = [
    <tr key={node.id} className="bg-white text-slate-900 hover:bg-slate-50/70">
      {hierarchyCells}
      {node.cells.map((cell) => (
        <CombinedMetricCell
          key={`own-${node.id}-${cell.week}`}
          href={cell.ownHref}
          price={cell.ownAvgPrice}
          coefficient={cell.ownCoefficient}
          sampleCount={cell.ownSampleCount}
        />
      ))}
      {renderCompetitorCells(node)}
    </tr>,
  ];

  if (isExpanded) {
    for (const child of node.children) {
      rows.push(...renderNodeRows(child, expandedIds, toggle, activeLevels));
    }
  }

  return rows;
}

function nodeLabelForLevel(node: WeeklyPriceCoefficientNode, level: WeeklyPriceCoefficientNodeLevel) {
  switch (level) {
    case "organization":
      return node.organization;
    case "province":
      return node.province;
    case "city":
      return node.cityName;
    case "district":
      return node.district;
    case "size":
      return node.size;
    case "sku":
      return node.skuCode ? `${node.skuCode} ${node.skuName ?? ""}`.trim() : null;
  }
}

function renderCompetitorCells(node: WeeklyPriceCoefficientNode) {
  const seriesKeys = Array.from(new Set(node.cells.flatMap((cell) => cell.competitorCells.map((competitorCell) => competitorCell.seriesKey))));
  return seriesKeys.flatMap((seriesKey) => node.cells.map((cell) => {
    const competitorCell = cell.competitorCells.find((item) => item.seriesKey === seriesKey);
    return (
      <CombinedMetricCell
        key={`benchmark-${node.id}-${seriesKey}-${cell.week}`}
        href={competitorCell?.benchmarkHref ?? "#"}
        price={competitorCell?.benchmarkAvgPrice ?? null}
        coefficient={competitorCell?.coefficient ?? null}
        sampleCount={competitorCell?.benchmarkSampleCount ?? 0}
      />
    );
  }));
}

function HierarchyCell({
  label,
  show,
  expandable,
  expanded,
  onToggle,
}: {
  label: string | null;
  show: boolean;
  expandable: boolean;
  expanded: boolean;
  onToggle?: () => void;
}) {
  if (!show) {
    return <td className="px-3 py-3 text-left text-slate-300">-</td>;
  }

  return (
    <td className="px-3 py-3 text-left">
      <div className="flex items-start gap-2">
        {expandable ? (
          <button
            type="button"
            onClick={onToggle}
            className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded border border-slate-200 bg-white text-xs font-medium text-slate-500 hover:border-slate-300 hover:text-slate-900"
            aria-label={expanded ? "Collapse row" : "Expand row"}
          >
            {expanded ? "-" : "+"}
          </button>
        ) : (
          <span className="mt-0.5 inline-block h-5 w-5 shrink-0 text-center text-slate-300">.</span>
        )}
        <span className="font-medium text-slate-900">{label}</span>
      </div>
    </td>
  );
}

function CombinedMetricCell({
  href,
  price,
  coefficient,
  sampleCount,
}: {
  href: string;
  price: number | null;
  coefficient: number | null;
  sampleCount: number;
}) {
  return (
    <td className={`${WEEK_COLUMN_CLASS} px-3 py-3 text-left tabular-nums text-slate-700`} title={`samples: ${sampleCount}`}>
      {price === null ? "-" : (
        <Link href={href} className="inline-flex flex-col items-start gap-0.5 font-medium text-slate-900 hover:text-slate-700 hover:underline">
          <span>{formatTablePrice(price)}</span>
          {coefficient === null ? null : (
            <span className="text-slate-700">({formatCoefficient(coefficient)})</span>
          )}
        </Link>
      )}
    </td>
  );
}

function collectNodesByLevel(rows: WeeklyPriceCoefficientNode[]) {
  const result: Record<WeeklyPriceCoefficientNodeLevel, string[]> = {
    organization: [],
    province: [],
    city: [],
    district: [],
    size: [],
    sku: [],
  };

  const walk = (node: WeeklyPriceCoefficientNode) => {
    if (node.children.length > 0) {
      result[node.level].push(node.id);
    }
    for (const child of node.children) {
      walk(child);
    }
  };

  for (const row of rows) {
    walk(row);
  }

  return result;
}

function formatCoefficient(value: number | null) {
  if (value === null) return "-";
  return value.toFixed(2).replace(/\.?0+$/, "");
}

function formatTablePrice(value: number | null) {
  return formatPricePerPiece(value).replace(/\/pc$/i, "");
}

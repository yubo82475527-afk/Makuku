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

const LEVELS: WeeklyPriceCoefficientNodeLevel[] = ["organization", "province", "city", "district", "sku"];
const WEEK_COLUMN_CLASS = "w-28 min-w-28";

export function PriceIndexTreeTable({
  board,
  isZh,
}: {
  board: WeeklyPriceCoefficientBoard;
  isZh: boolean;
}) {
  const ownLabel = board.selectedOwnSeries ? `MAKUKU ${board.selectedOwnSeries}` : "MAKUKU";
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
    const targetIndex = LEVELS.indexOf(targetLevel);
    const next = new Set<string>();
    for (const level of LEVELS) {
      if (LEVELS.indexOf(level) >= targetIndex) break;
      for (const id of nodesByLevel[level]) {
        next.add(id);
      }
    }
    setExpandedIds(next);
  };

  const collapseToLevel = (targetLevel: WeeklyPriceCoefficientNodeLevel) => {
    const targetIndex = LEVELS.indexOf(targetLevel);
    const next = new Set<string>();
    for (const level of LEVELS) {
      if (LEVELS.indexOf(level) >= Math.max(targetIndex - 1, 0)) break;
      for (const id of nodesByLevel[level]) {
        next.add(id);
      }
    }
    setExpandedIds(next);
  };

  const headerLabels: Array<{ level: WeeklyPriceCoefficientNodeLevel; label: string; widthClass: string }> = [
    { level: "organization", label: isZh ? "组织" : "Organization", widthClass: "w-44" },
    { level: "province", label: isZh ? "省" : "Province", widthClass: "w-40" },
    { level: "city", label: isZh ? "市" : "City", widthClass: "w-36" },
    { level: "district", label: isZh ? "区" : "District", widthClass: "w-48" },
    { level: "sku", label: "SKU", widthClass: "w-[18rem]" },
  ];

  return (
    <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
      <table className="w-full min-w-[1700px] text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-normal text-slate-500">
          <tr>
            {headerLabels.map((item) => (
              <th
                key={item.level}
                rowSpan={2}
                className={`${item.widthClass} px-3 py-3 text-left font-semibold text-slate-500`}
              >
                <div className="flex items-center gap-1.5">
                  <span>{item.label}</span>
                  <button
                    type="button"
                    onClick={() => expandToLevel(item.level)}
                    className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-200 bg-white text-[12px] font-semibold normal-case text-slate-500 hover:border-slate-300 hover:text-slate-900"
                    aria-label={isZh ? `展开到${item.label}` : `Expand to ${item.label}`}
                    title={isZh ? `展开到${item.label}` : `Expand to ${item.label}`}
                  >
                    +
                  </button>
                  <button
                    type="button"
                    onClick={() => collapseToLevel(item.level)}
                    className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-200 bg-white text-[12px] font-semibold normal-case text-slate-500 hover:border-slate-300 hover:text-slate-900"
                    aria-label={isZh ? `收起到${item.label}` : `Collapse to ${item.label}`}
                    title={isZh ? `收起到${item.label}` : `Collapse to ${item.label}`}
                  >
                    -
                  </button>
                </div>
              </th>
            ))}
            <th colSpan={board.weeks.length} className="px-3 py-3 text-left font-semibold text-slate-500">
              <div className="flex justify-start text-left">{ownLabel}</div>
            </th>
            {board.competitorSeries.map((series) => (
              <th key={`series-${series.key}`} colSpan={board.weeks.length} className="px-3 py-3 text-left font-semibold text-slate-500">
                <div className="flex justify-start text-left">{series.label}</div>
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
          {board.rows.flatMap((node) => renderNodeRows(node, expandedIds, toggle))}
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
): ReactElement[] {
  const isExpanded = expandedIds.has(node.id);
  const rows = [
    <tr key={node.id} className="bg-white text-slate-900 hover:bg-slate-50/70">
      <HierarchyCell
        label={node.organization}
        show={node.level === "organization"}
        expandable={node.children.length > 0}
        expanded={isExpanded}
        onToggle={() => toggle(node.id)}
      />
      <HierarchyCell
        label={node.province}
        show={node.level === "province"}
        expandable={node.children.length > 0 && node.level === "province"}
        expanded={isExpanded}
        onToggle={() => toggle(node.id)}
      />
      <HierarchyCell
        label={node.cityName}
        show={node.level === "city"}
        expandable={node.children.length > 0 && node.level === "city"}
        expanded={isExpanded}
        onToggle={() => toggle(node.id)}
      />
      <HierarchyCell
        label={node.district}
        show={node.level === "district"}
        expandable={node.children.length > 0 && node.level === "district"}
        expanded={isExpanded}
        onToggle={() => toggle(node.id)}
      />
      <HierarchyCell
        label={node.skuCode ? `${node.skuCode} ${node.skuName ?? ""}`.trim() : null}
        show={node.level === "sku"}
        expandable={false}
        expanded={false}
      />
      {node.cells.map((cell) => (
        <PriceCell
          key={`own-${node.id}-${cell.week}`}
          href={cell.ownHref}
          value={cell.ownAvgPrice}
          sampleCount={cell.ownSampleCount}
        />
      ))}
      {node.cells.flatMap((cell) => cell.competitorCells.map((competitorCell) => (
        <CombinedMetricCell
          key={`benchmark-${node.id}-${cell.week}-${competitorCell.seriesKey}`}
          href={competitorCell.benchmarkHref}
          price={competitorCell.benchmarkAvgPrice}
          coefficient={competitorCell.coefficient}
          sampleCount={competitorCell.benchmarkSampleCount}
        />
      )))}
    </tr>,
  ];

  if (isExpanded) {
    for (const child of node.children) {
      rows.push(...renderNodeRows(child, expandedIds, toggle));
    }
  }

  return rows;
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

function PriceCell({
  href,
  value,
  sampleCount,
}: {
  href: string;
  value: number | null;
  sampleCount: number;
}) {
  return (
    <td className={`${WEEK_COLUMN_CLASS} px-3 py-3 text-left tabular-nums text-slate-700`} title={`samples: ${sampleCount}`}>
      {value === null ? "-" : (
        <Link href={href} className="font-medium text-slate-900 hover:text-slate-700 hover:underline">
          {formatTablePrice(value)}
        </Link>
      )}
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
        <Link href={href} className="font-medium text-slate-900 hover:text-slate-700 hover:underline">
          {formatTablePrice(price)}
          {coefficient === null ? "" : ` (${formatCoefficient(coefficient)})`}
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

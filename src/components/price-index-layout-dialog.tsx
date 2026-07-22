"use client";

import { clsx } from "clsx";
import { ArrowDown, ArrowUp, Columns3, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui";
import {
  PRICE_INDEX_DIMENSIONS,
  normalizePriceIndexDimensions,
  type PriceIndexDimension,
} from "@/lib/price-index-dimensions";

const zh = {
  configureColumns: "\u914d\u7f6e\u5217",
  title: "\u914d\u7f6e\u4ef7\u683c\u6307\u6570\u5217",
  close: "\u5173\u95ed",
  cancel: "\u53d6\u6d88",
  save: "\u4fdd\u5b58",
  moveUp: "\u4e0a\u79fb",
  moveDown: "\u4e0b\u79fb",
};

export function PriceIndexLayoutDialog({
  className,
  dimensions,
  isZh,
  onSave,
}: {
  className?: string;
  dimensions: PriceIndexDimension[];
  isZh: boolean;
  onSave: (dimensions: PriceIndexDimension[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draftDimensions, setDraftDimensions] = useState<PriceIndexDimension[]>(() => [...dimensions]);

  function openDialog() {
    setDraftDimensions([...dimensions]);
    setOpen(true);
  }

  function save() {
    onSave(normalizePriceIndexDimensions(draftDimensions));
    setOpen(false);
  }

  function toggleDimension(dimension: PriceIndexDimension) {
    if (dimension === "organization") return;
    setDraftDimensions((current) =>
      current.includes(dimension)
        ? current.filter((item) => item !== dimension)
        : [...current, dimension],
    );
  }

  function moveDimension(dimension: PriceIndexDimension, direction: -1 | 1) {
    setDraftDimensions((current) => {
      const index = current.indexOf(dimension);
      const target = index + direction;
      if (index <= 0 || target <= 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        className={clsx(
          "inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50",
          className,
        )}
      >
        <Columns3 className="h-4 w-4" />
        {isZh ? zh.configureColumns : "Configure columns"}
      </button>
      {open ? (
        <DialogShell
          title={isZh ? zh.title : "Configure price index columns"}
          closeLabel={isZh ? zh.close : "Close"}
          onClose={() => setOpen(false)}
        >
          <div className="space-y-2">
            {PRICE_INDEX_DIMENSIONS.map((dimension) => {
              const selected = draftDimensions.includes(dimension);
              const index = draftDimensions.indexOf(dimension);
              return (
                <div key={dimension} className="flex min-h-10 items-center gap-2 rounded-md border border-slate-200 px-3 py-2">
                  <input
                    type="checkbox"
                    checked={selected}
                    disabled={dimension === "organization"}
                    onChange={() => toggleDimension(dimension)}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                  <span className="min-w-0 flex-1 text-sm font-medium text-slate-700">{labelForDimension(dimension, isZh)}</span>
                  {selected && dimension !== "organization" ? (
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => moveDimension(dimension, -1)}
                        disabled={index <= 1}
                        className="inline-flex h-7 w-7 items-center justify-center rounded border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                        aria-label={isZh ? zh.moveUp : "Move up"}
                        title={isZh ? zh.moveUp : "Move up"}
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveDimension(dimension, 1)}
                        disabled={index === draftDimensions.length - 1}
                        className="inline-flex h-7 w-7 items-center justify-center rounded border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                        aria-label={isZh ? zh.moveDown : "Move down"}
                        title={isZh ? zh.moveDown : "Move down"}
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              {isZh ? zh.cancel : "Cancel"}
            </button>
            <Button type="button" onClick={save}>{isZh ? zh.save : "Save"}</Button>
          </div>
        </DialogShell>
      ) : null}
    </>
  );
}

function labelForDimension(dimension: PriceIndexDimension, isZh: boolean) {
  const zhLabels: Record<PriceIndexDimension, string> = {
    organization: "\u7ec4\u7ec7",
    province: "\u7701",
    city: "\u5e02",
    district: "\u533a",
    size: "\u5c3a\u7801",
    sku: "SKU",
  };
  const enLabels: Record<PriceIndexDimension, string> = {
    organization: "Organization",
    province: "Province",
    city: "City",
    district: "District",
    size: "Size",
    sku: "SKU",
  };
  return (isZh ? zhLabels : enLabels)[dimension];
}

function DialogShell({
  title,
  closeLabel,
  onClose,
  children,
}: {
  title: string;
  closeLabel: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4 py-6"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-4 shadow-xl">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-slate-950">{title}</h2>
          <button
            type="button"
            aria-label={closeLabel}
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

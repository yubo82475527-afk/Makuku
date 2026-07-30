"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, TextInput } from "@/components/ui";
import { formatIdr, formatJakartaTime } from "@/lib/format";
import type { Dictionary } from "@/lib/i18n/get-dictionary";
import { materialMasterColumns } from "@/lib/material-master";
import type { MaterialMaster } from "@/lib/types";

function matchesSearch(sku: MaterialMaster, query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;

  return [
    sku.tenant_sku_code,
    sku.tenant_sku_name,
    sku.category,
    sku.sub_category,
    sku.brand,
    sku.sub_brand,
    sku.material_group1,
    sku.material_group2,
    sku.type,
    sku.sub_type,
  ].some((value) => String(value ?? "").toLowerCase().includes(normalized));
}

export function MaterialMasterTable({
  dict,
  rows,
  locale,
}: {
  dict: Dictionary;
  rows: MaterialMaster[];
  locale: string;
}) {
  const [query, setQuery] = useState("");
  const filteredRows = useMemo(
    () => rows.filter((sku) => matchesSearch(sku, query)),
    [rows, query],
  );

  useEffect(() => {
    function handleImported(event: Event) {
      const detail = (event as CustomEvent<{ query?: unknown }>).detail;
      if (typeof detail?.query === "string") setQuery(detail.query);
    }

    window.addEventListener("material-master-imported", handleImported);
    return () => window.removeEventListener("material-master-imported", handleImported);
  }, []);

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">{dict.skuMaster.listTitle}</h2>
          <p className="mt-1 text-sm text-slate-500">
            {dict.skuMaster.totalCount.replace("{count}", String(rows.length))}
          </p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:flex-nowrap">
          <TextInput
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={dict.skuMaster.searchPlaceholder}
            aria-label={dict.skuMaster.searchPlaceholder}
            className="w-full sm:w-80"
          />
          <a
            href={`/api/material-master/export?locale=${locale}`}
            className="inline-flex h-10 items-center justify-center whitespace-nowrap rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            {locale === "zh" ? "导出 SKU 主数据" : "Export SKU Master"}
          </a>
        </div>
      </div>

      {query.trim() ? (
        <div className="mb-3 text-sm text-slate-500">
          {dict.skuMaster.searchResultCount.replace("{count}", String(filteredRows.length))}
        </div>
      ) : null}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1280px] text-left text-sm">
          <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
            <tr>
              {materialMasterColumns.map((column) => (
                <th key={column} className="py-2 pr-3">{column}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {filteredRows.map((sku) => (
              <tr key={sku.tenant_sku_code}>
                <td className="py-3 pr-3 font-medium">{sku.tenant_sku_code}</td>
                <td className="py-3 pr-3">{sku.tenant_sku_name}</td>
                <td className="py-3 pr-3">{sku.category}</td>
                <td className="py-3 pr-3">{sku.sub_category}</td>
                <td className="py-3 pr-3">{sku.brand}</td>
                <td className="py-3 pr-3">{sku.sub_brand ?? "-"}</td>
                <td className="py-3 pr-3">{sku.material_group1 ?? "-"}</td>
                <td className="py-3 pr-3">{sku.material_group2 ?? "-"}</td>
                <td className="py-3 pr-3">{sku.type ?? "-"}</td>
                <td className="py-3 pr-3">{sku.sub_type ?? "-"}</td>
                <td className="py-3 pr-3">{sku.pack_count}</td>
                <td className="py-3 pr-3">{sku.box_count}</td>
                <td className="py-3 pr-3">{formatIdr(sku.pcs_price)}</td>
                <td className="py-3 pr-3">{formatJakartaTime(sku.f_expiry_date)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {rows.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">{dict.skuMaster.emptyMaterial}</p>
      ) : null}
      {rows.length > 0 && filteredRows.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">{dict.skuMaster.searchNoResults}</p>
      ) : null}
    </Card>
  );
}

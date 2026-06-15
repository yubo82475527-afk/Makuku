"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import type { MaterialMaster } from "@/lib/types";

type ProductMasterSearchSelectProps = {
  materials: MaterialMaster[];
  selectedCode: string;
  selectedLabel?: string;
  locale: string;
};

export function ProductMasterSearchSelect({ materials, selectedCode: initialSelectedCode, selectedLabel, locale }: ProductMasterSearchSelectProps) {
  const initialMaterial = materials.find((material) => material.tenant_sku_code === initialSelectedCode) ?? null;
  const [query, setQuery] = useState(initialMaterial ? formatMaterialLabel(initialMaterial) : selectedLabel ?? "");
  const [selectedCode, setSelectedCode] = useState(initialMaterial?.tenant_sku_code ?? initialSelectedCode);
  const [open, setOpen] = useState(false);
  const labels = locale === "zh"
    ? { placeholder: "搜索产品编码 / 名称 / 系列 / 尺码", empty: "未找到产品主数据" }
    : { placeholder: "Search code / name / series / size", empty: "No product master found" };

  const filteredMaterials = useMemo(() => {
    const normalized = normalize(query);
    return materials
      .filter((material) => !normalized || materialMatchesSearch(material, normalized))
      .slice(0, 8);
  }, [materials, query]);

  function chooseMaterial(material: MaterialMaster) {
    setSelectedCode(material.tenant_sku_code);
    setQuery(formatMaterialLabel(material));
    setOpen(false);
  }

  return (
    <div className="relative min-w-72 flex-1">
      <input type="hidden" name="material_sku_code" value={selectedCode} />
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input
        type="search"
        value={query}
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          setQuery(event.target.value);
          setSelectedCode("");
          setOpen(true);
        }}
        onBlur={() => window.setTimeout(() => setOpen(false), 300)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && filteredMaterials[0]) {
            event.preventDefault();
            chooseMaterial(filteredMaterials[0]);
          }
          if (event.key === "Escape") {
            setOpen(false);
          }
        }}
        placeholder={labels.placeholder}
        aria-label={labels.placeholder}
        className="h-9 w-full rounded-md border border-slate-300 bg-white pl-8 pr-3 text-sm outline-none focus:border-slate-500"
      />
      {open ? (
        <div role="listbox" className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg">
          {filteredMaterials.length > 0 ? filteredMaterials.map((material) => (
            <button
              key={material.tenant_sku_code}
              type="button"
              role="option"
              aria-selected={selectedCode === material.tenant_sku_code}
              onPointerDown={(event) => {
                event.preventDefault();
                chooseMaterial(material);
              }}
              onMouseDown={(event) => {
                event.preventDefault();
                chooseMaterial(material);
              }}
              onClick={() => chooseMaterial(material)}
              className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
            >
              <span className="block font-medium text-slate-900">{material.tenant_sku_code} · {material.tenant_sku_name}</span>
              <span className="mt-0.5 block text-xs text-slate-500">
                {[material.sub_brand, material.sub_category, material.sub_type, material.pack_count ? `${material.pack_count} pcs` : null].filter(Boolean).join(" / ")}
              </span>
            </button>
          )) : selectedCode && selectedLabel ? (
            <div className="px-3 py-2 text-sm text-slate-500">{selectedLabel}</div>
          ) : (
            <div className="px-3 py-2 text-sm text-slate-500">{labels.empty}</div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function materialMatchesSearch(material: MaterialMaster, normalized: string) {
  return [
    material.tenant_sku_code,
    material.tenant_sku_name,
    material.category,
    material.sub_category,
    material.brand,
    material.sub_brand,
    material.type,
    material.sub_type,
    material.pack_count,
  ].some((value) => String(value ?? "").toLowerCase().includes(normalized));
}

function formatMaterialLabel(material: MaterialMaster) {
  return `${material.tenant_sku_code} · ${material.tenant_sku_name}`;
}

function normalize(value: string) {
  return value.trim().toLowerCase();
}

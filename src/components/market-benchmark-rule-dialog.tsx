"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { Button, SelectInput, TextInput } from "@/components/ui";

type Option = {
  id: string;
  name: string;
};

type RegionDraft = {
  id: string;
  province: string;
  city_name: string;
  district: string;
};

type RegionPayload = {
  province: string;
  city_name: string;
  district: string | null;
};

const NO_SERIES = "__none__";

const zh = {
  newRule: "\u65b0\u589e\u89c4\u5219",
  title: "\u65b0\u589e\u533a\u57df\u7cfb\u5217\u6807\u6746\u89c4\u5219",
  description: "\u5148\u9009\u62e9\u7ade\u54c1\u54c1\u724c\uff0c\u518d\u9009\u62e9\u7cfb\u5217\uff0c\u7136\u540e\u9010\u884c\u6dfb\u52a0\u7701\u5e02\u533a\uff0c\u7cfb\u7edf\u4f1a\u6279\u91cf\u521b\u5efa\u8fd9\u4e9b\u533a\u57df\u7684\u6807\u6746\u89c4\u5219\u3002",
  close: "\u5173\u95ed",
  brand: "\u7ade\u54c1\u54c1\u724c *",
  series: "\u7cfb\u5217 *",
  regions: "\u6807\u6746\u533a\u57df",
  province: "\u7701 *",
  city: "\u5e02 *",
  district: "\u533a\uff08\u53ef\u9009\uff09",
  addRow: "\u65b0\u589e\u4e00\u884c",
  removeRow: "\u5220\u9664\u8be5\u884c",
  notes: "\u5907\u6ce8",
  cancel: "\u53d6\u6d88",
  saveBatch: "\u6279\u91cf\u4fdd\u5b58\u5e76\u751f\u6210",
  noSeries: "\u65e0\u7cfb\u5217",
};

function newRegionDraft(): RegionDraft {
  return { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, province: "", city_name: "", district: "" };
}

export function MarketBenchmarkRuleDialog({
  locale,
  isZh,
  brands,
  competitorProducts,
}: {
  locale: string;
  isZh: boolean;
  brands: Option[];
  competitorProducts: { id: string; brand_id: string; product_series: string | null; brands?: Option | null }[];
}) {
  const [open, setOpen] = useState(false);
  const [selectedBrandId, setSelectedBrandId] = useState("");
  const [selectedSeries, setSelectedSeries] = useState("");
  const [regionRows, setRegionRows] = useState<RegionDraft[]>(() => [newRegionDraft()]);

  const seriesOptions = useMemo(() => {
    return Array.from(new Set(
      competitorProducts
        .filter((product) => !selectedBrandId || product.brand_id === selectedBrandId)
        .map((product) => product.product_series?.trim() || NO_SERIES),
    )).sort((left, right) => seriesLabel(left, isZh).localeCompare(seriesLabel(right, isZh)));
  }, [competitorProducts, isZh, selectedBrandId]);

  const regionPayload = regionRows.reduce<RegionPayload[]>((payload, row) => {
    const province = row.province.trim();
    const cityName = row.city_name.trim();
    const district = row.district.trim();
    if (province && cityName) {
      payload.push({ province, city_name: cityName, district: district || null });
    }
    return payload;
  }, []);

  function updateRegionRow(id: string, field: keyof Omit<RegionDraft, "id">, value: string) {
    setRegionRows((current) => current.map((row) => row.id === id ? { ...row, [field]: value } : row));
  }

  function resetFormState() {
    setSelectedBrandId("");
    setSelectedSeries("");
    setRegionRows([newRegionDraft()]);
  }

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        <Plus size={16} aria-hidden="true" />
        {isZh ? zh.newRule : "New Rule"}
      </Button>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4 py-6">
          <div className="w-full max-w-4xl rounded-lg bg-white p-4 shadow-xl">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold">{isZh ? zh.title : "New Regional Series Benchmark Rule"}</h2>
                <p className="mt-1 text-sm text-slate-500">
                  {isZh ? zh.description : "Select brand and series, then add region rows to create rules in batch."}
                </p>
              </div>
              <button
                type="button"
                aria-label={isZh ? zh.close : "Close"}
                onClick={() => {
                  setOpen(false);
                  resetFormState();
                }}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>

            <form action="/api/market-benchmarks" method="post" className="grid gap-3 md:grid-cols-2">
              <input type="hidden" name="return_to" value={`/${locale}/market-benchmarks`} />
              <input type="hidden" name="regions" value={JSON.stringify(regionPayload)} />

              <SelectInput
                name="brand_id"
                required
                value={selectedBrandId}
                onChange={(event) => {
                  setSelectedBrandId(event.target.value);
                  setSelectedSeries("");
                }}
              >
                <option value="">{isZh ? zh.brand : "Competitor brand *"}</option>
                {brands.map((brand) => (
                  <option key={brand.id} value={brand.id}>{brand.name}</option>
                ))}
              </SelectInput>

              <SelectInput
                name="product_series"
                required
                value={selectedSeries}
                onChange={(event) => setSelectedSeries(event.target.value)}
              >
                <option value="">{isZh ? zh.series : "Series *"}</option>
                {seriesOptions.map((series) => (
                  <option key={series} value={series}>{seriesLabel(series, isZh)}</option>
                ))}
              </SelectInput>

              <div className="md:col-span-2">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div className="text-sm font-medium text-slate-700">{isZh ? zh.regions : "Benchmark Regions"}</div>
                  <button
                    type="button"
                    onClick={() => setRegionRows((current) => [...current, newRegionDraft()])}
                    className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-300 bg-white px-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    <Plus size={14} aria-hidden="true" />
                    {isZh ? zh.addRow : "Add Row"}
                  </button>
                </div>
                <div className="space-y-2 rounded-md border border-slate-200 p-3">
                  {regionRows.map((row) => (
                    <div key={row.id} className="grid gap-2 md:grid-cols-[1fr_1fr_1fr_auto]">
                      <TextInput
                        value={row.province}
                        onChange={(event) => updateRegionRow(row.id, "province", event.target.value)}
                        placeholder={isZh ? zh.province : "Province *"}
                      />
                      <TextInput
                        value={row.city_name}
                        onChange={(event) => updateRegionRow(row.id, "city_name", event.target.value)}
                        placeholder={isZh ? zh.city : "City *"}
                      />
                      <TextInput
                        value={row.district}
                        onChange={(event) => updateRegionRow(row.id, "district", event.target.value)}
                        placeholder={isZh ? zh.district : "District (optional)"}
                      />
                      <button
                        type="button"
                        aria-label={isZh ? zh.removeRow : "Remove row"}
                        onClick={() => setRegionRows((current) => current.length > 1 ? current.filter((item) => item.id !== row.id) : [newRegionDraft()])}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
                      >
                        <Trash2 size={16} aria-hidden="true" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <TextInput name="notes" placeholder={isZh ? zh.notes : "Notes"} className="md:col-span-2" />

              <div className="flex justify-end gap-2 md:col-span-2">
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    resetFormState();
                  }}
                  className="inline-flex h-9 items-center justify-center rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  {isZh ? zh.cancel : "Cancel"}
                </button>
                <Button type="submit" disabled={selectedBrandId === "" || selectedSeries === "" || regionPayload.length === 0}>
                  {isZh ? zh.saveBatch : "Save Batch"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}

function seriesLabel(value: string, isZh: boolean) {
  return value === NO_SERIES ? (isZh ? zh.noSeries : "No series") : value;
}

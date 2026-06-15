"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Button, SelectInput, TextInput } from "@/components/ui";

type Option = {
  id: string;
  name: string;
};

export function MarketBenchmarkRuleDialog({
  locale,
  isZh,
  brands,
  seriesOptions,
}: {
  locale: string;
  isZh: boolean;
  brands: Option[];
  seriesOptions: string[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        <Plus size={16} aria-hidden="true" />
        {isZh ? "新增规则" : "New Rule"}
      </Button>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4 py-6">
          <div className="w-full max-w-3xl rounded-lg bg-white p-4 shadow-xl">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold">{isZh ? "新增区域系列标杆规则" : "New Regional Series Benchmark Rule"}</h2>
                <p className="mt-1 text-sm text-slate-500">
                  {isZh ? "省、市必填；区可选。保存后系统生成当前周期标杆价。" : "Province and city are required; district is optional. Saving calculates the current period benchmark price."}
                </p>
              </div>
              <button
                type="button"
                aria-label={isZh ? "关闭" : "Close"}
                onClick={() => setOpen(false)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>

            <form action="/api/market-benchmarks" method="post" className="grid gap-3 md:grid-cols-2">
              <input type="hidden" name="return_to" value={`/${locale}/market-benchmarks`} />
              <TextInput name="province" placeholder={isZh ? "省 *" : "Province *"} required />
              <TextInput name="city_name" placeholder={isZh ? "市 *" : "City *"} required />
              <TextInput name="district" placeholder={isZh ? "区（可选）" : "District (optional)"} />
              <SelectInput name="brand_id" required>
                <option value="">{isZh ? "竞品品牌 *" : "Competitor brand *"}</option>
                {brands.map((brand) => (
                  <option key={brand.id} value={brand.id}>{brand.name}</option>
                ))}
              </SelectInput>
              <SelectInput name="product_series" defaultValue="">
                <option value="">{isZh ? "无系列 / 全品牌" : "No series / brand only"}</option>
                {seriesOptions.map((series) => (
                  <option key={series} value={series}>{series}</option>
                ))}
              </SelectInput>
              <TextInput name="notes" placeholder={isZh ? "备注" : "Notes"} className="md:col-span-2" />
              <div className="flex justify-end gap-2 md:col-span-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="inline-flex h-9 items-center justify-center rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  {isZh ? "取消" : "Cancel"}
                </button>
                <Button type="submit">{isZh ? "保存并生成本期标杆价" : "Save and Calculate"}</Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}

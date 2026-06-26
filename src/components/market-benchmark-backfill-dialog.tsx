"use client";

import { useState } from "react";
import { CalendarClock, X } from "lucide-react";
import { Button, SelectInput, TextInput } from "@/components/ui";

type RuleOption = {
  id: string;
  label: string;
};

export function MarketBenchmarkBackfillDialog({
  locale,
  isZh,
  rules,
}: {
  locale: string;
  isZh: boolean;
  rules: RuleOption[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)} className="min-w-[150px] bg-slate-900 text-white hover:bg-slate-800">
        <CalendarClock size={16} aria-hidden="true" />
        {isZh ? "补算周期价" : "Backfill Prices"}
      </Button>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4 py-6">
          <div className="w-full max-w-2xl rounded-lg bg-white p-4 shadow-xl">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold">{isZh ? "补算历史周期价" : "Backfill Historical Period Prices"}</h2>
                <p className="mt-1 text-sm text-slate-500">
                  {isZh
                    ? "按真实市场价格补算历史周期价。默认只补缺失值，不覆盖已存在周期价。"
                    : "Backfill historical prices from real market prices. Existing period prices are skipped by default."}
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
              <input type="hidden" name="intent" value="backfill_period_prices" />
              <input type="hidden" name="return_to" value={`/${locale}/market-benchmarks`} />
              <SelectInput name="period_type" defaultValue="week">
                <option value="week">{isZh ? "月内周段" : "Monthly week"}</option>
                <option value="month">{isZh ? "整月" : "Month"}</option>
              </SelectInput>
              <SelectInput name="scope" defaultValue="all">
                <option value="all">{isZh ? "全部规则" : "All rules"}</option>
                <option value="current">{isZh ? "指定规则" : "Selected rule"}</option>
              </SelectInput>
              <TextInput name="start_date" type="date" required />
              <TextInput name="end_date" type="date" required />
              <SelectInput name="rule_id" defaultValue="" className="md:col-span-2">
                <option value="">{isZh ? "选择规则，仅指定规则时需要" : "Select rule (only for selected scope)"}</option>
                {rules.map((rule) => (
                  <option key={rule.id} value={rule.id}>{rule.label}</option>
                ))}
              </SelectInput>
              <label className="flex items-center gap-2 text-sm text-slate-700 md:col-span-2">
                <input type="checkbox" name="overwrite" className="h-4 w-4 rounded border-slate-300" />
                {isZh ? "覆盖已存在周期价" : "Overwrite existing period prices"}
              </label>
              <div className="flex justify-end gap-2 md:col-span-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="inline-flex h-9 items-center justify-center rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  {isZh ? "取消" : "Cancel"}
                </button>
                <Button type="submit">{isZh ? "开始补算" : "Backfill"}</Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}

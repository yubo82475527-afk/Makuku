"use client";

import { Download, Plus, X } from "lucide-react";
import { useState } from "react";
import { Button, SelectInput, TextInput } from "@/components/ui";
import type { CompetitorProduct } from "@/lib/types";

export function PriceSnapshotActions({
  products,
  locale,
  returnTo,
  exportHref,
}: {
  products: CompetitorProduct[];
  locale: string;
  returnTo: string;
  exportHref: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <a
          href={exportHref}
          className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          <Download className="h-4 w-4" />
          导出 CSV
        </a>
        <Button type="button" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" />
          新增价格快照
        </Button>
      </div>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
          <div className="w-full max-w-3xl rounded-lg bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <h2 className="text-base font-semibold text-slate-900">新增价格快照</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form action="/api/price-snapshots" method="post" className="grid gap-3 p-5 md:grid-cols-2">
              <input type="hidden" name="return_to" value={returnTo} />
              <SelectInput name="competitor_product_id" required className="md:col-span-2">
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.brands?.name} / {product.normalized_name}
                  </option>
                ))}
              </SelectInput>
              <SelectInput name="channel" defaultValue="offline">
                <option value="offline">{locale === "zh" ? "线下" : "Offline"}</option>
                <option value="shopee">Shopee</option>
                <option value="tiktok">TikTok</option>
                <option value="manual">{locale === "zh" ? "手工" : "Manual"}</option>
              </SelectInput>
              <TextInput name="list_price_idr" type="number" min="0" placeholder="标价 IDR" required />
              <TextInput name="promo_price_idr" type="number" min="0" placeholder="促销价 IDR" required />
              <TextInput name="voucher_value_idr" type="number" min="0" placeholder="优惠券" />
              <TextInput name="shipping_subsidy_idr" type="number" min="0" placeholder="运费补贴" />
              <TextInput name="promo_type" placeholder="促销类型" />
              <TextInput name="evidence_url" placeholder="凭证链接" className="md:col-span-2" />
              <div className="flex justify-end gap-2 md:col-span-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="inline-flex h-9 items-center justify-center rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  取消
                </button>
                <Button type="submit">保存快照</Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}

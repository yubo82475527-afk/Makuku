"use client";

import { useState } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui";

type Preview = {
  file_month: string;
  total_rows: number;
  store_count: number;
  product_spec_count: number;
  snapshot_count: number;
  skipped_no_price_rows: number;
  error_count: number;
  rows: Array<{
    row_number: number;
    area: string;
    city: string;
    store_name: string;
    store_type: string;
    brand: string;
    package_type: string;
    product_name: string;
    size: string;
    piece_count: number | null;
    errors: string[];
  }>;
  errors: Array<{ row_number: number; errors: string[] }>;
};

type ImportResult = {
  stores: number;
  competitor_products: number;
  makuku_skus: number;
  inserted_snapshots: number;
  updated_snapshots: number;
  skipped_snapshots: number;
  row_errors: Array<{ row_number: number; errors: string[] }>;
};

export function ExcelPriceImportWorkbench({ locale }: { locale: string }) {
  const copy = getCopy(locale);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [loading, setLoading] = useState<"preview" | "import" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(intent: "preview" | "import") {
    if (!file) {
      setError(copy.missingFile);
      return;
    }
    setLoading(intent);
    setError(null);
    setResult(null);
    try {
      const formData = new FormData();
      formData.set("intent", intent);
      formData.set("file", file);
      const response = await fetch("/api/internal/excel-price-import", {
        method: "POST",
        body: formData,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? copy.failed);
      setPreview(payload.preview);
      if (payload.result) setResult(payload.result);
    } catch (err) {
      setError(err instanceof Error ? err.message : copy.failed);
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex min-h-24 flex-1 cursor-pointer items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 text-sm text-slate-600 hover:bg-slate-100">
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              className="sr-only"
              onChange={(event) => {
                setFile(event.target.files?.[0] ?? null);
                setPreview(null);
                setResult(null);
                setError(null);
              }}
            />
            <span className="inline-flex items-center gap-2">
              <Upload className="h-4 w-4" />
              {file ? file.name : copy.chooseFile}
            </span>
          </label>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => submit("preview")} disabled={!file || loading !== null}>
              {loading === "preview" ? copy.previewing : copy.preview}
            </Button>
            <Button type="button" onClick={() => submit("import")} disabled={!preview || !file || loading !== null || preview.error_count > 0}>
              {loading === "import" ? copy.importing : copy.import}
            </Button>
          </div>
        </div>
        {error ? <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      </section>

      {preview ? (
        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="grid gap-3 md:grid-cols-6">
            <Metric label={copy.totalRows} value={preview.total_rows} />
            <Metric label={copy.stores} value={preview.store_count} />
            <Metric label={copy.products} value={preview.product_spec_count} />
            <Metric label={copy.snapshots} value={preview.snapshot_count} />
            <Metric label={copy.skippedNoPrice} value={preview.skipped_no_price_rows} />
            <Metric label={copy.errors} value={preview.error_count} />
          </div>
          {preview.error_count > 0 ? (
            <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <div className="font-medium">{copy.fixErrors}</div>
              <ul className="mt-2 space-y-1">
                {preview.errors.slice(0, 10).map((item) => (
                  <li key={item.row_number}>Row {item.row_number}: {item.errors.join(", ")}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}

      {result ? (
        <section className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          {copy.imported(result)}
          {result.row_errors.length > 0 ? (
            <ul className="mt-2 space-y-1">
              {result.row_errors.map((item) => <li key={item.row_number}>Row {item.row_number}: {item.errors.join(", ")}</li>)}
            </ul>
          ) : null}
        </section>
      ) : null}

      {preview ? (
        <section className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
          <table className="min-w-[1120px] w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="px-3 py-2">Row</th>
                <th className="px-3 py-2">{copy.store}</th>
                <th className="px-3 py-2">{copy.type}</th>
                <th className="px-3 py-2">{copy.brand}</th>
                <th className="px-3 py-2">{copy.packageType}</th>
                <th className="px-3 py-2">{copy.product}</th>
                <th className="px-3 py-2">{copy.size}</th>
                <th className="px-3 py-2">{copy.pcs}</th>
                <th className="px-3 py-2">{copy.errorColumn}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {preview.rows.slice(0, 30).map((row) => (
                <tr key={row.row_number}>
                  <td className="px-3 py-2">{row.row_number}</td>
                  <td className="px-3 py-2">{row.store_name}</td>
                  <td className="px-3 py-2">{row.store_type}</td>
                  <td className="px-3 py-2">{row.brand}</td>
                  <td className="px-3 py-2">{row.package_type}</td>
                  <td className="px-3 py-2">{row.product_name}</td>
                  <td className="px-3 py-2">{row.size}</td>
                  <td className="px-3 py-2">{row.piece_count ?? "-"}</td>
                  <td className="px-3 py-2 text-amber-700">{row.errors.join(", ") || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 text-xl font-semibold text-slate-950">{value}</div>
    </div>
  );
}

function getCopy(locale: string) {
  const isZh = locale === "zh";
  return {
    chooseFile: isZh ? "选择 5 月线下价格 Excel" : "Choose offline price Excel",
    missingFile: isZh ? "请先选择 Excel 文件" : "Choose a file first",
    failed: isZh ? "Excel 处理失败" : "Excel processing failed",
    preview: isZh ? "预览" : "Preview",
    previewing: isZh ? "预览中..." : "Previewing...",
    import: isZh ? "确认导入" : "Import",
    importing: isZh ? "导入中..." : "Importing...",
    totalRows: isZh ? "总行数" : "Rows",
    stores: isZh ? "门店数" : "Stores",
    products: isZh ? "商品规格数" : "Product specs",
    snapshots: isZh ? "可生成快照" : "Snapshots",
    skippedNoPrice: isZh ? "无价格跳过" : "No-price rows",
    errors: isZh ? "异常行" : "Errors",
    fixErrors: isZh ? "存在异常行，修正后才能导入。" : "Fix error rows before importing.",
    store: isZh ? "门店" : "Store",
    type: isZh ? "门店类型" : "Store type",
    brand: isZh ? "品牌" : "Brand",
    packageType: isZh ? "包装类型" : "Package type",
    product: isZh ? "商品" : "Product",
    size: isZh ? "尺码" : "Size",
    pcs: isZh ? "片数" : "Pcs",
    errorColumn: isZh ? "异常" : "Error",
    imported: (result: ImportResult) => isZh
      ? `导入完成：写入 ${result.inserted_snapshots} 条价格快照，更新 ${result.updated_snapshots} 条，跳过 ${result.skipped_snapshots} 条异常快照，涉及 ${result.stores} 个门店、${result.competitor_products} 个竞品商品。`
      : `Import complete: inserted ${result.inserted_snapshots} snapshots, updated ${result.updated_snapshots}, skipped ${result.skipped_snapshots}, covering ${result.stores} stores and ${result.competitor_products} competitor products.`,
  };
}

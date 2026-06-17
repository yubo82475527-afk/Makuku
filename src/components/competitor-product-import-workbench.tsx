"use client";

import { Download, Upload } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui";

type Preview = {
  total_rows: number;
  product_count: number;
  brand_count: number;
  rows: Array<{
    row_number: number;
    competitor_sku_code: string | null;
    brand: string;
    product_series: string | null;
    product_name: string;
    package_type: string;
    size: string;
    piece_count: number;
    target_material_sku_code: string | null;
    errors: string[];
  }>;
  errors: Array<{ row_number: number; errors: string[] }>;
};

type ImportResult = {
  brands: number;
  competitor_products: number;
  mapped_count: number;
  skipped_manual_mappings: number;
  row_errors: Array<{ row_number: number; errors: string[] }>;
};

const templateColumns = [
  "competitor_sku_code",
  "brand",
  "product_series",
  "product_name",
  "package_type",
  "size",
  "piece_count",
  "target_material_sku_code",
];

const templateExample = [
  "",
  "SWEETY",
  "BRONZE",
  "SWEETY BRONZE PANTS M34",
  "JUMBO",
  "M",
  "34",
  "14022043650",
];

export function CompetitorProductImportWorkbench({ locale }: { locale: string }) {
  const copy = getCopy(locale);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [loading, setLoading] = useState<"preview" | "import" | null>(null);
  const [error, setError] = useState<string | null>(null);

  function downloadTemplate() {
    downloadCsv("competitor-product-master-template.csv", [templateColumns, templateExample]);
  }

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
      const response = await fetch("/api/competitor-products/import", { method: "POST", body: formData });
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
            <Button type="button" onClick={downloadTemplate} className="bg-slate-900 text-white hover:bg-slate-800">
              <Download className="h-4 w-4" />
              {copy.downloadTemplate}
            </Button>
            <Button type="button" onClick={() => submit("preview")} disabled={!file || loading !== null}>
              {loading === "preview" ? copy.previewing : copy.preview}
            </Button>
            <Button type="button" onClick={() => submit("import")} disabled={!preview || !file || loading !== null || preview.errors.length > 0}>
              {loading === "import" ? copy.importing : copy.import}
            </Button>
          </div>
        </div>
        <div className="mt-3 text-xs text-slate-500">{copy.templateHint}</div>
        {error ? <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      </section>

      {preview ? (
        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="grid gap-3 md:grid-cols-4">
            <Metric label={copy.totalRows} value={preview.total_rows} />
            <Metric label={copy.products} value={preview.product_count} />
            <Metric label={copy.brands} value={preview.brand_count} />
            <Metric label={copy.errors} value={preview.errors.length} />
          </div>
          {preview.errors.length > 0 ? (
            <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <div className="font-medium">{copy.fixErrors}</div>
              <ul className="mt-2 space-y-1">
                {preview.errors.slice(0, 10).map((item) => <li key={item.row_number}>Row {item.row_number}: {item.errors.join(", ")}</li>)}
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
          <table className="min-w-[1160px] w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="px-3 py-2">Row</th>
                <th className="px-3 py-2">{copy.code}</th>
                <th className="px-3 py-2">{copy.brand}</th>
                <th className="px-3 py-2">{copy.series}</th>
                <th className="px-3 py-2">{copy.product}</th>
                <th className="px-3 py-2">{copy.packageType}</th>
                <th className="px-3 py-2">{copy.size}</th>
                <th className="px-3 py-2">{copy.pcs}</th>
                <th className="px-3 py-2">{copy.targetSku}</th>
                <th className="px-3 py-2">{copy.errorColumn}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {preview.rows.map((row) => (
                <tr key={row.row_number}>
                  <td className="px-3 py-2">{row.row_number}</td>
                  <td className="px-3 py-2">{row.competitor_sku_code ?? "-"}</td>
                  <td className="px-3 py-2">{row.brand}</td>
                  <td className="px-3 py-2">{row.product_series ?? "-"}</td>
                  <td className="px-3 py-2">{row.product_name}</td>
                  <td className="px-3 py-2">{row.package_type}</td>
                  <td className="px-3 py-2">{row.size}</td>
                  <td className="px-3 py-2">{row.piece_count || "-"}</td>
                  <td className="px-3 py-2">{row.target_material_sku_code ?? "-"}</td>
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

function downloadCsv(fileName: string, rows: string[][]) {
  const csv = rows.map((row) => row.map(csvEscape).join(",")).join("\n");
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

function csvEscape(value: string) {
  if (/[",\n]/.test(value)) return `"${value.replaceAll('"', '""')}"`;
  return value;
}

function getCopy(locale: string) {
  const isZh = locale === "zh";
  return {
    chooseFile: isZh ? "选择竞品主数据 Excel" : "Choose competitor master Excel",
    missingFile: isZh ? "请先选择 Excel 文件" : "Choose a file first",
    failed: isZh ? "Excel 处理失败" : "Excel processing failed",
    preview: isZh ? "预览" : "Preview",
    previewing: isZh ? "预览中..." : "Previewing...",
    import: isZh ? "确认导入" : "Import",
    importing: isZh ? "导入中..." : "Importing...",
    downloadTemplate: isZh ? "下载导入模板" : "Download template",
    templateHint: "competitor_sku_code, brand, product_series, product_name, package_type, size, piece_count, target_material_sku_code",
    totalRows: isZh ? "总行数" : "Rows",
    products: isZh ? "竞品数" : "Products",
    brands: isZh ? "品牌数" : "Brands",
    errors: isZh ? "异常行" : "Errors",
    fixErrors: isZh ? "存在异常行，修正后才能导入。" : "Fix error rows before importing.",
    code: isZh ? "竞品编码" : "Competitor Code",
    brand: isZh ? "品牌" : "Brand",
    series: isZh ? "系列" : "Series",
    product: isZh ? "商品" : "Product",
    packageType: isZh ? "包装类型" : "Package Type",
    size: isZh ? "尺码" : "Size",
    pcs: isZh ? "片数" : "Pcs",
    targetSku: isZh ? "映射物料编码" : "Target Material SKU",
    errorColumn: isZh ? "异常" : "Error",
    imported: (result: ImportResult) => isZh
      ? `导入完成：新增品牌 ${result.brands} 个，处理竞品 ${result.competitor_products} 个，映射 ${result.mapped_count} 个，跳过人工映射 ${result.skipped_manual_mappings} 个。`
      : `Import complete: ${result.brands} brands, ${result.competitor_products} products, ${result.mapped_count} mappings, ${result.skipped_manual_mappings} manual mappings skipped.`,
  };
}

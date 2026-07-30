"use client";

import { Download, FileUp, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Button } from "@/components/ui";
import type { Dictionary } from "@/lib/i18n/get-dictionary";

const templateColumns = [
  "tenant_sku_code",
  "tenant_sku_name",
  "category",
  "sub_category",
  "brand",
  "sub_brand",
  "material_group1",
  "material_group2",
  "type",
  "sub_type",
  "pack_count",
  "box_count",
  "pcs_price",
  "f_expiry_date",
];

const templateExample = [
  "14013011601",
  "MAKUKU Air Diapers Comfort Fit Tape NB40",
  "BC",
  "Tape",
  "MAKUKU",
  "Comfort Fit",
  "",
  "",
  "Jumbo pack",
  "NB",
  "40",
  "6",
  "1553.75",
  "2100-01-01T00:00:00",
];

function csvEscape(value: string) {
  if (/[",\n]/.test(value)) return `"${value.replaceAll('"', '""')}"`;
  return value;
}

export function MaterialImportForm({ dict }: { dict: Dictionary }) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function downloadTemplate() {
    const csv = [templateColumns, templateExample]
      .map((row) => row.map(csvEscape).join(","))
      .join("\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "material-master-template.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);
    setError(null);

    try {
      const formData = new FormData(event.currentTarget);
      const response = await fetch("/api/material-master/import", {
        method: "POST",
        body: formData,
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(payload.error ?? dict.skuMaster.importFailed);
        return;
      }

      setMessage(dict.skuMaster.importSuccess.replace("{count}", String(payload.imported ?? 0)));
      const importedCode = Array.isArray(payload.importedCodes) ? payload.importedCodes[0] : null;
      if (typeof importedCode === "string" && importedCode) {
        window.dispatchEvent(new CustomEvent("material-master-imported", { detail: { query: importedCode } }));
      }
      if (fileInputRef.current) fileInputRef.current.value = "";
      router.refresh();
    } catch {
      setError(dict.skuMaster.importFailed);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={fileInputRef}
          name="file"
          type="file"
          accept=".xlsx,.xls,.csv"
          required
          className="h-9 rounded-md border border-slate-300 bg-white px-3 py-1 text-sm"
        />
        <Button type="submit" disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
          {loading ? dict.skuMaster.importing : dict.skuMaster.importButton}
        </Button>
        <Button type="button" onClick={downloadTemplate} className="bg-slate-600 hover:bg-slate-500">
          <Download className="h-4 w-4" />
          {dict.skuMaster.downloadTemplate}
        </Button>
      </div>
      {message ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {message}
        </div>
      ) : null}
      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </div>
      ) : null}
    </form>
  );
}

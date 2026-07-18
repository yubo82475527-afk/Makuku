"use client";

import { useState } from "react";
import { Button, Card } from "@/components/ui";

type ImportResult = {
  total: number;
  success: number;
  failed: number;
  errors: Array<{ row: number; candidate_id: string; error: string }>;
};

export function UnmatchedImportDialog({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setResult(null);
      setError(null);
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    setUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/ai-price-candidates/import-matches", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Import failed");
      }

      setResult(data.result);

      if (data.result.success > 0) {
        // Trigger quality gate re-evaluation
        setTimeout(() => {
          onSuccess();
        }, 1500);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <Card className="max-h-[90vh] w-full max-w-3xl overflow-y-auto">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold">Import SKU Matches</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600"
            type="button"
          >
            ✕
          </button>
        </div>

        <div className="mb-4">
          <p className="mb-2 text-sm text-slate-600">
            Upload a CSV file with SKU matching data. Required columns:
          </p>
          <ul className="mb-4 list-inside list-disc text-sm text-slate-600">
            <li><code>candidate_id</code> - The candidate ID (from export)</li>
            <li><code>matched_entity_type</code> - One of: material, material_master, competitor_product</li>
            <li><code>matched_entity_id</code> - The SKU ID to match</li>
            <li><code>matched_label</code> - Optional human-readable label</li>
          </ul>
        </div>

        {!result && (
          <div className="mb-4">
            <input
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              className="block w-full text-sm text-slate-600 file:mr-4 file:rounded file:border-0 file:bg-slate-100 file:px-4 file:py-2 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200"
            />
          </div>
        )}

        {error && (
          <div className="mb-4 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {result && (
          <div className="mb-4">
            <div className="mb-3 rounded border border-slate-200 bg-slate-50 p-4">
              <div className="mb-2 text-sm font-medium text-slate-700">Import Summary</div>
              <div className="space-y-1 text-sm">
                <div>Total rows: {result.total}</div>
                <div className="text-green-700">✓ Success: {result.success}</div>
                <div className="text-red-700">✗ Failed: {result.failed}</div>
              </div>
            </div>

            {result.errors.length > 0 && (
              <div>
                <div className="mb-2 text-sm font-medium text-slate-700">Errors</div>
                <div className="max-h-60 overflow-y-auto rounded border border-slate-200 bg-white">
                  <table className="w-full text-sm">
                    <thead className="border-b border-slate-200 bg-slate-50">
                      <tr>
                        <th className="px-3 py-2 text-left">Row</th>
                        <th className="px-3 py-2 text-left">Candidate ID</th>
                        <th className="px-3 py-2 text-left">Error</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {result.errors.map((err, idx) => (
                        <tr key={idx}>
                          <td className="px-3 py-2">{err.row}</td>
                          <td className="px-3 py-2 font-mono text-xs">{err.candidate_id}</td>
                          <td className="px-3 py-2 text-red-600">{err.error}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            onClick={onClose}
            className="border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
          >
            {result ? "Close" : "Cancel"}
          </Button>
          {!result && (
            <Button
              type="button"
              onClick={handleUpload}
              disabled={!file || uploading}
            >
              {uploading ? "Uploading..." : "Upload & Import"}
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}

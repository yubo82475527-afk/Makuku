"use client";

import { Download } from "lucide-react";
import { useRef, useState } from "react";
import { notifyExportCreated } from "@/lib/export-created-guide";

/**
 * Shared async export CTA used by price index / store visit / real prices / review.
 * On success: flies a chip to the header Exports menu (no success text under the button).
 */
export function AsyncExportJobButton({
  locale,
  className,
  createJob,
}: {
  locale: string;
  className?: string;
  createJob: () => Promise<void>;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    setLoading(true);
    setError(null);
    try {
      await createJob();
      notifyExportCreated(buttonRef.current);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Export failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        ref={buttonRef}
        type="button"
        disabled={loading}
        onClick={onClick}
        className={
          className
          ?? "inline-flex h-10 items-center gap-2 whitespace-nowrap rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
        }
      >
        <Download className="h-4 w-4" />
        {loading ? (locale === "zh" ? "创建中..." : "Creating...") : (locale === "zh" ? "导出数据" : "Export data")}
      </button>
      {error ? <p className="mt-1 max-w-xs text-left text-xs text-rose-600">{error}</p> : null}
    </div>
  );
}

export async function postExportJob(url: string, body: unknown): Promise<void> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      typeof payload.error === "string" && payload.error
        ? payload.error
        : "Export failed",
    );
  }
}

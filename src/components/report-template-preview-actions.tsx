"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui";

export function ReportTemplatePreviewActions({
  reportId,
  locale,
}: {
  reportId: string;
  locale: string;
}) {
  const isZh = locale === "zh";
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function sendPreviewImage() {
    setLoading(true);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch(`/api/internal/agent-reports/${reportId}/dispatch-preview-image`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ locale }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(payload.error ?? (isZh ? "试发失败。" : "Preview send failed."));
        return;
      }
      setMessage(isZh
        ? `已试发图片，目标 ${payload.data?.recipient_count ?? 0} 人，成功 ${payload.data?.sent_count ?? 0} 人。`
        : `Preview image sent. Targets: ${payload.data?.recipient_count ?? 0}, sent: ${payload.data?.sent_count ?? 0}.`);
    } catch {
      setError(isZh ? "网络异常，试发失败。" : "Network error. Preview send failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <Button type="button" onClick={() => void sendPreviewImage()} disabled={loading}>
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {isZh ? "试发图片" : "Send Test Image"}
      </Button>
      {message ? <span className="text-sm text-emerald-700">{message}</span> : null}
      {error ? <span className="text-sm text-rose-700">{error}</span> : null}
    </div>
  );
}


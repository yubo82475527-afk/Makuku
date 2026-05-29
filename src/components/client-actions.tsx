"use client";

import { Check, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui";
import type { Dictionary } from "@/lib/i18n/get-dictionary";

export function GenerateAiButton({ eventId, dict }: { eventId: string; dict: Dictionary }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setLoading(true);
    setError(null);
    const response = await fetch(`/api/promo-events/${eventId}/ai-strategy`, { method: "POST" });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      setError(payload.error ?? dict.actions.generateAiError);
    } else {
      router.refresh();
    }
    setLoading(false);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button onClick={submit} disabled={loading}>
        <RefreshCw className="h-4 w-4" />
        {loading ? dict.actions.generating : dict.actions.generateAi}
      </Button>
      {error ? <span className="text-sm text-red-700">{error}</span> : null}
    </div>
  );
}

export function RecommendationStatusButton({
  recommendationId,
  status,
  dict,
}: {
  recommendationId: string;
  status: "accepted" | "rejected";
  dict: Dictionary;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function submit() {
    setLoading(true);
    await fetch(`/api/ai-recommendations/${recommendationId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    router.refresh();
    setLoading(false);
  }

  return (
    <Button onClick={submit} disabled={loading} className={status === "accepted" ? "bg-emerald-700 hover:bg-emerald-600" : "bg-slate-600 hover:bg-slate-500"}>
      <Check className="h-4 w-4" />
      {status === "accepted" ? dict.actions.accept : dict.actions.reject}
    </Button>
  );
}

export function MarkAlertReadButton({ alertId, label }: { alertId: string; label: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function submit() {
    setLoading(true);
    await fetch(`/api/alerts/${alertId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ read: true }),
    });
    router.refresh();
    setLoading(false);
  }

  return (
    <button onClick={submit} disabled={loading} className="text-sm font-medium text-slate-700 underline-offset-2 hover:underline">
      {label}
    </button>
  );
}

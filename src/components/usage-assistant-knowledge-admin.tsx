"use client";

import { Loader2, RefreshCw, Save } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Card } from "@/components/ui";

type KnowledgePack = {
  id?: string;
  version: string;
  generatedAt: string;
  contentHash: string;
  factsSourceHash: string;
  facts: unknown;
  howtoZh: string;
  howtoEn: string;
  source: "published" | "seed";
};

type DetailResponse = {
  pack: KnowledgePack;
  currentFactsSourceHash: string;
  factsOutOfDate: boolean;
  usingSeed: boolean;
  status?: string;
  note?: string | null;
  createdByName?: string | null;
  error?: string;
};

type FallbackTurn = {
  id: string;
  created_at: string;
  question: string;
  grounding: string;
  user_display_name: string | null;
  current_path: string | null;
  locale: string | null;
};

export function UsageAssistantKnowledgeAdmin({ locale }: { locale: string }) {
  const isZh = locale === "zh";
  const [detail, setDetail] = useState<DetailResponse | null>(null);
  const [howtoZh, setHowtoZh] = useState("");
  const [howtoEn, setHowtoEn] = useState("");
  const [note, setNote] = useState("");
  const [tab, setTab] = useState<"howto" | "facts" | "fallbacks">("howto");
  const [fallbacks, setFallbacks] = useState<FallbackTurn[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setBusy("load");
    setError(null);
    try {
      const [detailRes, fallbackRes] = await Promise.all([
        fetch("/api/usage-assistant-knowledge", { cache: "no-store" }),
        fetch("/api/usage-assistant-knowledge?view=fallbacks", { cache: "no-store" }),
      ]);
      const detailJson = await detailRes.json();
      if (!detailRes.ok) throw new Error(detailJson.error || "Load failed");
      setDetail(detailJson);
      setHowtoZh(detailJson.pack?.howtoZh ?? "");
      setHowtoEn(detailJson.pack?.howtoEn ?? "");
      const fallbackJson = await fallbackRes.json();
      if (fallbackRes.ok) setFallbacks(fallbackJson.turns ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Load failed");
    } finally {
      setBusy(null);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function publish(syncFacts: boolean) {
    setBusy(syncFacts ? "sync" : "publish");
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/usage-assistant-knowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ howtoZh, howtoEn, syncFacts, note }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Publish failed");
      setDetail({
        pack: json.pack,
        currentFactsSourceHash: json.currentFactsSourceHash,
        factsOutOfDate: json.factsOutOfDate,
        usingSeed: json.usingSeed,
      });
      setHowtoZh(json.pack.howtoZh);
      setHowtoEn(json.pack.howtoEn);
      setMessage(isZh ? "已发布新知识版本" : "Published a new knowledge version");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Publish failed");
    } finally {
      setBusy(null);
    }
  }

  const pack = detail?.pack;

  return (
    <div className="space-y-4">
      {detail?.usingSeed ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {isZh
            ? "当前无已发布版本，助手正在使用内置 seed 知识。请编辑指引后点击发布。"
            : "No published version yet. The assistant is using the built-in seed. Edit the guide and publish."}
        </div>
      ) : null}
      {detail?.factsOutOfDate ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {isZh
            ? "代码事实哈希已落后。请点击「同步代码事实并发布」。"
            : "Code facts hash is stale. Click “Sync code facts & publish”."}
        </div>
      ) : null}
      {error ? <div className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div> : null}
      {message ? <div className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</div> : null}

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1 text-sm">
            <div className="font-semibold text-slate-900">
              {isZh ? "当前知识版本" : "Current knowledge"}
            </div>
            <div className="text-slate-600">
              {isZh ? "版本" : "Version"}: {pack?.version ?? "-"}
            </div>
            <div className="text-slate-600">
              {isZh ? "更新时间" : "Updated"}: {pack?.generatedAt ? new Date(pack.generatedAt).toLocaleString() : "-"}
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              <Badge tone={detail?.usingSeed ? "medium" : "low"}>
                {detail?.usingSeed ? "seed" : "published"}
              </Badge>
              <Badge tone={detail?.factsOutOfDate ? "medium" : "low"}>
                {detail?.factsOutOfDate
                  ? (isZh ? "事实落后" : "Facts stale")
                  : (isZh ? "事实同步" : "Facts in sync")}
              </Badge>
            </div>
            <div className="text-xs text-slate-500">
              content={pack?.contentHash ?? "-"} · facts={pack?.factsSourceHash ?? "-"} · live={detail?.currentFactsSourceHash ?? "-"}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => void load()} disabled={Boolean(busy)}>
              {busy === "load" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              <span className="ml-1.5">{isZh ? "刷新" : "Refresh"}</span>
            </Button>
            <Button type="button" onClick={() => void publish(false)} disabled={Boolean(busy)}>
              {busy === "publish" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              <span className="ml-1.5">{isZh ? "保存指引并发布" : "Save guide & publish"}</span>
            </Button>
            <Button type="button" onClick={() => void publish(true)} disabled={Boolean(busy)}>
              {busy === "sync" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              <span className="ml-1.5">{isZh ? "同步代码事实并发布" : "Sync code facts & publish"}</span>
            </Button>
          </div>
        </div>
        <label className="mt-3 block text-xs text-slate-500">
          {isZh ? "发布备注（可选）" : "Publish note (optional)"}
          <input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            className="mt-1 h-9 w-full rounded-md border border-slate-300 px-3 text-sm"
          />
        </label>
      </Card>

      <div className="flex gap-2 text-sm">
        {([
          ["howto", isZh ? "指引" : "How-to"],
          ["facts", isZh ? "事实（只读）" : "Facts (read-only)"],
          ["fallbacks", isZh ? "近期兜底问" : "Recent fallbacks"],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`rounded-md px-3 py-1.5 ${tab === key ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "howto" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <div className="mb-2 text-sm font-medium">{isZh ? "中文指引" : "Chinese guide"}</div>
            <textarea
              value={howtoZh}
              onChange={(event) => setHowtoZh(event.target.value)}
              className="min-h-[28rem] w-full rounded-md border border-slate-300 p-3 font-mono text-xs leading-5"
            />
          </Card>
          <Card>
            <div className="mb-2 text-sm font-medium">{isZh ? "英文指引" : "English guide"}</div>
            <textarea
              value={howtoEn}
              onChange={(event) => setHowtoEn(event.target.value)}
              className="min-h-[28rem] w-full rounded-md border border-slate-300 p-3 font-mono text-xs leading-5"
            />
          </Card>
        </div>
      ) : null}

      {tab === "facts" ? (
        <Card>
          <pre className="max-h-[40rem] overflow-auto rounded-md bg-slate-50 p-3 text-xs leading-5 text-slate-800">
            {JSON.stringify(pack?.facts ?? {}, null, 2)}
          </pre>
        </Card>
      ) : null}

      {tab === "fallbacks" ? (
        <Card>
          {fallbacks.length === 0 ? (
            <div className="text-sm text-slate-500">{isZh ? "暂无兜底记录" : "No fallback records yet"}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="text-xs text-slate-500">
                  <tr>
                    <th className="py-2 pr-3">{isZh ? "时间" : "Time"}</th>
                    <th className="py-2 pr-3">{isZh ? "用户" : "User"}</th>
                    <th className="py-2 pr-3">{isZh ? "类型" : "Type"}</th>
                    <th className="py-2 pr-3">{isZh ? "问题" : "Question"}</th>
                    <th className="py-2">{isZh ? "页面" : "Path"}</th>
                  </tr>
                </thead>
                <tbody>
                  {fallbacks.map((turn) => (
                    <tr key={turn.id} className="border-t border-slate-100 align-top">
                      <td className="py-2 pr-3 whitespace-nowrap text-xs text-slate-500">
                        {new Date(turn.created_at).toLocaleString()}
                      </td>
                      <td className="py-2 pr-3">{turn.user_display_name || "-"}</td>
                      <td className="py-2 pr-3"><Badge>{turn.grounding}</Badge></td>
                      <td className="py-2 pr-3 max-w-md whitespace-pre-wrap">{turn.question}</td>
                      <td className="py-2 text-xs text-slate-500">{turn.current_path || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ) : null}
    </div>
  );
}

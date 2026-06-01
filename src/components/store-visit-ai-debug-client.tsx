"use client";

import { RotateCcw, Save, WandSparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge, Button } from "@/components/ui";
import type { OfflineStoreVisit, StoreVisitAiConfig, StoreVisitAiResult } from "@/lib/types";

type DebugResponse = {
  test_token: string;
  normalized: StoreVisitAiResult;
  rawText: string;
  parsed: unknown;
  metadata: Record<string, unknown>;
  debug: {
    signed_image_count: number;
    image_categories: string[];
    image_input_mode: string;
    config: {
      version_name: string;
      temperature: number;
      max_tokens: number;
    };
  };
};

function safeJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function shortDate(value?: string | null) {
  return value ? new Date(value).toLocaleString() : "-";
}

function resultCounts(result: StoreVisitAiResult | null) {
  if (!result) return { raw: 0, prices: 0, promos: 0, warnings: 0 };
  return {
    raw: result.raw_extraction.detected_items.length,
    prices: result.price_insights.key_sku_prices.length,
    promos: result.promotion_insights.competitor_promotions.length,
    warnings: result.validation.warnings.length,
  };
}

export function StoreVisitAiDebugClient({
  visits,
  activeConfig,
  history,
}: {
  visits: OfflineStoreVisit[];
  activeConfig: StoreVisitAiConfig;
  history: StoreVisitAiConfig[];
}) {
  const [visitId, setVisitId] = useState(visits[0]?.id ?? "");
  const [versionName, setVersionName] = useState(activeConfig.version_name || "Store visit AI config");
  const [systemPrompt, setSystemPrompt] = useState(activeConfig.system_prompt);
  const [temperature, setTemperature] = useState(String(activeConfig.temperature));
  const [maxTokens, setMaxTokens] = useState(String(activeConfig.max_tokens));
  const [result, setResult] = useState<DebugResponse | null>(null);
  const [testToken, setTestToken] = useState("");
  const [testedFingerprint, setTestedFingerprint] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const selectedVisit = visits.find((visit) => visit.id === visitId) ?? visits[0] ?? null;
  const fingerprint = useMemo(() => safeJson({
    visit_id: visitId,
    system_prompt: systemPrompt,
    temperature: Number(temperature),
    max_tokens: Number(maxTokens),
  }), [maxTokens, systemPrompt, temperature, visitId]);
  const parsedTemperature = Number(temperature);
  const parsedMaxTokens = Number(maxTokens);
  const canSave = Boolean(
    systemPrompt.trim().length >= 200 &&
    Number.isFinite(parsedTemperature) &&
    parsedTemperature >= 0 &&
    parsedTemperature <= 2 &&
    Number.isFinite(parsedMaxTokens) &&
    parsedMaxTokens >= 500 &&
    parsedMaxTokens <= 6000,
  );
  const formChangedAfterTest = Boolean(result && testedFingerprint && testedFingerprint !== fingerprint);
  const counts = resultCounts(result?.normalized ?? null);

  function resetTestState() {
    setResult(null);
    setTestToken("");
    setTestedFingerprint("");
    setMessage("");
  }

  async function runDebug() {
    setIsRunning(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/store-visit-ai-debug/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          visit_id: visitId,
          version_name: versionName,
          system_prompt: systemPrompt,
          temperature: Number(temperature),
          max_tokens: Number(maxTokens),
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "Debug run failed");
      setResult(payload as DebugResponse);
      setTestToken(String(payload.test_token ?? ""));
      setTestedFingerprint(fingerprint);
      setMessage("Test completed. This result has not changed production data.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Debug run failed");
    } finally {
      setIsRunning(false);
    }
  }

  async function saveConfig() {
    if (!canSave) return;
    setIsSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/store-visit-ai-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          version_name: versionName,
          system_prompt: systemPrompt,
          temperature: Number(temperature),
          max_tokens: Number(maxTokens),
          test_token: testedFingerprint === fingerprint ? testToken : "",
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "Save failed");
      setMessage("Saved and activated for future production analyses.");
      window.location.reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Save failed");
    } finally {
      setIsSaving(false);
    }
  }

  async function activateConfig(id: string) {
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/store-visit-ai-config/${id}/activate`, { method: "POST" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "Activate failed");
      window.location.reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Activate failed");
    }
  }

  function loadConfig(config: StoreVisitAiConfig) {
    setVersionName(config.version_name);
    setSystemPrompt(config.system_prompt);
    setTemperature(String(config.temperature));
    setMaxTokens(String(config.max_tokens));
    resetTestState();
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(320px,420px)_1fr]">
      <div className="space-y-4">
        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold">Active configuration</h2>
              <p className="mt-1 text-sm text-slate-500">{activeConfig.version_name}</p>
            </div>
            <Badge>{activeConfig.id ? "database" : "default"}</Badge>
          </div>
          <div className="mt-3 grid gap-2 text-sm text-slate-600">
            <div>Temperature: <span className="font-medium text-slate-900">{activeConfig.temperature}</span></div>
            <div>Max tokens: <span className="font-medium text-slate-900">{activeConfig.max_tokens}</span></div>
            <div>Activated: <span className="font-medium text-slate-900">{shortDate(activeConfig.activated_at)}</span></div>
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="font-semibold">Debug input</h2>
          <div className="mt-4 space-y-3">
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-medium text-slate-500">Store visit</span>
              <select
                value={visitId}
                onChange={(event) => {
                  setVisitId(event.target.value);
                  resetTestState();
                }}
                className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:border-slate-500"
              >
                {visits.map((visit) => (
                  <option key={visit.id} value={visit.id}>
                    {visit.store_name} / {visit.city} / {visit.visit_date}
                  </option>
                ))}
              </select>
            </label>
            {selectedVisit ? (
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                <div className="font-medium text-slate-950">{selectedVisit.store_name}</div>
                <div className="mt-1">{selectedVisit.city} / {selectedVisit.channel_type} / {selectedVisit.uploader_name}</div>
                <div className="mt-1">Images: {Array.isArray(selectedVisit.image_urls) ? selectedVisit.image_urls.length : 0}</div>
              </div>
            ) : null}
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="font-semibold">Version history</h2>
          <div className="mt-3 space-y-2">
            {history.length === 0 ? <p className="text-sm text-slate-500">No saved database versions yet.</p> : null}
            {history.map((config) => (
              <div key={config.id} className="rounded-md border border-slate-200 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-sm font-medium">{config.version_name}</div>
                    <div className="mt-1 text-xs text-slate-500">{shortDate(config.created_at)}</div>
                  </div>
                  <Badge>{config.status}</Badge>
                </div>
                <div className="mt-2 flex gap-2">
                  <button type="button" onClick={() => loadConfig(config)} className="text-xs font-medium text-slate-700 underline">
                    Load
                  </button>
                  {config.status !== "active" && config.id ? (
                    <button type="button" onClick={() => activateConfig(config.id!)} className="inline-flex items-center gap-1 text-xs font-medium text-slate-700 underline">
                      <RotateCcw className="h-3 w-3" />
                      Activate
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="space-y-4">
        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold">Editable configuration</h2>
              <p className="mt-1 text-sm text-slate-500">You can save directly. Run test is only for previewing output before activation.</p>
            </div>
            <div className="flex gap-2">
              <Button type="button" onClick={runDebug} disabled={!visitId || isRunning}>
                <WandSparkles className="h-4 w-4" />
                {isRunning ? "Testing" : "Run test"}
              </Button>
              <Button type="button" onClick={saveConfig} disabled={!canSave || isSaving} className="bg-emerald-700 hover:bg-emerald-600">
                <Save className="h-4 w-4" />
                {isSaving ? "Saving" : "Save active"}
              </Button>
            </div>
          </div>

          {error ? <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
          {message ? <div className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{message}</div> : null}
          {formChangedAfterTest ? <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">The form changed after the last test. You can still save directly, or run test again to preview the latest output.</div> : null}
          {!canSave ? <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">Save requires a prompt with at least 200 characters, temperature 0-2, and max tokens 500-6000.</div> : null}

          <div className="mt-4 grid gap-3 md:grid-cols-4">
            <label className="block text-sm md:col-span-2">
              <span className="mb-1 block text-xs font-medium text-slate-500">Version name</span>
              <input
                value={versionName}
                onChange={(event) => {
                  setVersionName(event.target.value);
                }}
                className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-slate-500"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-medium text-slate-500">Temperature</span>
              <input
                type="number"
                min="0"
                max="2"
                step="0.1"
                value={temperature}
                onChange={(event) => {
                  setTemperature(event.target.value);
                  resetTestState();
                }}
                className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-slate-500"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-medium text-slate-500">Max tokens</span>
              <input
                type="number"
                min="500"
                max="6000"
                step="100"
                value={maxTokens}
                onChange={(event) => {
                  setMaxTokens(event.target.value);
                  resetTestState();
                }}
                className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-slate-500"
              />
            </label>
          </div>
          <label className="mt-3 block text-sm">
            <span className="mb-1 block text-xs font-medium text-slate-500">System prompt</span>
            <textarea
              value={systemPrompt}
              onChange={(event) => {
                setSystemPrompt(event.target.value);
                resetTestState();
              }}
              className="min-h-[360px] w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-xs leading-5 outline-none focus:border-slate-500"
            />
          </label>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="font-semibold">Test result</h2>
          {!result ? <p className="mt-3 text-sm text-slate-500">Run a test to preview the parsed output without saving production data.</p> : null}
          {result ? (
            <div className="mt-4 space-y-4">
              <div className="grid gap-3 md:grid-cols-4">
                <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                  <div className="text-xs text-slate-500">Raw items</div>
                  <div className="mt-1 text-xl font-semibold">{counts.raw}</div>
                </div>
                <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                  <div className="text-xs text-slate-500">Key prices</div>
                  <div className="mt-1 text-xl font-semibold">{counts.prices}</div>
                </div>
                <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                  <div className="text-xs text-slate-500">Promos</div>
                  <div className="mt-1 text-xl font-semibold">{counts.promos}</div>
                </div>
                <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                  <div className="text-xs text-slate-500">Warnings</div>
                  <div className="mt-1 text-xl font-semibold">{counts.warnings}</div>
                </div>
              </div>

              <div className="rounded-md border border-slate-200 p-3">
                <div className="text-xs font-medium uppercase text-slate-500">Store summary</div>
                <p className="mt-2 text-sm font-medium text-slate-950">{result.normalized.store_summary}</p>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-md border border-slate-200 p-3">
                  <h3 className="text-sm font-semibold">Raw extraction</h3>
                  <div className="mt-2 max-h-72 overflow-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="text-slate-500">
                        <tr><th className="py-1 pr-2">Brand</th><th className="py-1 pr-2">Product</th><th className="py-1 pr-2">Price</th><th className="py-1">Conf</th></tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {result.normalized.raw_extraction.detected_items.map((item, index) => (
                          <tr key={`${item.brand}-${item.product}-${index}`}>
                            <td className="py-1 pr-2">{item.brand || "-"}</td>
                            <td className="py-1 pr-2">{item.product || "-"}</td>
                            <td className="py-1 pr-2">{item.price || "-"}</td>
                            <td className="py-1">{Math.round(item.confidence * 100)}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="rounded-md border border-slate-200 p-3">
                  <h3 className="text-sm font-semibold">Validation warnings</h3>
                  <div className="mt-2 space-y-2">
                    {result.normalized.validation.warnings.length === 0 ? <div className="text-sm text-slate-500">No warnings.</div> : null}
                    {result.normalized.validation.warnings.map((warning, index) => (
                      <div key={index} className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
                        <span className="font-semibold">{warning.type}</span>: {warning.message}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <pre className="max-h-96 overflow-auto rounded-md bg-slate-950 p-3 text-xs text-slate-100">{safeJson(result.normalized)}</pre>
                <pre className="max-h-96 overflow-auto rounded-md bg-slate-950 p-3 text-xs text-slate-100">{safeJson({ rawText: result.rawText, metadata: result.metadata, debug: result.debug })}</pre>
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}

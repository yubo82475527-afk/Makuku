"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { formatIdr } from "@/lib/format";
import type { AiPriceCandidateMatchType, OperatorPriceReviewDetail } from "@/lib/types";

type MatchOption = {
  type: Exclude<AiPriceCandidateMatchType, "unmatched">;
  id: string;
  label: string;
};

export function OperatorPriceReviewDrawer({
  candidateId,
  locale,
  onClose,
  onProcessed,
}: {
  candidateId: string;
  locale: string;
  onClose: () => void;
  onProcessed: (id: string) => void;
}) {
  const isZh = locale === "zh";
  const [detail, setDetail] = useState<OperatorPriceReviewDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"default" | "correct">("default");
  const [packagePrice, setPackagePrice] = useState("");
  const [pieceCount, setPieceCount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [matchEditorOpen, setMatchEditorOpen] = useState(false);
  const [matchOptions, setMatchOptions] = useState<MatchOption[] | null>(null);
  const [matchLoading, setMatchLoading] = useState(false);
  const [selectedMatchKey, setSelectedMatchKey] = useState("");
  const [matchQuery, setMatchQuery] = useState("");

  useEffect(() => {
    let active = true;
    fetch(`/api/operator-price-reviews/${candidateId}?locale=${locale}`, { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error ?? (isZh ? "加载审核详情失败" : "Failed to load review details"));
        return payload.item as OperatorPriceReviewDetail;
      })
      .then((item) => {
        if (!active) return;
        setDetail(item);
        setPackagePrice(item.evidence_package_price ? String(Math.round(item.evidence_package_price)) : "");
        setPieceCount(item.evidence_piece_count ? String(item.evidence_piece_count) : "");
      })
      .catch((reason) => {
        if (active) setError(reason instanceof Error ? reason.message : String(reason));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [candidateId, isZh, locale]);

  const selectedMatch = useMemo(
    () => matchOptions?.find((option) => `${option.type}:${option.id}` === selectedMatchKey) ?? null,
    [matchOptions, selectedMatchKey],
  );
  const filteredMatchOptions = useMemo(() => {
    const query = matchQuery.trim().toLowerCase();
    if (!query) return matchOptions ?? [];
    return (matchOptions ?? []).filter((option) => option.label.toLowerCase().includes(query) || option.id.toLowerCase().includes(query));
  }, [matchOptions, matchQuery]);
  const previewPricePerPiece = useMemo(() => {
    const price = Number(packagePrice);
    const pieces = Number(pieceCount);
    if (!Number.isFinite(price) || price <= 0 || !Number.isInteger(pieces) || pieces <= 0) return null;
    return Math.round(price / pieces * 100) / 100;
  }, [packagePrice, pieceCount]);
  const currentMatch: MatchOption | null = detail?.current_match_id && detail.current_match_type !== "unmatched"
    ? {
      type: detail.current_match_type,
      id: detail.current_match_id,
      label: detail.current_match_label ?? "",
    }
    : null;
  const finalMatch = selectedMatch ?? currentMatch;
  const finalMatchValid = Boolean(finalMatch);

  async function openMatchEditor() {
    setMatchEditorOpen(true);
    if (matchOptions || matchLoading) return;
    setMatchLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/store-visit/match-options", { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? (isZh ? "加载商品列表失败" : "Failed to load products"));
      const materials: MatchOption[] = (Array.isArray(payload.items) ? payload.items : []).map((item: Record<string, unknown>) => ({
        type: "material_master",
        id: String(item.tenant_sku_code ?? ""),
        label: [item.tenant_sku_code, item.tenant_sku_name].filter(Boolean).join(" · "),
      })).filter((option: MatchOption) => option.id);
      const products: MatchOption[] = (Array.isArray(payload.products) ? payload.products : []).map((item: Record<string, unknown>) => {
        const brands = item.brands as Record<string, unknown> | Array<Record<string, unknown>> | null;
        const brand = Array.isArray(brands) ? brands[0]?.name : brands?.name;
        return {
          type: "competitor_product" as const,
          id: String(item.id ?? ""),
          label: [brand, item.normalized_name].filter(Boolean).join(" · "),
        };
      }).filter((option: MatchOption) => option.id);
      setMatchOptions([...materials, ...products]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setMatchLoading(false);
    }
  }

  async function submit(action: "confirm" | "correct" | "reject") {
    if (!detail || submitting) return;
    if (action !== "reject" && !finalMatchValid) {
      setError(isZh ? "请先确认这条价格对应的商品。" : "Confirm the product for this price first.");
      return;
    }
    if (action === "correct" && previewPricePerPiece === null) {
      setError(isZh ? "请输入有效的包装价和片数。" : "Enter a valid package price and piece count.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/api/operator-price-reviews/${candidateId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          locale,
          review_token: detail.review_token,
          package_price: action === "correct" ? Number(packagePrice) : undefined,
          piece_count: action === "correct" ? Number(pieceCount) : undefined,
          matched_entity_type: finalMatch?.type,
          matched_entity_id: finalMatch?.id,
          matched_label: finalMatch?.label,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 409) throw new Error(isZh ? "这条价格已发生变化，请刷新后重新确认。" : "This price changed. Refresh and confirm again.");
        throw new Error(payload.error ?? (isZh ? "提交失败" : "Submission failed"));
      }
      onProcessed(candidateId);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setSubmitting(false);
    }
  }

  function onBackdropClick(event: React.MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget && !submitting) onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-3 md:p-6" role="dialog" aria-modal="true" onClick={onBackdropClick}>
      <section className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">{isZh ? "价格异常审核" : "Price anomaly review"}</h2>
            <p className="mt-0.5 text-xs text-slate-500">{isZh ? "左侧看原图，右侧确认价格、片数和商品匹配。" : "Review the image, price, pieces, and matched product in one view."}</p>
          </div>
          <button type="button" onClick={onClose} disabled={submitting} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50">{isZh ? "关闭" : "Close"}</button>
        </div>

        {loading ? <div className="py-16 text-center text-sm text-slate-500">{isZh ? "加载中…" : "Loading…"}</div> : null}
        {!loading && !detail ? <div className="m-5 rounded-md bg-rose-50 p-3 text-sm text-rose-700">{error ?? (isZh ? "审核详情不可用" : "Review details unavailable")}</div> : null}
        {detail ? (
          <div className="grid min-h-0 flex-1 overflow-y-auto md:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)]">
            <section className="bg-slate-950 p-3 md:min-h-[680px] md:p-4">
              <div className="sticky top-0 flex h-full min-h-[360px] items-center justify-center overflow-hidden rounded-lg bg-slate-900 md:min-h-[calc(92vh-7.5rem)]">
                {detail.source_image_url ? (
                  <a href={detail.source_image_url} target="_blank" rel="noreferrer" aria-label={isZh ? "查看原始证据图片" : "View source evidence image"} className="flex h-full w-full items-center justify-center">
                    {/* Signed Supabase URLs are loaded directly so reviewers can inspect the original photo. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={detail.source_image_url} alt={isZh ? "价格证据原图" : "Source evidence"} className="max-h-full max-w-full object-contain" />
                  </a>
                ) : (
                  <div className="flex h-full w-full items-center justify-center border border-dashed border-slate-600 px-4 text-center text-sm text-slate-300">
                    {isZh ? "原始证据不可用" : "Source evidence unavailable"}
                  </div>
                )}
              </div>
            </section>

            <section className="space-y-4 p-4 md:overflow-y-auto md:p-5">
              <ReasonLabels labels={detail.operator_reason_labels} fallback={detail.operator_reason} />

              <section className="rounded-lg border border-slate-200 p-4">
                <h3 className="text-sm font-semibold text-slate-950">{isZh ? "来源信息" : "Source"}</h3>
                <dl className="mt-3 grid grid-cols-[5.5rem_1fr] gap-x-3 gap-y-2 text-sm">
                  <dt className="text-slate-500">Visit ID</dt>
                  <dd className="break-all font-medium text-slate-900">{detail.visit_code ?? detail.visit_detail_href.split("/").at(-1) ?? "-"}</dd>
                  <dt className="text-slate-500">Image ID</dt>
                  <dd className="break-all text-slate-900">{detail.source_image_id ?? "-"}</dd>
                </dl>
              </section>

              <section className="rounded-lg border border-slate-200 p-4">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-sm font-semibold text-slate-950">{isZh ? "图片识别内容" : "Evidence read from the image"}</h3>
                  {detail.state === "pending" && mode !== "correct" ? (
                    <button type="button" disabled={submitting} onClick={() => setMode("correct")} className="shrink-0 rounded-md bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-700 disabled:opacity-50">
                      {isZh ? "修改价格" : "Edit price"}
                    </button>
                  ) : null}
                </div>
                <dl className="mt-3 grid grid-cols-[6.5rem_1fr] gap-x-3 gap-y-2 text-sm">
                  <dt className="text-slate-500">{isZh ? "商品" : "Product"}</dt><dd className="break-words text-slate-900">{detail.evidence_product_text || "-"}</dd>
                  <dt className="text-slate-500">{isZh ? "包装价" : "Package price"}</dt><dd className="font-medium text-slate-950">{formatIdr(detail.evidence_package_price)}</dd>
                  <dt className="text-slate-500">{isZh ? "片数" : "Pieces"}</dt><dd className="text-slate-900">{detail.evidence_piece_count ?? "-"}</dd>
                  <dt className="text-slate-500">{isZh ? "换算单片价" : "Per-piece price"}</dt><dd className="font-medium text-slate-950">{formatIdr(detail.evidence_price_per_piece)}</dd>
                  {detail.historical_common_price_per_piece ? <><dt className="text-slate-500">{isZh ? "历史单片价" : "Common price"}</dt><dd className="text-slate-900">{formatIdr(detail.historical_common_price_per_piece)}</dd></> : null}
                </dl>

                {mode === "correct" ? (
                  <div className="mt-4 rounded-lg bg-slate-50 p-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="text-sm text-slate-600">{isZh ? "包装价" : "Package price"}<input type="number" min="1" step="1" value={packagePrice} onChange={(event) => setPackagePrice(event.target.value)} className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-slate-950 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200" /></label>
                      <label className="text-sm text-slate-600">{isZh ? "片数" : "Pieces"}<input type="number" min="1" step="1" value={pieceCount} onChange={(event) => setPieceCount(event.target.value)} className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-slate-950 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200" /></label>
                    </div>
                    <div className="mt-3 text-sm text-slate-600">{isZh ? "修正后单片价：" : "Corrected per-piece price: "}<span className="font-semibold text-slate-950">{formatIdr(previewPricePerPiece)}</span></div>
                  </div>
                ) : null}
              </section>

              <section className={`rounded-lg border p-4 ${detail.requires_product_correction ? "border-amber-200 bg-amber-50/50" : "border-slate-200"}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-slate-950">{isZh ? "匹配到的商品名称" : "Matched product"}</h3>
                    <p className="mt-1 break-words text-sm text-slate-700">{finalMatch?.label || currentMatch?.label || (isZh ? "未匹配到商品" : "No product matched")}</p>
                    {detail.requires_product_correction ? <p className="mt-1 text-xs text-amber-800">{isZh ? "这条记录需要确认商品匹配后才能通过。" : "Confirm the matched product before approving this record."}</p> : null}
                  </div>
                  {detail.state === "pending" && !matchEditorOpen ? (
                    <button type="button" onClick={openMatchEditor} className="shrink-0 rounded-md bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-700">
                      {isZh ? "修改匹配" : "Edit match"}
                    </button>
                  ) : null}
                </div>
                {matchEditorOpen ? (
                  <div className="mt-3 space-y-2">
                    <input value={matchQuery} onChange={(event) => setMatchQuery(event.target.value)} placeholder={isZh ? "搜索商品或 SKU" : "Search product or SKU"} className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200" />
                    {matchLoading ? <div className="text-sm text-slate-500">{isZh ? "加载商品…" : "Loading products…"}</div> : (
                      <select value={selectedMatchKey} onChange={(event) => setSelectedMatchKey(event.target.value)} className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200">
                        <option value="">{isZh ? "请选择商品" : "Select a product"}</option>
                        {filteredMatchOptions.map((option) => <option key={`${option.type}:${option.id}`} value={`${option.type}:${option.id}`}>{option.label}</option>)}
                      </select>
                    )}
                  </div>
                ) : null}
              </section>

              {detail.state === "pending" ? (
                <section className="space-y-3 border-t border-slate-200 pt-4">
                  {error ? <div className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div> : null}
                  <div className="grid gap-2 sm:grid-cols-3">
                    <button type="button" disabled={submitting || !finalMatchValid} onClick={() => submit("confirm")} className="inline-flex h-10 items-center justify-center rounded-md bg-emerald-600 px-3 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-40">{detail.requires_product_correction ? (isZh ? "确认商品和价格" : "Confirm product and price") : (isZh ? "确认" : "Confirm")}</button>
                    {mode === "correct" ? (
                      <button type="button" disabled={submitting || !finalMatchValid || previewPricePerPiece === null} onClick={() => submit("correct")} className="inline-flex h-10 items-center justify-center rounded-md bg-slate-900 px-3 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-40">{isZh ? "提交修改" : "Submit correction"}</button>
                    ) : (
                      <button type="button" disabled={submitting} onClick={() => setMode("correct")} className="inline-flex h-10 items-center justify-center rounded-md border border-slate-300 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50">{isZh ? "修改价格" : "Correct price"}</button>
                    )}
                    <button type="button" disabled={submitting} onClick={() => submit("reject")} className="inline-flex h-10 items-center justify-center rounded-md border border-rose-300 px-3 text-sm font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-40">{isZh ? "判定为错误" : "Mark as incorrect"}</button>
                  </div>
                </section>
              ) : (
                <div className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-600">{isZh ? "这条价格已经处理完成。" : "This price has already been processed."}</div>
              )}

              <Link href={detail.visit_detail_href} className="inline-flex text-sm font-medium text-slate-700 underline underline-offset-4">
                {isZh ? "查看完整 Visit 详情 →" : "View full Visit details →"}
              </Link>
            </section>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function ReasonLabels({ labels, fallback }: { labels: string[]; fallback: string }) {
  if (labels.length === 0) {
    return <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">{fallback}</p>;
  }
  return (
    <section className="rounded-lg bg-amber-50 px-4 py-3 text-amber-900">
      <div className="flex flex-wrap gap-1.5">
        {labels.map((label) => (
          <span key={label} className="inline-flex max-w-full rounded-md bg-white/70 px-2.5 py-1 text-sm font-medium leading-5 text-amber-950">
            {label}
          </span>
        ))}
      </div>
    </section>
  );
}

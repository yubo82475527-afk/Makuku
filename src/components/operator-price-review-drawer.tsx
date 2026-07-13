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
  const requiresMatchSelection = Boolean(detail?.requires_product_correction);
  const finalMatchValid = requiresMatchSelection ? Boolean(selectedMatch) : Boolean(detail?.current_match_id && detail.current_match_type !== "unmatched");

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
    const match = selectedMatch ?? (detail.current_match_id && detail.current_match_type !== "unmatched" ? {
      type: detail.current_match_type,
      id: detail.current_match_id,
      label: detail.current_match_label ?? "",
    } : null);
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
          matched_entity_type: match?.type,
          matched_entity_id: match?.id,
          matched_label: match?.label,
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
    <div className="fixed inset-0 z-50 flex items-end bg-slate-950/40 md:justify-end" role="dialog" aria-modal="true" onClick={onBackdropClick}>
      <aside className="max-h-[95vh] w-full overflow-y-auto rounded-t-2xl bg-white shadow-2xl md:h-full md:max-h-none md:max-w-xl md:rounded-none">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4">
          <h2 className="text-lg font-semibold text-slate-950">{isZh ? "这个价格需要确认" : "This price needs confirmation"}</h2>
          <button type="button" onClick={onClose} disabled={submitting} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-600">{isZh ? "关闭" : "Close"}</button>
        </div>

        <div className="space-y-5 p-5">
          {loading ? <div className="py-12 text-center text-sm text-slate-500">{isZh ? "加载中…" : "Loading…"}</div> : null}
          {!loading && !detail ? <div className="rounded-md bg-rose-50 p-3 text-sm text-rose-700">{error ?? (isZh ? "审核详情不可用" : "Review details unavailable")}</div> : null}
          {detail ? (
            <>
              <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">{detail.operator_reason}</p>

              <section>
                {detail.source_image_url ? (
                  <a href={detail.source_image_url} target="_blank" rel="noreferrer" aria-label={isZh ? "查看原始证据图片" : "View source evidence image"}>
                    <div className="aspect-[4/3] w-full rounded-lg bg-slate-100 bg-contain bg-center bg-no-repeat" style={{ backgroundImage: `url(${JSON.stringify(detail.source_image_url).slice(1, -1)})` }} />
                  </a>
                ) : (
                  <div className="flex aspect-[4/3] w-full items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 text-sm text-slate-500">
                    {isZh ? "原始证据不可用" : "Source evidence unavailable"}
                  </div>
                )}
              </section>

              <section className="rounded-lg border border-slate-200 p-4">
                <h3 className="text-sm font-semibold text-slate-950">{isZh ? "图片中识别到的内容" : "Evidence read from the image"}</h3>
                <dl className="mt-3 grid grid-cols-[7rem_1fr] gap-x-3 gap-y-2 text-sm">
                  <dt className="text-slate-500">{isZh ? "商品" : "Product"}</dt><dd className="text-slate-900">{detail.evidence_product_text || "-"}</dd>
                  <dt className="text-slate-500">{isZh ? "包装价" : "Package price"}</dt><dd className="text-slate-900">{formatIdr(detail.evidence_package_price)}</dd>
                  <dt className="text-slate-500">{isZh ? "片数" : "Pieces"}</dt><dd className="text-slate-900">{detail.evidence_piece_count ?? "-"}</dd>
                  <dt className="text-slate-500">{isZh ? "换算单片价" : "Per-piece price"}</dt><dd className="text-slate-900">{formatIdr(detail.evidence_price_per_piece)}</dd>
                  {detail.historical_common_price_per_piece ? <><dt className="text-slate-500">{isZh ? "历史常见单片价" : "Common historical price"}</dt><dd className="text-slate-900">{formatIdr(detail.historical_common_price_per_piece)}</dd></> : null}
                </dl>
              </section>

              {detail.requires_product_correction ? (
                <section className="rounded-lg border border-amber-200 bg-amber-50/50 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-950">{isZh ? "商品需要确认" : "Product needs confirmation"}</h3>
                      <p className="mt-1 text-xs text-slate-500">{isZh ? "确认后才能通过这条价格" : "Confirm the product before approving the price"}</p>
                    </div>
                    {!matchEditorOpen ? <button type="button" onClick={openMatchEditor} className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700">{isZh ? "修正商品" : "Correct product"}</button> : null}
                  </div>
                  {matchEditorOpen ? (
                    <div className="mt-3 space-y-2">
                      <input value={matchQuery} onChange={(event) => setMatchQuery(event.target.value)} placeholder={isZh ? "搜索商品或 SKU" : "Search product or SKU"} className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none" />
                      {matchLoading ? <div className="text-sm text-slate-500">{isZh ? "加载商品…" : "Loading products…"}</div> : (
                        <select value={selectedMatchKey} onChange={(event) => setSelectedMatchKey(event.target.value)} className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none">
                          <option value="">{isZh ? "请选择商品" : "Select a product"}</option>
                          {filteredMatchOptions.map((option) => <option key={`${option.type}:${option.id}`} value={`${option.type}:${option.id}`}>{option.label}</option>)}
                        </select>
                      )}
                    </div>
                  ) : null}
                </section>
              ) : null}

              {detail.state === "pending" ? (
                <section className="space-y-3 border-t border-slate-200 pt-5">
                  {mode === "correct" ? (
                    <div className="rounded-lg bg-slate-50 p-4">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="text-sm text-slate-600">{isZh ? "包装价" : "Package price"}<input type="number" min="1" step="1" value={packagePrice} onChange={(event) => setPackagePrice(event.target.value)} className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-slate-950 outline-none" /></label>
                        <label className="text-sm text-slate-600">{isZh ? "片数" : "Pieces"}<input type="number" min="1" step="1" value={pieceCount} onChange={(event) => setPieceCount(event.target.value)} className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-slate-950 outline-none" /></label>
                      </div>
                      <div className="mt-3 text-sm text-slate-600">{isZh ? "修正后单片价：" : "Corrected per-piece price: "}<span className="font-semibold text-slate-950">{formatIdr(previewPricePerPiece)}</span></div>
                    </div>
                  ) : null}

                  {error ? <div className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div> : null}
                  <div className="grid gap-2 sm:grid-cols-3">
                    <button type="button" disabled={submitting || !finalMatchValid} onClick={() => submit("confirm")} className="inline-flex h-10 items-center justify-center rounded-md bg-emerald-600 px-3 text-sm font-medium text-white disabled:opacity-40">{isZh ? "确认价格正确" : "Confirm price"}</button>
                    {mode === "correct" ? (
                      <button type="button" disabled={submitting || !finalMatchValid || previewPricePerPiece === null} onClick={() => submit("correct")} className="inline-flex h-10 items-center justify-center rounded-md bg-slate-900 px-3 text-sm font-medium text-white disabled:opacity-40">{isZh ? "提交修正并通过" : "Submit correction"}</button>
                    ) : (
                      <button type="button" disabled={submitting} onClick={() => setMode("correct")} className="inline-flex h-10 items-center justify-center rounded-md border border-slate-300 px-3 text-sm font-medium text-slate-700">{isZh ? "修正后通过" : "Correct and approve"}</button>
                    )}
                    <button type="button" disabled={submitting} onClick={() => submit("reject")} className="inline-flex h-10 items-center justify-center rounded-md border border-rose-300 px-3 text-sm font-medium text-rose-700 disabled:opacity-40">{isZh ? "判定为错误" : "Mark as incorrect"}</button>
                  </div>
                </section>
              ) : (
                <div className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-600">{isZh ? "这条价格已经处理完成。" : "This price has already been processed."}</div>
              )}

              <Link href={detail.visit_detail_href} className="inline-flex text-sm font-medium text-slate-700 underline underline-offset-4">
                {isZh ? "查看完整 Visit 详情 →" : "View full Visit details →"}
              </Link>
            </>
          ) : null}
        </div>
      </aside>
    </div>
  );
}

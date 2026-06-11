"use client";

import { Loader2, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge } from "@/components/ui";
import { formatIdr, formatJakartaTime, formatPricePerPiece } from "@/lib/format";
import type { PriceSnapshot } from "@/lib/types";

type PriceSnapshotForStoreRegion = {
  captured_at?: string | null;
  created_at?: string | null;
  competitor_products?: { shop_name?: string | null; normalized_name?: string | null } | null;
  ai_price_candidates?: {
    offline_store_visits?: {
      store_name?: string | null;
      city?: string | null;
      province?: string | null;
      city_name?: string | null;
      district?: string | null;
      visit_date?: string | null;
      uploader_name?: string | null;
    } | null;
  }[];
};

function cleanDisplayText(value: string | null | undefined) {
  const text = String(value ?? "").trim();
  return text && text !== "-" ? text : null;
}

function storeVisitForSnapshot(snapshot: PriceSnapshotForStoreRegion) {
  return snapshot.ai_price_candidates?.find((candidate) => candidate.offline_store_visits)?.offline_store_visits ?? null;
}

function storeNameForSnapshot(snapshot: PriceSnapshotForStoreRegion) {
  return cleanDisplayText(storeVisitForSnapshot(snapshot)?.store_name) ?? cleanDisplayText(snapshot.competitor_products?.shop_name) ?? "-";
}

function uploaderNameForSnapshot(snapshot: PriceSnapshotForStoreRegion) {
  return cleanDisplayText(storeVisitForSnapshot(snapshot)?.uploader_name) ?? "-";
}

function splitLegacyRegion(value: string | null | undefined) {
  const parts = String(value ?? "")
    .replaceAll("，", ",")
    .split(/[/>|,]/)
    .map((part) => cleanDisplayText(part))
    .filter(Boolean) as string[];
  if (parts.length >= 3) return { province: parts[0], cityName: parts[1], district: parts[2] };
  if (parts.length === 2) return { province: null, cityName: parts[0], district: parts[1] };
  if (parts.length === 1) return { province: null, cityName: parts[0], district: null };
  return { province: null, cityName: null, district: null };
}

function storeRegionForSnapshot(snapshot: PriceSnapshotForStoreRegion) {
  const visit = storeVisitForSnapshot(snapshot);
  const legacyRegion = splitLegacyRegion(visit?.city);
  return {
    province: cleanDisplayText(visit?.province) ?? legacyRegion.province,
    cityName: cleanDisplayText(visit?.city_name) ?? legacyRegion.cityName,
    district: cleanDisplayText(visit?.district) ?? legacyRegion.district,
  };
}

function formatSnapshotCapturedAt(snapshot: PriceSnapshotForStoreRegion) {
  const visitDate = cleanDisplayText(storeVisitForSnapshot(snapshot)?.visit_date);
  if (visitDate) return visitDate.slice(0, 10);
  return formatJakartaTime(snapshot.captured_at);
}

function formatSnapshotCreatedAt(snapshot: PriceSnapshotForStoreRegion) {
  return formatJakartaTime(snapshot.created_at);
}

function channelLabel(value: string, locale: string) {
  if (value === "offline") return locale === "zh" ? "线下" : "Offline";
  if (value === "manual") return locale === "zh" ? "手工" : "Manual";
  if (value === "shopee") return "Shopee";
  if (value === "tiktok") return "TikTok";
  return value;
}

export function PriceSnapshotsTable({
  snapshots,
  locale,
}: {
  snapshots: PriceSnapshot[];
  locale: string;
}) {
  const router = useRouter();
  const isZh = locale === "zh";
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [deletedIds, setDeletedIds] = useState<Set<string>>(() => new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const visibleSnapshots = snapshots.filter((snapshot) => !deletedIds.has(snapshot.id));
  const visibleIds = visibleSnapshots.map((snapshot) => snapshot.id);
  const selectedVisibleIds = selectedIds.filter((id) => visibleIds.includes(id));
  const allSelected = visibleIds.length > 0 && selectedVisibleIds.length === visibleIds.length;

  function toggleSnapshot(id: string, checked: boolean) {
    setSelectedIds((current) => checked ? Array.from(new Set([...current, id])) : current.filter((item) => item !== id));
  }

  function toggleAll(checked: boolean) {
    setSelectedIds(checked ? visibleIds : []);
  }

  async function deleteSelected() {
    if (selectedVisibleIds.length === 0 || loading) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/price-snapshots", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids: selectedVisibleIds }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(payload.error ?? (isZh ? "删除失败，请稍后重试。" : "Delete failed. Please retry."));
        return;
      }
      const deletedCount = Number(payload.deleted_count ?? selectedVisibleIds.length);
      setDeletedIds((current) => {
        const next = new Set(current);
        selectedVisibleIds.forEach((id) => next.add(id));
        return next;
      });
      setSelectedIds([]);
      setConfirmOpen(false);
      setNotice(isZh ? `已删除 ${deletedCount} 条价格快照。` : `${deletedCount} price snapshots deleted.`);
      router.refresh();
    } catch {
      setError(isZh ? "网络异常，删除没有提交成功。" : "Network error. Delete was not submitted.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
        <div>
          {selectedVisibleIds.length > 0
            ? (isZh ? `已选 ${selectedVisibleIds.length} 条价格快照` : `${selectedVisibleIds.length} price snapshots selected`)
            : (isZh ? "勾选测试数据后可批量删除；只删除价格快照，不删除门店或竞品商品。" : "Select test rows to bulk delete. Stores and competitor products are not deleted.")}
        </div>
        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          disabled={selectedVisibleIds.length === 0 || loading}
          className="inline-flex h-9 items-center gap-2 whitespace-nowrap rounded-md border border-red-200 bg-white px-3 text-sm font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Trash2 className="h-4 w-4" />
          {isZh ? "批量删除" : "Bulk Delete"}
        </button>
      </div>

      {confirmOpen ? (
        <ConfirmDeletePanel
          title={isZh ? "删除价格快照" : "Delete Price Snapshots"}
          description={isZh
            ? `确认删除已选 ${selectedVisibleIds.length} 条门店价格快照？这不会删除门店档案、竞品商品或巡店记录。`
            : `Delete ${selectedVisibleIds.length} selected store price snapshots? This will not delete stores, competitor products, or store visits.`}
          confirmLabel={isZh ? "确认删除" : "Confirm Delete"}
          cancelLabel={isZh ? "取消" : "Cancel"}
          loading={loading}
          onConfirm={deleteSelected}
          onCancel={() => {
            if (!loading) setConfirmOpen(false);
          }}
        />
      ) : null}

      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      {notice ? <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</div> : null}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1560px] text-left text-sm">
          <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
            <tr>
              <th className="w-10 py-2 pr-3">
                <input
                  type="checkbox"
                  aria-label={isZh ? "选择全部价格快照" : "Select all price snapshots"}
                  checked={allSelected}
                  onChange={(event) => toggleAll(event.target.checked)}
                  className="h-4 w-4 rounded border-slate-300"
                />
              </th>
              <th className="py-2 pr-3">{isZh ? "采集时间" : "Captured"}</th>
              <th className="py-2 pr-3">{isZh ? "品牌" : "Brand"}</th>
              <th className="py-2 pr-3">{isZh ? "商品" : "Product"}</th>
              <th className="py-2 pr-3">{isZh ? "渠道" : "Channel"}</th>
              <th className="py-2 pr-3">{isZh ? "标价" : "List"}</th>
              <th className="py-2 pr-3">{isZh ? "包装价" : "Package"}</th>
              <th className="py-2 pr-3">{isZh ? "券" : "Voucher"}</th>
              <th className="py-2 pr-3">{isZh ? "到手价" : "Net"}</th>
              <th className="py-2 pr-3">{isZh ? "单片价" : "IDR/pc"}</th>
              <th className="py-2 pr-3">{isZh ? "门店名称" : "Store"}</th>
              <th className="py-2 pr-3">{isZh ? "省" : "Province"}</th>
              <th className="py-2 pr-3">{isZh ? "市" : "City"}</th>
              <th className="py-2 pr-3">{isZh ? "区" : "District"}</th>
              <th className="py-2 pr-3">{isZh ? "采集人" : "Collector"}</th>
              <th className="py-2 pr-3">{isZh ? "创建时间" : "Create Time"}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {visibleSnapshots.map((snapshot) => {
              const sku = snapshot.competitor_products?.sku_matches?.[0]?.sku_master;
              const underFloor = sku && snapshot.price_per_piece < sku.floor_price_per_piece;
              const underTarget = sku && snapshot.price_per_piece < sku.target_price_per_piece * 0.92;
              const region = storeRegionForSnapshot(snapshot);
              return (
                <tr key={snapshot.id} className={underFloor ? "bg-red-50" : underTarget ? "bg-yellow-50" : undefined}>
                  <td className="py-3 pr-3">
                    <input
                      type="checkbox"
                      aria-label={isZh ? `选择${snapshot.competitor_products?.normalized_name ?? snapshot.id}` : `Select ${snapshot.competitor_products?.normalized_name ?? snapshot.id}`}
                      checked={selectedVisibleIds.includes(snapshot.id)}
                      onChange={(event) => toggleSnapshot(snapshot.id, event.target.checked)}
                      className="h-4 w-4 rounded border-slate-300"
                    />
                  </td>
                  <td className="py-3 pr-3">{formatSnapshotCapturedAt(snapshot)}</td>
                  <td className="py-3 pr-3 font-medium">{snapshot.competitor_products?.brands?.name}</td>
                  <td className="py-3 pr-3">{snapshot.competitor_products?.normalized_name}</td>
                  <td className="py-3 pr-3"><Badge>{channelLabel(snapshot.channel, locale)}</Badge></td>
                  <td className="py-3 pr-3">{formatIdr(snapshot.list_price_idr)}</td>
                  <td className="py-3 pr-3">{formatIdr(snapshot.promo_price_idr)}</td>
                  <td className="py-3 pr-3">{formatIdr(snapshot.voucher_value_idr)}</td>
                  <td className="py-3 pr-3">{formatIdr(snapshot.net_price_idr)}</td>
                  <td className="py-3 pr-3 font-semibold">{formatPricePerPiece(snapshot.price_per_piece)}</td>
                  <td className="py-3 pr-3">{storeNameForSnapshot(snapshot)}</td>
                  <td className="py-3 pr-3">{region.province ?? "-"}</td>
                  <td className="py-3 pr-3">{region.cityName ?? "-"}</td>
                  <td className="py-3 pr-3">{region.district ?? "-"}</td>
                  <td className="py-3 pr-3">{uploaderNameForSnapshot(snapshot)}</td>
                  <td className="py-3 pr-3">{formatSnapshotCreatedAt(snapshot)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ConfirmDeletePanel({
  title,
  description,
  confirmLabel,
  cancelLabel,
  loading,
  onConfirm,
  onCancel,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
  loading: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-4">
      <div className="font-semibold text-red-900">{title}</div>
      <p className="mt-1 text-sm text-red-700">{description}</p>
      <div className="mt-3 flex flex-wrap justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={loading}
          className="inline-flex h-9 items-center justify-center rounded-md border border-red-200 bg-white px-3 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-40"
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={loading}
          className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-red-600 px-3 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
          {confirmLabel}
        </button>
      </div>
    </div>
  );
}

"use client";

import { Ban, CheckCircle2, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui";
import type { OfflineStore } from "@/lib/types";

type StoreStatusFilter = "enabled" | "disabled" | "all";

type ConfirmDeletePanel = {
  stores: OfflineStore[];
  nextStatus: "enabled" | "disabled";
  title: string;
  description: string;
};

function isDisabledStore(store: OfflineStore) {
  return store.status === "disabled" || Boolean(store.disabled_at || store.deleted_at);
}

function statusHref(locale: string, status: StoreStatusFilter) {
  return status === "enabled" ? `/${locale}/offline-stores` : `/${locale}/offline-stores?status=${status}`;
}

export function StoreMasterTable({
  stores,
  locale,
  statusFilter,
}: {
  stores: OfflineStore[];
  locale: string;
  statusFilter: StoreStatusFilter;
}) {
  const router = useRouter();
  const isZh = locale === "zh";
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [changedIds, setChangedIds] = useState<Set<string>>(() => new Set());
  const [confirmTarget, setConfirmTarget] = useState<ConfirmDeletePanel | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const visibleStores = useMemo(() => stores.filter((store) => !changedIds.has(store.id)), [changedIds, stores]);
  const selectedVisibleStores = visibleStores.filter((store) => selectedIds.includes(store.id));
  const selectedVisibleIds = selectedIds.filter((id) => visibleStores.some((store) => store.id === id));
  const allSelected = visibleStores.length > 0 && selectedVisibleIds.length === visibleStores.length;
  const disabling = statusFilter !== "disabled";

  function toggleStore(id: string, checked: boolean) {
    setSelectedIds((current) => checked ? Array.from(new Set([...current, id])) : current.filter((item) => item !== id));
  }

  function toggleAll(checked: boolean) {
    setSelectedIds(checked ? visibleStores.map((store) => store.id) : []);
  }

  function singleDisable(store: OfflineStore) {
    openConfirm([store], "disabled", isZh
      ? "\u7981\u7528\u95e8\u5e97"
      : "Disable Store", isZh
      ? `\u786e\u8ba4\u7981\u7528\u95e8\u5e97\u300c${store.name}\u300d\uff1f\u5386\u53f2\u5de1\u5e97\u8bb0\u5f55\u4e0d\u4f1a\u53d8\u5316\uff0c\u65b0\u589e\u5de1\u5e97\u9ed8\u8ba4\u4e0d\u518d\u9009\u5230\u5b83\u3002`
      : `Disable store "${store.name}"? Existing visits will not change, and new visits will not select it by default.`);
  }

  function singleEnable(store: OfflineStore) {
    openConfirm([store], "enabled", isZh
      ? "\u542f\u7528\u95e8\u5e97"
      : "Enable Store", isZh
      ? `\u786e\u8ba4\u91cd\u65b0\u542f\u7528\u95e8\u5e97\u300c${store.name}\u300d\uff1f\u5b83\u4f1a\u56de\u5230\u9ed8\u8ba4\u95e8\u5e97\u5217\u8868\u548c\u5de1\u5e97\u9009\u62e9\u3002`
      : `Enable store "${store.name}"? It will return to the default store list and field capture selection.`);
  }

  function bulkDisable() {
    if (selectedVisibleIds.length === 0) return;
    const nextStatus = disabling ? "disabled" : "enabled";
    openConfirm(selectedVisibleStores, nextStatus, disabling
      ? (isZh ? "\u6279\u91cf\u7981\u7528\u95e8\u5e97" : "Bulk Disable")
      : (isZh ? "\u6279\u91cf\u542f\u7528\u95e8\u5e97" : "Bulk Enable"), disabling
      ? (isZh
          ? `\u786e\u8ba4\u7981\u7528\u5df2\u9009 ${selectedVisibleIds.length} \u5bb6\u95e8\u5e97\uff1f\u5386\u53f2\u5de1\u5e97\u8bb0\u5f55\u4e0d\u4f1a\u53d8\u5316\u3002`
          : `Disable ${selectedVisibleIds.length} selected stores? Existing visits will not change.`)
      : (isZh
          ? `\u786e\u8ba4\u542f\u7528\u5df2\u9009 ${selectedVisibleIds.length} \u5bb6\u95e8\u5e97\uff1f`
          : `Enable ${selectedVisibleIds.length} selected stores?`));
  }

  function openConfirm(targetStores: OfflineStore[], nextStatus: "enabled" | "disabled", title: string, description: string) {
    setError(null);
    setNotice(null);
    setConfirmTarget({ stores: targetStores, nextStatus, title, description });
  }

  function storeStatusPayload(target: ConfirmDeletePanel) {
    return {
      ids: target.stores.map((store) => store.id),
      status: target.nextStatus,
      stores: target.stores.map((store) => ({
        id: store.id,
        name: store.name,
        city: store.city,
        channel_type: store.channel_type,
        channel_id: store.channel_id,
        address: store.address,
      })),
    };
  }

  async function confirmStatusChange() {
    if (!confirmTarget || loading) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/offline-stores", {
        method: confirmTarget.nextStatus === "disabled" ? "DELETE" : "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(storeStatusPayload(confirmTarget)),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(payload.error ?? (isZh ? "\u72b6\u6001\u66f4\u65b0\u5931\u8d25\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5\u3002" : "Status update failed. Please retry."));
        return;
      }

      setChangedIds((current) => {
        const next = new Set(current);
        confirmTarget.stores.forEach((store) => next.add(store.id));
        return next;
      });
      const targetIds = confirmTarget.stores.map((store) => store.id);
      setSelectedIds((current) => current.filter((id) => !targetIds.includes(id)));
      const count = payload.disabled_count ?? payload.updated_count ?? confirmTarget.stores.length;
      setNotice(confirmTarget.nextStatus === "disabled"
        ? (isZh ? `\u5df2\u7981\u7528 ${count} \u5bb6\u95e8\u5e97\u3002` : `${count} stores disabled.`)
        : (isZh ? `\u5df2\u542f\u7528 ${count} \u5bb6\u95e8\u5e97\u3002` : `${count} stores enabled.`));
      setConfirmTarget(null);
      router.refresh();
    } catch {
      setError(isZh ? "\u7f51\u7edc\u5f02\u5e38\uff0c\u72b6\u6001\u6ca1\u6709\u63d0\u4ea4\u6210\u529f\u3002" : "Network error. Status was not submitted.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <StatusLink href={statusHref(locale, "enabled")} active={statusFilter === "enabled"} label={isZh ? "\u542f\u7528\u72b6\u6001" : "Enabled"} />
          <StatusLink href={statusHref(locale, "disabled")} active={statusFilter === "disabled"} label={isZh ? "\u7981\u7528\u72b6\u6001" : "Disabled"} />
          <StatusLink href={statusHref(locale, "all")} active={statusFilter === "all"} label={isZh ? "\u5168\u90e8" : "All"} />
        </div>
        <button
          type="button"
          onClick={bulkDisable}
          disabled={selectedVisibleIds.length === 0 || loading}
          className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {disabling ? <Ban className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
          {disabling ? (isZh ? "\u6279\u91cf\u7981\u7528" : "Bulk Disable") : (isZh ? "\u6279\u91cf\u542f\u7528" : "Bulk Enable")}
        </button>
      </div>

      <div className="text-sm text-slate-600">
        {selectedVisibleIds.length > 0
          ? (isZh ? `\u5df2\u9009 ${selectedVisibleIds.length} \u5bb6\u95e8\u5e97` : `${selectedVisibleIds.length} stores selected`)
          : (isZh ? "\u9ed8\u8ba4\u53ea\u663e\u793a\u542f\u7528\u95e8\u5e97\uff1b\u7981\u7528\u95e8\u5e97\u4e0d\u4f1a\u51fa\u73b0\u5728\u5de1\u5e97\u9009\u62e9\u4e2d\u3002" : "Enabled stores are shown by default. Disabled stores are hidden from field capture selection.")}
      </div>

      {confirmTarget ? (
        <ConfirmDeletePanel
          title={confirmTarget.title}
          description={confirmTarget.description}
          loading={loading}
          confirmLabel={confirmTarget.nextStatus === "disabled" ? (isZh ? "\u786e\u8ba4\u7981\u7528" : "Confirm Disable") : (isZh ? "\u786e\u8ba4\u542f\u7528" : "Confirm Enable")}
          cancelLabel={isZh ? "\u53d6\u6d88" : "Cancel"}
          onConfirm={confirmStatusChange}
          onCancel={() => {
            if (!loading) setConfirmTarget(null);
          }}
        />
      ) : null}

      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      {notice ? <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</div> : null}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
            <tr>
              <th className="w-10 py-2 pr-3">
                <input
                  type="checkbox"
                  aria-label={isZh ? "\u9009\u62e9\u5168\u90e8\u95e8\u5e97" : "Select all stores"}
                  checked={allSelected}
                  onChange={(event) => toggleAll(event.target.checked)}
                  className="h-4 w-4 rounded border-slate-300"
                />
              </th>
              <th className="py-2 pr-3">{isZh ? "\u95e8\u5e97" : "Store"}</th>
              <th className="py-2 pr-3">{isZh ? "\u72b6\u6001" : "Status"}</th>
              <th className="py-2 pr-3">{isZh ? "\u57ce\u5e02" : "City"}</th>
              <th className="py-2 pr-3">{isZh ? "\u6240\u5c5e\u6e20\u9053" : "Channel"}</th>
              <th className="py-2 pr-3">{isZh ? "\u5730\u5740" : "Address"}</th>
              <th className="py-2 pr-3">{isZh ? "\u64cd\u4f5c" : "Actions"}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {visibleStores.map((store) => {
              const disabled = isDisabledStore(store);
              return (
                <tr key={store.id}>
                  <td className="py-3 pr-3">
                    <input
                      type="checkbox"
                      aria-label={isZh ? `\u9009\u62e9${store.name}` : `Select ${store.name}`}
                      checked={selectedVisibleIds.includes(store.id)}
                      onChange={(event) => toggleStore(store.id, event.target.checked)}
                      className="h-4 w-4 rounded border-slate-300"
                    />
                  </td>
                  <td className="py-3 pr-3 font-medium">{store.name}</td>
                  <td className="py-3 pr-3">
                    <Badge tone={disabled ? "medium" : "low"}>{disabled ? (isZh ? "\u7981\u7528" : "Disabled") : (isZh ? "\u542f\u7528" : "Enabled")}</Badge>
                  </td>
                  <td className="py-3 pr-3">{store.city}</td>
                  <td className="py-3 pr-3"><Badge>{store.channels?.name ?? store.channel_type}</Badge></td>
                  <td className="py-3 pr-3">{store.address ?? "-"}</td>
                  <td className="py-3 pr-3">
                    <button
                      type="button"
                      onClick={() => disabled ? singleEnable(store) : singleDisable(store)}
                      disabled={loading}
                      className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                    >
                      {disabled ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Ban className="h-3.5 w-3.5" />}
                      {disabled ? (isZh ? "\u542f\u7528" : "Enable") : (isZh ? "\u7981\u7528" : "Disable")}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatusLink({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      className={active
        ? "rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white"
        : "rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"}
    >
      {label}
    </Link>
  );
}

function ConfirmDeletePanel({
  title,
  description,
  loading,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}: {
  title: string;
  description: string;
  loading: boolean;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900">
      <div className="font-semibold">{title}</div>
      <div className="mt-1">{description}</div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onConfirm}
          disabled={loading}
          className="inline-flex h-8 items-center gap-2 rounded-md bg-slate-900 px-3 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Ban className="h-3.5 w-3.5" />}
          {confirmLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={loading}
          className="h-8 rounded-md border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {cancelLabel}
        </button>
      </div>
    </div>
  );
}

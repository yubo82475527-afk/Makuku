"use client";

import { Loader2, Pencil, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui";
import { formatIdr, formatJakartaTime, formatPricePerPiece } from "@/lib/format";
import type { CompetitorProduct, MaterialMaster, PriceSnapshot } from "@/lib/types";

type SnapshotOwnerType = "makuku" | "competitor";

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

export function PriceSnapshotsTable({
  snapshots,
  products,
  materials,
  locale,
}: {
  snapshots: PriceSnapshot[];
  products: CompetitorProduct[];
  materials: MaterialMaster[];
  locale: string;
}) {
  const router = useRouter();
  const isZh = locale === "zh";
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [deletedIds, setDeletedIds] = useState<Set<string>>(() => new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [adjustingSnapshot, setAdjustingSnapshot] = useState<PriceSnapshot | null>(null);
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
            : (isZh ? "勾选测试数据后可批量删除；只删除价格快照，不删除门店或商品主数据。" : "Select test rows to bulk delete. Stores and product master data are not deleted.")}
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
            ? `确认删除已选 ${selectedVisibleIds.length} 条门店价格快照？这不会删除门店档案、商品主数据或巡店记录。`
            : `Delete ${selectedVisibleIds.length} selected store price snapshots? This will not delete stores, product master data, or store visits.`}
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
        <table className="w-full min-w-[1880px] text-left text-sm">
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
              <th className="py-2 pr-3">{isZh ? "商品类型" : "Product Type"}</th>
              <th className="py-2 pr-3">{isZh ? "品牌" : "Brand"}</th>
              <th className="py-2 pr-3">{isZh ? "商品" : "Product"}</th>
              <th className="py-2 pr-3">{isZh ? "渠道" : "Channel"}</th>
              <th className="py-2 pr-3">{isZh ? "标价" : "List"}</th>
              <th className="py-2 pr-3">{isZh ? "包装价" : "Package"}</th>
              <th className="py-2 pr-3">{isZh ? "券" : "Voucher"}</th>
              <th className="py-2 pr-3">{isZh ? "到手价" : "Net"}</th>
              <th className="py-2 pr-3">{isZh ? "单片价" : "IDR/pc"}</th>
              <th className="py-2 pr-3">SKU ID</th>
              <th className="py-2 pr-3">{isZh ? "门店名称" : "Store"}</th>
              <th className="py-2 pr-3">{isZh ? "省" : "Province"}</th>
              <th className="py-2 pr-3">{isZh ? "市" : "City"}</th>
              <th className="py-2 pr-3">{isZh ? "区" : "District"}</th>
              <th className="py-2 pr-3">{isZh ? "采集人" : "Collector"}</th>
              <th className="py-2 pr-3">{isZh ? "创建时间" : "Create Time"}</th>
              <th className="py-2 pr-3">{isZh ? "操作" : "Action"}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {visibleSnapshots.map((snapshot) => {
              const sku = snapshotMakukuSku(snapshot);
              const underFloor = sku && snapshot.price_per_piece < sku.floor_price_per_piece;
              const underTarget = sku && snapshot.price_per_piece < sku.target_price_per_piece * 0.92;
              const region = storeRegionForSnapshot(snapshot);
              return (
                <tr key={snapshot.id} className={underFloor ? "bg-red-50" : underTarget ? "bg-yellow-50" : undefined}>
                  <td className="py-3 pr-3">
                    <input
                      type="checkbox"
                      aria-label={isZh ? `选择${snapshotProductName(snapshot)}` : `Select ${snapshotProductName(snapshot)}`}
                      checked={selectedVisibleIds.includes(snapshot.id)}
                      onChange={(event) => toggleSnapshot(snapshot.id, event.target.checked)}
                      className="h-4 w-4 rounded border-slate-300"
                    />
                  </td>
                  <td className="py-3 pr-3">{formatSnapshotCapturedAt(snapshot)}</td>
                  <td className="py-3 pr-3">
                    <Badge>{ownerTypeLabel(snapshotOwnerType(snapshot), locale)}</Badge>
                  </td>
                  <td className="py-3 pr-3 font-medium">{snapshotBrandName(snapshot)}</td>
                  <td className="py-3 pr-3">{snapshotProductName(snapshot)}</td>
                  <td className="py-3 pr-3"><Badge>{channelLabel(snapshot.channel, locale)}</Badge></td>
                  <td className="py-3 pr-3">{formatIdr(snapshot.list_price_idr)}</td>
                  <td className="py-3 pr-3">{formatIdr(snapshot.promo_price_idr)}</td>
                  <td className="py-3 pr-3">{formatIdr(snapshot.voucher_value_idr)}</td>
                  <td className="py-3 pr-3">{formatIdr(snapshot.net_price_idr)}</td>
                  <td className="py-3 pr-3 font-semibold">{formatPricePerPiece(snapshot.price_per_piece)}</td>
                  <td className="py-3 pr-3 font-mono text-xs">{snapshotMakukuMaterialCode(snapshot)}</td>
                  <td className="py-3 pr-3">{storeNameForSnapshot(snapshot)}</td>
                  <td className="py-3 pr-3">{region.province ?? "-"}</td>
                  <td className="py-3 pr-3">{region.cityName ?? "-"}</td>
                  <td className="py-3 pr-3">{region.district ?? "-"}</td>
                  <td className="py-3 pr-3">{uploaderNameForSnapshot(snapshot)}</td>
                  <td className="py-3 pr-3">{formatSnapshotCreatedAt(snapshot)}</td>
                  <td className="py-3 pr-3">
                    <button
                      type="button"
                      onClick={() => setAdjustingSnapshot(snapshot)}
                      className="inline-flex h-8 items-center gap-1 whitespace-nowrap rounded-md border border-slate-300 bg-white px-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      {isZh ? "调整关联" : "Adjust"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {adjustingSnapshot ? (
        <AdjustmentDialog
          snapshot={adjustingSnapshot}
          products={products}
          materials={materials}
          locale={locale}
          onClose={() => setAdjustingSnapshot(null)}
          onSaved={() => {
            setAdjustingSnapshot(null);
            setNotice(isZh ? "已更新这条价格快照的商品归属。" : "Snapshot product owner updated.");
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}

function AdjustmentDialog({
  snapshot,
  products,
  materials,
  locale,
  onClose,
  onSaved,
}: {
  snapshot: PriceSnapshot;
  products: CompetitorProduct[];
  materials: MaterialMaster[];
  locale: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isZh = locale === "zh";
  const router = useRouter();
  const initialOwnerType = snapshotOwnerType(snapshot);
  const [ownerType, setOwnerType] = useState<SnapshotOwnerType>(initialOwnerType);
  const [productQuery, setProductQuery] = useState(formatProductLabel(snapshot.competitor_products));
  const [materialQuery, setMaterialQuery] = useState(formatMaterialLabelFromSnapshot(snapshot));
  const [competitorProductId, setCompetitorProductId] = useState(snapshot.competitor_product_id ?? "");
  const [material_sku_code, setMaterialSkuCode] = useState(snapshot.sku_master?.material_sku_code ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const productOptions = useMemo(() => {
    const query = normalize(productQuery);
    return products.filter((product) => !query || productMatchesSearch(product, query)).slice(0, 10);
  }, [products, productQuery]);

  const materialOptions = useMemo(() => {
    const query = normalize(materialQuery);
    return materials.filter((material) => !query || materialMatchesSearch(material, query)).slice(0, 10);
  }, [materials, materialQuery]);

  async function save() {
    if (saving) return;
    if (ownerType === "competitor" && !competitorProductId) {
      setError(isZh ? "请选择竞品商品。" : "Select a competitor product.");
      return;
    }
    if (ownerType === "makuku" && !material_sku_code) {
      setError(isZh ? "请选择 Makuku SKU。" : "Select a Makuku SKU.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/price-snapshots", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: snapshot.id,
          owner_type: ownerType,
          competitor_product_id: ownerType === "competitor" ? competitorProductId : null,
          material_sku_code: ownerType === "makuku" ? material_sku_code : null,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(payload.error ?? (isZh ? "保存失败，请重试。" : "Save failed. Please retry."));
        return;
      }
      router.refresh();
      onSaved();
    } catch {
      setError(isZh ? "网络异常，保存没有提交成功。" : "Network error. Save was not submitted.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-3xl rounded-lg bg-white p-4 shadow-xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold text-slate-900">{isZh ? "调整价格快照归属" : "Adjust Snapshot Owner"}</h3>
            <p className="mt-1 text-sm text-slate-500">
              {isZh ? "一条价格快照只能归属 Makuku SKU 或竞品商品，不会修改竞品映射管理。" : "A snapshot can belong to either a Makuku SKU or a competitor product. Competitor mapping is not updated."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100"
            aria-label={isZh ? "关闭" : "Close"}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 inline-flex rounded-md border border-slate-200 bg-slate-50 p-1">
          {(["competitor", "makuku"] as const).map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setOwnerType(type)}
              className={`h-9 rounded px-3 text-sm font-medium ${ownerType === type ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}
            >
              {ownerTypeLabel(type, locale)}
            </button>
          ))}
        </div>

        <div className="mt-4">
          {ownerType === "competitor" ? (
            <SearchPanel
              label={isZh ? "竞品商品（必填）" : "Competitor Product (required)"}
              value={productQuery}
              onChange={(value) => {
                setProductQuery(value);
                setCompetitorProductId("");
              }}
              placeholder={isZh ? "搜索品牌 / 商品名 / 尺码 / 片数" : "Search brand / product / size / pieces"}
            >
              {productOptions.map((product) => (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => {
                    setCompetitorProductId(product.id);
                    setProductQuery(formatProductLabel(product));
                  }}
                  className={`block w-full rounded-md px-3 py-2 text-left text-sm hover:bg-slate-50 ${competitorProductId === product.id ? "bg-slate-100" : ""}`}
                >
                  <span className="block font-medium text-slate-900">{formatProductLabel(product)}</span>
                  <span className="mt-0.5 block text-xs text-slate-500">
                    {[product.pack_type, product.size, product.piece_count ? `${product.piece_count} pcs` : null].filter(Boolean).join(" / ")}
                  </span>
                </button>
              ))}
            </SearchPanel>
          ) : (
            <SearchPanel
              label={isZh ? "Makuku SKU（必填）" : "Makuku SKU (required)"}
              value={materialQuery}
              onChange={(value) => {
                setMaterialQuery(value);
                setMaterialSkuCode("");
              }}
              placeholder={isZh ? "搜索物料编码 / 商品名 / 系列 / 尺码" : "Search material code / name / series / size"}
            >
              {materialOptions.map((material) => (
                <button
                  key={material.tenant_sku_code}
                  type="button"
                  onClick={() => {
                    setMaterialSkuCode(material.tenant_sku_code);
                    setMaterialQuery(formatMaterialLabel(material));
                  }}
                  className={`block w-full rounded-md px-3 py-2 text-left text-sm hover:bg-slate-50 ${material_sku_code === material.tenant_sku_code ? "bg-slate-100" : ""}`}
                >
                  <span className="block font-medium text-slate-900">{formatMaterialLabel(material)}</span>
                  <span className="mt-0.5 block text-xs text-slate-500">
                    {[material.sub_brand, material.sub_category, material.sub_type, material.pack_count ? `${material.pack_count} pcs` : null].filter(Boolean).join(" / ")}
                  </span>
                </button>
              ))}
            </SearchPanel>
          )}
        </div>

        {error ? <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="inline-flex h-9 items-center justify-center rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {isZh ? "取消" : "Cancel"}
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-slate-900 px-3 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {isZh ? "保存" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

function SearchPanel({
  label,
  value,
  placeholder,
  children,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  children: ReactNode;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="text-sm font-medium text-slate-700">
        {label}
        <input
          type="search"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:border-slate-500"
        />
      </label>
      <div className="mt-2 max-h-72 overflow-y-auto rounded-md border border-slate-200 p-1">
        {children}
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

function snapshotOwnerType(snapshot: PriceSnapshot): SnapshotOwnerType {
  return snapshot.sku_master_id && !snapshot.competitor_product_id ? "makuku" : "competitor";
}

function snapshotMakukuSku(snapshot: PriceSnapshot) {
  return snapshot.sku_master ?? snapshot.competitor_products?.sku_matches?.[0]?.sku_master ?? null;
}

function snapshotMakukuMaterialCode(snapshot: PriceSnapshot) {
  return cleanDisplayText(snapshot.sku_master?.material_sku_code)
    ?? cleanDisplayText(snapshot.competitor_products?.sku_matches?.[0]?.sku_master?.material_sku_code)
    ?? "-";
}

function snapshotBrandName(snapshot: PriceSnapshot) {
  return snapshotOwnerType(snapshot) === "makuku" ? "Makuku" : snapshot.competitor_products?.brands?.name ?? "-";
}

function snapshotProductName(snapshot: PriceSnapshot) {
  return snapshotOwnerType(snapshot) === "makuku"
    ? snapshot.sku_master?.makuku_sku_name ?? "-"
    : snapshot.competitor_products?.normalized_name ?? "-";
}

function ownerTypeLabel(ownerType: SnapshotOwnerType, locale: string) {
  if (ownerType === "makuku") return "Makuku SKU";
  return locale === "zh" ? "竞品商品" : "Competitor SKU";
}

function formatProductLabel(product: CompetitorProduct | null | undefined) {
  if (!product) return "";
  return [product.brands?.name, product.normalized_name || product.raw_title].filter(Boolean).join(" · ");
}

function formatMaterialLabel(material: MaterialMaster) {
  return `${material.tenant_sku_code} · ${material.tenant_sku_name}`;
}

function formatMaterialLabelFromSnapshot(snapshot: PriceSnapshot) {
  const sku = snapshot.sku_master ?? null;
  if (!sku?.material_sku_code) return "";
  return `${sku.material_sku_code} · ${sku.makuku_sku_name}`;
}

function productMatchesSearch(product: CompetitorProduct, query: string) {
  return [
    product.brands?.name,
    product.raw_title,
    product.normalized_name,
    product.size,
    product.piece_count,
    product.pack_type,
    product.package_type,
  ].some((value) => String(value ?? "").toLowerCase().includes(query));
}

function materialMatchesSearch(material: MaterialMaster, query: string) {
  return [
    material.tenant_sku_code,
    material.tenant_sku_name,
    material.category,
    material.sub_category,
    material.brand,
    material.sub_brand,
    material.type,
    material.sub_type,
    material.pack_count,
  ].some((value) => String(value ?? "").toLowerCase().includes(query));
}

function normalize(value: string) {
  return value.trim().toLowerCase();
}

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

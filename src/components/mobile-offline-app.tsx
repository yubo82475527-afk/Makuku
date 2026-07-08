"use client";

import {
  Building2,
  Camera,
  CheckCircle2,
  ChevronRight,
  Clock,
  ImageIcon,
  Loader2,
  LogIn,
  LogOut,
  Plus,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Locale } from "@/lib/i18n/config";
import type { OfflineImageType, OfflineStoreVisit, OfflineVisitImage } from "@/lib/types";

// ─── Types ───────────────────────────────────────────────────────────────────

type AppUser = {
  id: string;
  username: string;
  displayName: string;
  role: string;
};

type OfflineStore = {
  id: string;
  name: string;
  city: string;
  province?: string | null;
  city_name?: string | null;
  district?: string | null;
  channel_type: string;
  address?: string | null;
};

type BrandSlot = {
  id: string;
  brand: string;
  label: string;
  hint: string;
  imageType: OfflineImageType;
  tone: string;
  uploadedImageId?: string;
  status: "idle" | "uploading" | "analyzing" | "done" | "error";
  preview?: string;
  errorMsg?: string;
};

type Screen = "login" | "store-select" | "capture" | "waiting" | "my-visits" | "visit-detail";
type PreviewState = {
  status: "loading" | "ready" | "error";
  label: string;
  url?: string;
  error?: string;
};

const BRAND_SLOTS: Omit<BrandSlot, "status">[] = [
  { id: "makuku",   brand: "Makuku",   label: "MAKUKU",        hint: "自家货架/陈列/缺货",          imageType: "own_shelf",        tone: "bg-emerald-50 text-emerald-800 ring-emerald-200" },
  { id: "mamypoko", brand: "MamyPoko", label: "MamyPoko",      hint: "主货架/促销价签",             imageType: "competitor_shelf", tone: "bg-sky-50 text-sky-800 ring-sky-200" },
  { id: "sweety",   brand: "Sweety",   label: "Sweety",        hint: "堆头/价格牌",                imageType: "competitor_shelf", tone: "bg-pink-50 text-pink-800 ring-pink-200" },
  { id: "merries",  brand: "Merries",  label: "Merries",       hint: "低价 SKU/陈列面",            imageType: "competitor_shelf", tone: "bg-violet-50 text-violet-800 ring-violet-200" },
  { id: "pampers",  brand: "Pampers",  label: "Pampers",       hint: "促销牌/货架价",              imageType: "competitor_shelf", tone: "bg-amber-50 text-amber-800 ring-amber-200" },
  { id: "other",    brand: "Other",    label: "其他竞品/价签",  hint: "Goo.N 或单独价签",           imageType: "promo_tag",        tone: "bg-slate-100 text-slate-800 ring-slate-200" },
];

const STORAGE_KEY = "makuku_app_user";
const maxUploadBytes = 20 * 1024 * 1024;
const compressionMaxSide = 3000;
const compressionQuality = 0.9;

function loadUser(): AppUser | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AppUser) : null;
  } catch {
    return null;
  }
}

function saveUser(user: AppUser) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
}

function clearUser() {
  localStorage.removeItem(STORAGE_KEY);
}

function formatRegionLabel(region: {
  city?: string | null;
  province?: string | null;
  city_name?: string | null;
  district?: string | null;
} | null | undefined) {
  const structured = [region?.province, region?.city_name, region?.district]
    .map((value) => value?.trim())
    .filter(Boolean)
    .join(" / ");
  return structured || region?.city || "-";
}

function formatMb(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

function loadImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Unable to read image"));
    };
    image.src = url;
  });
}

async function prepareImageForUpload(file: File) {
  if (!file.type.startsWith("image/")) {
    throw new Error(`${file.name} is not an image.`);
  }
  if (file.size <= maxUploadBytes) return file;

  const image = await loadImage(file);
  const scale = Math.min(1, compressionMaxSide / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Image compression is not available in this browser.");
  ctx.drawImage(image, 0, 0, width, height);

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, "image/jpeg", compressionQuality);
  });
  if (!blob) throw new Error("Image compression failed.");

  const safeName = file.name.replace(/\.[^.]+$/, "") || "store-photo";
  return new File([blob], `${safeName}.jpg`, {
    type: "image/jpeg",
    lastModified: Date.now(),
  });
}

// ─── Root component ───────────────────────────────────────────────────────────

export function MobileOfflineApp({ locale }: { locale: Locale }) {
  const [screen, setScreen] = useState<Screen>("login");
  const [user, setUser] = useState<AppUser | null>(null);
  const [selectedStore, setSelectedStore] = useState<OfflineStore | null>(null);
  const [visitId, setVisitId] = useState<string | null>(null);
  const [selectedVisit, setSelectedVisit] = useState<OfflineStoreVisit | null>(null);

  useEffect(() => {
    const timeout = setTimeout(() => {
      const stored = loadUser();
      if (stored) {
        setUser(stored);
        setScreen("store-select");
      }
    }, 0);
    return () => clearTimeout(timeout);
  }, []);

  function handleLogin(u: AppUser) {
    saveUser(u);
    setUser(u);
    setScreen("store-select");
  }

  function handleStoreSelected(store: OfflineStore) {
    setSelectedStore(store);
    setScreen("capture");
  }

  function handleCaptureComplete(id: string) {
    setVisitId(id);
    setScreen("waiting");
  }

  function handleLogout() {
    clearUser();
    setUser(null);
    setSelectedStore(null);
    setVisitId(null);
    setSelectedVisit(null);
    setScreen("login");
  }

  function handleNewStore() {
    setSelectedStore(null);
    setVisitId(null);
    setSelectedVisit(null);
    setScreen("store-select");
  }

  function handleViewVisit(visit: OfflineStoreVisit) {
    setSelectedVisit(visit);
    setScreen("visit-detail");
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col bg-slate-100 text-slate-950">
      {screen === "login" && <LoginScreen onLogin={handleLogin} />}
      {screen === "store-select" && user && (
        <StoreSelectScreen user={user} onStoreSelected={handleStoreSelected} onLogout={handleLogout} onOpenMyVisits={() => setScreen("my-visits")} />
      )}
      {screen === "capture" && user && selectedStore && (
        <PhotoCaptureScreen locale={locale} user={user} store={selectedStore} onComplete={handleCaptureComplete} onBack={() => setScreen("store-select")} />
      )}
      {screen === "waiting" && visitId && (
        <WaitingScreen visitId={visitId} onNewStore={handleNewStore} onViewVisit={handleViewVisit} />
      )}
      {screen === "my-visits" && user && (
        <MyVisitsScreen user={user} onBack={() => setScreen("store-select")} onViewVisit={handleViewVisit} />
      )}
      {screen === "visit-detail" && selectedVisit && (
        <MobileVisitDetailScreen visit={selectedVisit} onBack={() => setScreen("my-visits")} />
      )}
    </div>
  );
}

// ─── Login Screen ─────────────────────────────────────────────────────────────

function LoginScreen({ onLogin }: { onLogin: (u: AppUser) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (!username || !password) { setError("请输入用户名和密码"); return; }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error ?? "登录失败"); return; }
      onLogin(data.user as AppUser);
    } catch {
      setError("网络错误，请重试");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-12">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-900 text-white text-2xl font-bold">M</div>
        <h1 className="text-2xl font-bold">Makuku CI</h1>
        <p className="mt-1 text-sm text-slate-500">门店巡查采集系统</p>
      </div>
      <div className="w-full rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
        {error && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">用户名</label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            placeholder="输入用户名"
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">密码</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            placeholder="输入密码"
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
          />
        </div>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={loading}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-md bg-slate-900 text-sm font-semibold text-white disabled:opacity-60"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
          {loading ? "登录中..." : "登录"}
        </button>
      </div>
    </div>
  );
}

// ─── Store Select Screen ──────────────────────────────────────────────────────

function StoreSelectScreen({
  user,
  onStoreSelected,
  onLogout,
  onOpenMyVisits,
}: {
  user: AppUser;
  onStoreSelected: (store: OfflineStore) => void;
  onLogout: () => void;
  onOpenMyVisits: () => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<OfflineStore[]>([]);
  const [searching, setSearching] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback(async (q: string) => {
    setSearching(true);
    try {
      const res = await fetch(`/api/offline-stores?q=${encodeURIComponent(q)}`);
      const data = await res.json().catch(() => ({ stores: [] }));
      setResults(data.stores ?? []);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(query), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, search]);

  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white px-4 py-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">选择门店</h1>
            <p className="mt-0.5 text-sm text-slate-500">你好，{user.displayName}</p>
          </div>
          <button type="button" onClick={onLogout} className="flex items-center gap-1.5 rounded-md border border-slate-200 px-3 py-1.5 text-xs text-slate-600">
            <LogOut className="h-3.5 w-3.5" />
            退出
          </button>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 rounded-lg bg-slate-100 p-1 text-sm font-medium">
          <button type="button" className="rounded-md bg-white px-3 py-2 text-slate-900 shadow-sm">
            门店走查
          </button>
          <button type="button" onClick={onOpenMyVisits} className="rounded-md px-3 py-2 text-slate-500">
            我的提交
          </button>
        </div>
        <div className="relative mt-3">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索门店名称或城市..."
            className="w-full rounded-md border border-slate-300 bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
          />
          {searching && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-slate-400" />}
        </div>
      </header>

      <main className="flex-1 space-y-2 overflow-y-auto px-4 py-4 pb-28">
        {results.length === 0 && !searching && (
          <p className="py-8 text-center text-sm text-slate-500">未找到门店，可新建</p>
        )}
        {results.map((store) => (
          <button
            key={store.id}
            type="button"
            onClick={() => onStoreSelected(store)}
            className="flex w-full items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 text-left shadow-sm"
          >
            <div className="min-w-0">
              <div className="truncate font-medium text-sm">{store.name}</div>
              <div className="text-xs text-slate-500">{formatRegionLabel(store)} / {store.channel_type}</div>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
          </button>
        ))}
      </main>

      <div className="fixed inset-x-0 bottom-0 z-20 mx-auto max-w-md border-t border-slate-200 bg-white px-4 py-3">
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-md bg-slate-900 text-sm font-semibold text-white"
        >
          <Plus className="h-4 w-4" />
          新建门店
        </button>
      </div>

      {showCreate && (
        <CreateStoreSheet
          onClose={() => setShowCreate(false)}
          onCreated={(store) => { setShowCreate(false); onStoreSelected(store); }}
        />
      )}
    </div>
  );
}

function CreateStoreSheet({ onClose, onCreated }: { onClose: () => void; onCreated: (store: OfflineStore) => void }) {
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [channelType, setChannelType] = useState("modern_trade");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    if (!name || !city) { setError("请填写门店名称和城市"); return; }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/offline-stores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, city, channel_type: channelType }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error ?? "创建失败"); return; }
      onCreated(data.store as OfflineStore);
    } catch {
      setError("网络错误");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/40">
      <div className="w-full max-w-md mx-auto rounded-t-2xl bg-white p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-lg">新建门店</h2>
          <button type="button" onClick={onClose}><X className="h-5 w-5 text-slate-400" /></button>
        </div>
        {error && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>}
        <div className="space-y-3">
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="门店名称 *" className="w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-slate-500" />
          <input type="text" value={city} onChange={(e) => setCity(e.target.value)} placeholder="城市 *" className="w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-slate-500" />
          <select value={channelType} onChange={(e) => setChannelType(e.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-slate-500 bg-white">
            <option value="modern_trade">Modern trade</option>
            <option value="baby_store">Baby store</option>
            <option value="pharmacy">Pharmacy</option>
            <option value="general_trade">General trade</option>
            <option value="other">Other</option>
          </select>
        </div>
        <button
          type="button"
          onClick={handleCreate}
          disabled={loading}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-md bg-slate-900 text-sm font-semibold text-white disabled:opacity-60"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Building2 className="h-4 w-4" />}
          {loading ? "创建中..." : "创建门店"}
        </button>
      </div>
    </div>
  );
}

// ─── Photo Capture Screen ─────────────────────────────────────────────────────

function PhotoCaptureScreen({
  locale,
  user,
  store,
  onComplete,
  onBack,
}: {
  locale: Locale;
  user: AppUser;
  store: OfflineStore;
  onComplete: (visitId: string) => void;
  onBack: () => void;
}) {
  const [visitId, setVisitId] = useState<string | null>(null);
  const [slots, setSlots] = useState<BrandSlot[]>(() =>
    BRAND_SLOTS.map((s) => ({ ...s, status: "idle" as const }))
  );
  const [promoFiles, setPromoFiles] = useState<{ preview: string; status: "uploading" | "done" | "error"; id?: string }[]>([]);
  const promoRef = useRef<HTMLInputElement>(null);

  const hasAnyPhoto = slots.some((s) => s.status !== "idle") || promoFiles.length > 0;
  const allDone = slots.every((s) => s.status !== "uploading") && promoFiles.every((p) => p.status !== "uploading");

  // Ensure visit exists before first upload
  async function ensureVisit(): Promise<string | null> {
    if (visitId) return visitId;
    try {
      const res = await fetch("/api/offline-store-visits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          store_name: store.name,
          city: store.city,
          channel_type: store.channel_type,
          uploader_name: user.displayName,
          uploader_user_id: user.id,
          store_id: store.id,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return null;
      const id = data.visit?.id as string;
      setVisitId(id);
      return id;
    } catch {
      return null;
    }
  }

  async function uploadSlotFile(slotId: string, file: File) {
    setSlots((prev) => prev.map((s) => s.id === slotId ? { ...s, status: "uploading", preview: URL.createObjectURL(file), errorMsg: undefined } : s));
    const vid = await ensureVisit();
    if (!vid) {
      setSlots((prev) => prev.map((s) => s.id === slotId ? { ...s, status: "error", errorMsg: "无法创建采集单" } : s));
      return;
    }
    const slot = BRAND_SLOTS.find((s) => s.id === slotId)!;
    const formData = new FormData();
    formData.set("image_type", slot.imageType);
    formData.set("target_brand", slot.brand);
    try {
      const uploadFile = await prepareImageForUpload(file);
      if (uploadFile.size > maxUploadBytes) {
        throw new Error(`Photo is still ${formatMb(uploadFile.size)} after compression. Please choose a smaller photo.`);
      }
      formData.set("image", uploadFile);
      formData.set("json", "1");
      formData.set("auto_analyze", "1");
      formData.set("return_to", `/${locale}/mobile/offline-capture`);
      const res = await fetch(`/api/offline-store-visits/${vid}/images`, { method: "POST", body: formData });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSlots((prev) => prev.map((s) => s.id === slotId ? { ...s, status: "error", errorMsg: data.error ?? "上传失败" } : s));
      } else {
        setSlots((prev) => prev.map((s) => s.id === slotId ? { ...s, status: "analyzing", uploadedImageId: data.image?.id } : s));
      }
    } catch {
      setSlots((prev) => prev.map((s) => s.id === slotId ? { ...s, status: "error", errorMsg: "上传失败" } : s));
    }
  }

  async function uploadPromoFile(file: File) {
    const preview = URL.createObjectURL(file);
    const idx = promoFiles.length;
    setPromoFiles((prev) => [...prev, { preview, status: "uploading" }]);
    const vid = await ensureVisit();
    if (!vid) {
      setPromoFiles((prev) => prev.map((p, i) => i === idx ? { ...p, status: "error" } : p));
      return;
    }
    const formData = new FormData();
    formData.set("image_type", "promo_tag");
    formData.set("target_brand", "Other");
    try {
      const uploadFile = await prepareImageForUpload(file);
      if (uploadFile.size > maxUploadBytes) {
        throw new Error(`Photo is still ${formatMb(uploadFile.size)} after compression. Please choose a smaller photo.`);
      }
      formData.set("image", uploadFile);
      formData.set("json", "1");
      formData.set("auto_analyze", "1");
      formData.set("return_to", `/${locale}/mobile/offline-capture`);
      const res = await fetch(`/api/offline-store-visits/${vid}/images`, { method: "POST", body: formData });
      const data = await res.json().catch(() => ({}));
      setPromoFiles((prev) => prev.map((p, i) => i === idx ? { ...p, status: res.ok ? "done" : "error", id: data.image?.id } : p));
    } catch {
      setPromoFiles((prev) => prev.map((p, i) => i === idx ? { ...p, status: "error" } : p));
    }
  }

  function handleComplete() {
    if (visitId) onComplete(visitId);
  }

  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white px-4 py-4">
        <div className="flex items-center gap-3">
          <button type="button" onClick={onBack} className="text-slate-500 text-sm">← 返回</button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-semibold">{store.name}</h1>
            <p className="text-xs text-slate-500">{formatRegionLabel(store)} / {store.channel_type}</p>
          </div>
        </div>
      </header>

      <main className="flex-1 space-y-3 overflow-y-auto px-4 py-4 pb-28">
        <p className="text-sm text-slate-500 font-medium">品牌货架拍照</p>
        <div className="grid grid-cols-2 gap-3">
          {slots.map((slot) => (
            <BrandSlotCard key={slot.id} slot={slot} onFile={(file) => uploadSlotFile(slot.id, file)} />
          ))}
        </div>

        {/* Promo photos collapsible */}
        <PromoSection promoFiles={promoFiles} inputRef={promoRef} onFile={uploadPromoFile} />
      </main>

      <div className="fixed inset-x-0 bottom-0 z-20 mx-auto max-w-md border-t border-slate-200 bg-white px-4 py-3">
        <button
          type="button"
          onClick={handleComplete}
          disabled={!hasAnyPhoto || !allDone || !visitId}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-md bg-slate-900 text-sm font-semibold text-white disabled:opacity-40"
        >
          {!allDone ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
          完成，查看解析进度
        </button>
        {!hasAnyPhoto && <p className="mt-1.5 text-center text-xs text-slate-400">请至少拍摄一张照片</p>}
      </div>
    </div>
  );
}

function BrandSlotCard({ slot, onFile }: { slot: BrandSlot; onFile: (file: File) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);

  const statusColor =
    slot.status === "done" || slot.status === "analyzing" ? "border-emerald-400" :
    slot.status === "uploading" ? "border-blue-400" :
    slot.status === "error" ? "border-red-400" :
    "border-dashed border-slate-300";

  return (
    <div className={`relative rounded-xl border-2 bg-white p-3 shadow-sm ${statusColor}`}>
      <div className="mb-2 flex items-center gap-1.5">
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${slot.tone}`}>{slot.label}</span>
        {slot.status === "done" || slot.status === "analyzing" ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> : null}
      </div>
      <p className="text-xs text-slate-500 mb-3">{slot.hint}</p>

      {slot.preview ? (
        <div className="mb-2 relative h-24 w-full overflow-hidden rounded-lg bg-slate-100">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={slot.preview} alt={slot.label} className="h-full w-full object-cover" />
          {slot.status === "uploading" && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/30">
              <Loader2 className="h-6 w-6 animate-spin text-white" />
            </div>
          )}
        </div>
      ) : null}

      {slot.errorMsg && <p className="mb-1 text-xs text-red-600">{slot.errorMsg}</p>}

      <label className="flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-md bg-slate-900 text-xs font-medium text-white">
        <Camera className="h-3.5 w-3.5" />
        {slot.status === "idle" ? "拍照" : "重拍"}
        <input ref={inputRef} type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) { onFile(f); if (inputRef.current) inputRef.current.value = ""; } }} />
      </label>
    </div>
  );
}

function PromoSection({
  promoFiles,
  inputRef,
  onFile,
}: {
  promoFiles: { preview: string; status: string }[];
  inputRef: React.RefObject<HTMLInputElement | null>;
  onFile: (file: File) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-slate-700">
        促销照片（可选）{promoFiles.length > 0 ? <span className="ml-1 text-xs text-slate-400">{promoFiles.length} 张</span> : null}
        <ChevronRight className={`h-4 w-4 text-slate-400 transition-transform ${open ? "rotate-90" : ""}`} />
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-2">
          <div className="flex flex-wrap gap-2">
            {promoFiles.map((pf, i) => (
              <div key={i} className="relative h-16 w-16 overflow-hidden rounded-md bg-slate-100">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={pf.preview} alt="promo" className="h-full w-full object-cover" />
                {pf.status === "uploading" && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                    <Loader2 className="h-4 w-4 animate-spin text-white" />
                  </div>
                )}
              </div>
            ))}
          </div>
          <label className="flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-md border border-slate-300 text-xs font-medium text-slate-700">
            <Plus className="h-3.5 w-3.5" />
            添加促销照片
            <input ref={inputRef} type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) { onFile(f); if (inputRef.current) inputRef.current.value = ""; } }} />
          </label>
        </div>
      )}
    </div>
  );
}

// ─── Waiting Screen ───────────────────────────────────────────────────────────

function MyVisitsScreen({
  user,
  onBack,
  onViewVisit,
}: {
  user: AppUser;
  onBack: () => void;
  onViewVisit: (visit: OfflineStoreVisit) => void;
}) {
  const [visits, setVisits] = useState<OfflineStoreVisit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadVisits = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({
      uploader_user_id: user.id,
      uploader_name: user.displayName,
      limit: "50",
    });
    try {
      const res = await fetch(`/api/offline-store-visits?${params.toString()}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "无法加载提交记录");
        setVisits([]);
        return;
      }
      setVisits(data.visits ?? []);
    } catch {
      setError("网络错误，请重试");
      setVisits([]);
    } finally {
      setLoading(false);
    }
  }, [user.displayName, user.id]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      void loadVisits();
    }, 0);
    return () => clearTimeout(timeout);
  }, [loadVisits]);

  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white px-4 py-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">我的提交</h1>
            <p className="mt-0.5 text-sm text-slate-500">{user.displayName}</p>
          </div>
          <button type="button" onClick={onBack} className="rounded-md border border-slate-200 px-3 py-1.5 text-xs text-slate-600">
            返回采集
          </button>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 rounded-lg bg-slate-100 p-1 text-sm font-medium">
          <button type="button" onClick={onBack} className="rounded-md px-3 py-2 text-slate-500">
            门店走查
          </button>
          <button type="button" className="rounded-md bg-white px-3 py-2 text-slate-900 shadow-sm">
            我的提交
          </button>
        </div>
      </header>

      <main className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div> : null}
        {loading ? (
          <div className="py-8 text-center text-sm text-slate-500">
            <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
            正在加载提交记录...
          </div>
        ) : null}
        {!loading && visits.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
            暂无提交记录
          </div>
        ) : null}
        {visits.map((visit) => {
          const images = visit.offline_visit_images ?? [];
          return (
            <button
              key={visit.id}
              type="button"
              onClick={() => onViewVisit(visit)}
              className="w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-left shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">{visit.store_name}</div>
                  <div className="mt-1 text-xs text-slate-500">{formatRegionLabel(visit)} / {visit.channel_type} / {visit.visit_date}</div>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-700">{visit.visit_status}</span>
                <span className="text-slate-500">{images.length} 张图片</span>
                <span className="text-slate-500">{images.filter((image) => image.analysis_status === "pending" || image.analysis_status === "analyzing").length} 待处理</span>
              </div>
            </button>
          );
        })}
      </main>
    </div>
  );
}

function MobileVisitDetailScreen({
  visit,
  onBack,
}: {
  visit: OfflineStoreVisit;
  onBack: () => void;
}) {
  const images = visit.offline_visit_images ?? [];
  const [activeImage, setActiveImage] = useState<PreviewState | null>(null);

  async function fetchOriginalImageUrl(imageId: string) {
    const response = await fetch(`/api/offline-store-visits/${visit.id}/image-url?image_id=${encodeURIComponent(imageId)}`);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || typeof payload.url !== "string" || !payload.url) {
      throw new Error("Unable to load original image.");
    }
    return payload.url;
  }

  async function openOriginalImage(image: OfflineVisitImage) {
    setActiveImage({ status: "loading", label: image.file_name });
    try {
      const url = await fetchOriginalImageUrl(image.id);
      setActiveImage({ status: "ready", label: image.file_name, url });
    } catch (error) {
      setActiveImage({
        status: "error",
        label: image.file_name,
        error: error instanceof Error ? error.message : "Unable to load original image.",
      });
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white px-4 py-4">
        <div className="flex items-center gap-3">
          <button type="button" onClick={onBack} className="text-sm text-slate-500">
            ← 返回
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-semibold">{visit.store_name}</h1>
            <p className="text-xs text-slate-500">{formatRegionLabel(visit)} / {visit.visit_date}</p>
          </div>
        </div>
      </header>

      <main className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <div className="text-xs text-slate-500">状态</div>
              <div className="mt-1 font-medium">{visit.visit_status}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500">提交人</div>
              <div className="mt-1 font-medium">{visit.uploader_name}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500">渠道</div>
              <div className="mt-1 font-medium">{visit.channel_type}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500">图片数</div>
              <div className="mt-1 font-medium">{images.length}</div>
            </div>
          </div>
        </section>

        {images.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
            暂无上传图片
          </div>
        ) : null}

        {images.map((image) => (
          <section key={image.id} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            <div className="mb-2 flex items-center justify-between gap-2 text-xs">
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-700">{image.image_type.replaceAll("_", " ")}</span>
              <span className="text-slate-500">{image.analysis_status}</span>
            </div>
            <button
              type="button"
              onClick={() => void openOriginalImage(image)}
              className="flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-lg bg-slate-100"
            >
              {image.thumbnail_url || image.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={image.thumbnail_url ?? image.image_url ?? undefined} alt={image.file_name} className="h-full w-full object-cover" />
              ) : (
                <ImageIcon className="h-8 w-8 text-slate-400" />
              )}
            </button>
            <div className="mt-2 truncate text-xs text-slate-500">{image.file_name}</div>
          </section>
        ))}

        {activeImage ? (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 p-4"
            role="dialog"
            aria-modal="true"
            onClick={() => setActiveImage(null)}
          >
            <div className="max-h-full max-w-full" onClick={(event) => event.stopPropagation()}>
              <button
                type="button"
                onClick={() => setActiveImage(null)}
                className="mb-3 rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm"
              >
                鍏抽棴
              </button>
              {activeImage.status === "loading" ? (
                <div className="flex h-64 w-64 items-center justify-center rounded-xl bg-white/90 text-slate-700">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : null}
              {activeImage.status === "error" ? (
                <div className="w-72 rounded-xl bg-white p-4 text-sm text-red-600">{activeImage.error}</div>
              ) : null}
              {activeImage.status === "ready" && activeImage.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={activeImage.url} alt={activeImage.label} className="max-h-[82vh] max-w-full rounded-xl object-contain shadow-2xl" />
              ) : null}
            </div>
          </div>
        ) : null}
      </main>
    </div>
  );
}

type VisitImageStatus = OfflineVisitImage["analysis_status"];

function WaitingScreen({
  visitId,
  onNewStore,
  onViewVisit,
}: {
  visitId: string;
  onNewStore: () => void;
  onViewVisit: (visit: OfflineStoreVisit) => void;
}) {
  const [visit, setVisit] = useState<OfflineStoreVisit | null>(null);
  const [images, setImages] = useState<{ id: string; analysis_status: VisitImageStatus; image_type: string }[]>([]);
  const [pollCount, setPollCount] = useState(0);
  const [openingDetail, setOpeningDetail] = useState(false);

  const poll = useCallback(async () => {
    try {
      const res = await fetch(`/api/offline-store-visits/${visitId}?mode=status`);
      const data = await res.json().catch(() => ({}));
      if (data.visit) {
        setVisit(data.visit as OfflineStoreVisit);
      }
      if (data.visit?.offline_visit_images) {
        setImages(data.visit.offline_visit_images);
      }
      setPollCount((c) => c + 1);
    } catch {
      setPollCount((c) => c + 1);
    }
  }, [visitId]);

  async function openVisitDetail() {
    if (openingDetail) return;
    setOpeningDetail(true);
    try {
      const res = await fetch(`/api/offline-store-visits/${visitId}`);
      const data = await res.json().catch(() => ({}));
      if (data.visit) {
        onViewVisit(data.visit as OfflineStoreVisit);
      }
    } finally {
      setOpeningDetail(false);
    }
  }

  useEffect(() => {
    const timeout = setTimeout(() => {
      void poll();
    }, 0);
    const interval = setInterval(poll, 3000);
    return () => {
      clearTimeout(timeout);
      clearInterval(interval);
    };
  }, [poll]);

  const allAnalyzed = images.length > 0 && images.every((img) => img.analysis_status === "analyzed" || img.analysis_status === "reviewed" || img.analysis_status === "failed");

  const statusIcon = (status: VisitImageStatus) => {
    if (status === "analyzed" || status === "reviewed") return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
    if (status === "failed") return <X className="h-4 w-4 text-red-500" />;
    return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
  };

  const statusLabel = (status: VisitImageStatus) => {
    if (status === "analyzed" || status === "reviewed") return "已解析";
    if (status === "failed") return "解析失败";
    if (status === "analyzing") return "解析中...";
    return "等待中...";
  };

  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white px-4 py-4">
        <h1 className="text-xl font-semibold">解析进度</h1>
        <p className="mt-1 text-sm text-slate-500">照片正在后台解析，请稍候</p>
      </header>

      <main className="flex-1 space-y-3 overflow-y-auto px-4 py-4 pb-28">
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <RefreshCw className={`h-4 w-4 ${pollCount > 0 ? "text-blue-500" : "text-slate-400"}`} />
          <span>每 3 秒自动刷新 · 已刷新 {pollCount} 次</span>
        </div>

        {images.length === 0 ? (
          <div className="py-8 text-center text-sm text-slate-500">
            <Clock className="mx-auto mb-2 h-8 w-8 text-slate-300" />
            等待服务器处理...
          </div>
        ) : (
          <div className="space-y-2">
            {images.map((img) => (
              <div key={img.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm">
                <div className="text-sm font-medium capitalize">{img.image_type.replace(/_/g, " ")}</div>
                <div className="flex items-center gap-1.5 text-xs text-slate-500">
                  {statusIcon(img.analysis_status)}
                  {statusLabel(img.analysis_status)}
                </div>
              </div>
            ))}
          </div>
        )}

        {allAnalyzed && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            ✓ 所有照片解析完成！
          </div>
        )}
      </main>

      <div className="fixed inset-x-0 bottom-0 z-20 mx-auto max-w-md border-t border-slate-200 bg-white px-4 py-3 space-y-2">
        <button
          type="button"
          onClick={() => void openVisitDetail()}
          disabled={!visit || openingDetail}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-md bg-slate-900 text-sm font-semibold text-white disabled:opacity-40"
        >
          {openingDetail ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
          查看解析结果
        </button>
        <button
          type="button"
          onClick={onNewStore}
          className="flex h-10 w-full items-center justify-center gap-2 rounded-md border border-slate-300 text-sm font-medium text-slate-700"
        >
          <Plus className="h-4 w-4" />
          采集下一家门店
        </button>
      </div>
    </div>
  );
}

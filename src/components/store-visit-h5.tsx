"use client";

import { ArrowLeft, Building2, Camera, CheckCircle2, Loader2, LocateFixed, LogIn, MapPin, Plus, Search, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { Locale } from "@/lib/i18n/config";
import { getMobileCopy } from "@/lib/mobile-i18n";
import { MobileLanguageSwitch } from "@/components/mobile-language-switch";

const maxImages = 6;
const maxUploadBytes = 8 * 1024 * 1024;
const compressionMaxSide = 1600;
const compressionQuality = 0.78;
const storageKey = "makuku_app_user";
const imageCategoryOrder = ["makuku_shelf", "competitor_shelf", "storefront"] as const;
type ImageCategory = (typeof imageCategoryOrder)[number];

type AppUser = {
  id: string;
  displayName: string;
};

type OfflineStoreOption = {
  id: string;
  name: string;
  city: string;
  channel_type: string;
  channel_id?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  location_accuracy_m?: number | null;
  location_captured_at?: string | null;
  channels?: { id: string; code: string; name: string; type: string } | null;
};

type StoreLocationEvidence = {
  latitude: number;
  longitude: number;
  location_accuracy_m: number | null;
  location_captured_at: string;
};

type ReverseLocationResponse = {
  city?: string | null;
  address?: string | null;
  error?: string;
};

type PendingImage = {
  file: File;
  preview: string;
};

type PendingImagesByCategory = Record<ImageCategory, PendingImage[]>;

function emptyImagesByCategory(): PendingImagesByCategory {
  return {
    makuku_shelf: [],
    competitor_shelf: [],
    storefront: [],
  };
}

function uiCopy(locale: Locale) {
  return locale === "zh"
    ? {
        selectStore: "选择门店",
        selectStoreHint: "先选择门店主数据，区域和门店类型会自动带出。",
        searchPlaceholder: "搜索门店名称或城市",
        noStoreFound: "未找到门店，可新建",
        createStore: "新建门店",
        storeNameRequired: "门店名称 *",
        channelTypeRequired: "门店类型 *",
        cityRequired: "城市/区域 *",
        addressOptional: "地址（选填）",
        createFailed: "创建门店失败",
        createRequired: "请填写门店名称和城市/区域。",
        selectedStore: "已选门店",
        changeStore: "重选门店",
        city: "区域/城市",
        channelType: "门店类型",
        address: "地址",
        storeInfoIncomplete: "门店资料不完整，请重新选择或新建门店。",
        visitDate: "巡店日期",
        storeLocationGroup: "城市/区域与详细地址",
        storeLocationTitle: "门店定位",
        storeLocationHint: "免费浏览器定位，经 LocationIQ 识别后自动填充城市区域和地址。",
        locate: "定位并填充地址",
        locating: "定位中...",
        located: "已定位并填充",
        locationUnavailable: "当前浏览器不支持定位，可继续创建门店。",
        locationFailed: "定位失败或未授权，可继续创建门店。",
        reverseAddressFailed: "地址识别失败，可手动填写城市区域和地址。",
        reverseAddressMissing: "已保存经纬度，但未识别出地址，可手动填写。",
        locationAttribution: "Address by LocationIQ",
        signInTitle: "请先登录",
        signInBody: "新增巡店需要绑定导购员账号，登录后会自动带出提交人。",
      }
    : {
        selectStore: "Select Store",
        selectStoreHint: "Select store master data first. City and store type are locked from the master record.",
        searchPlaceholder: "Search store name or city",
        noStoreFound: "No store found. Create one.",
        createStore: "Create Store",
        storeNameRequired: "Store name *",
        channelTypeRequired: "Store type *",
        cityRequired: "City / region *",
        addressOptional: "Address (optional)",
        createFailed: "Failed to create store",
        createRequired: "Enter store name and city / region.",
        selectedStore: "Selected Store",
        changeStore: "Change Store",
        city: "City / Region",
        channelType: "Store Type",
        address: "Address",
        storeInfoIncomplete: "Store master data is incomplete. Select or create another store.",
        visitDate: "Visit Date",
        storeLocationGroup: "City / Region and Address",
        storeLocationTitle: "Store Location",
        storeLocationHint: "Uses free browser location, then LocationIQ fills city / region and address.",
        locate: "Locate & Fill Address",
        locating: "Locating...",
        located: "Located and filled",
        locationUnavailable: "Location is not supported in this browser. You can still create the store.",
        locationFailed: "Location failed or was not allowed. You can still create the store.",
        reverseAddressFailed: "Address lookup failed. Fill city / region and address manually.",
        reverseAddressMissing: "Coordinates were saved, but no address was found. Fill address manually.",
        locationAttribution: "Address by LocationIQ",
        signInTitle: "Sign In Required",
        signInBody: "New visits must be tied to a field user. Sign in first and the promoter is filled automatically.",
      };
}

function channelLabel(value: string | null | undefined, store?: OfflineStoreOption | null) {
  if (store?.channels?.name) return store.channels.name;
  switch (value) {
    case "modern_trade":
      return "Modern Trade";
    case "baby_store":
      return "Baby Store";
    case "pharmacy":
      return "Pharmacy";
    case "general_trade":
      return "General Trade";
    case "other":
      return "Other";
    default:
      return value || "-";
  }
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

async function compressImage(file: File) {
  if (!file.type.startsWith("image/")) {
    throw new Error(`${file.name} is not an image.`);
  }

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
  const compressed = new File([blob], `${safeName}.jpg`, {
    type: "image/jpeg",
    lastModified: Date.now(),
  });
  return compressed.size < file.size || file.size > maxUploadBytes ? compressed : file;
}

export function StoreVisitH5({ locale }: { locale: Locale }) {
  const router = useRouter();
  const copy = getMobileCopy(locale);
  const labels = uiCopy(locale);
  const [visitDate, setVisitDate] = useState(new Date().toISOString().slice(0, 10));
  const [user, setUser] = useState<AppUser | null>(null);
  const [userLoaded, setUserLoaded] = useState(false);
  const [selectedStore, setSelectedStore] = useState<OfflineStoreOption | null>(null);
  const [images, setImages] = useState<PendingImagesByCategory>(() => emptyImagesByCategory());
  const [submitting, setSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timeout = setTimeout(() => {
      try {
        const raw = localStorage.getItem(storageKey);
        if (!raw) return;
        const stored = JSON.parse(raw) as AppUser;
        if (stored?.id) setUser(stored);
      } catch {
        setUser(null);
      } finally {
        setUserLoaded(true);
      }
    }, 0);
    return () => clearTimeout(timeout);
  }, []);

  const totalImageCount = imageCategoryOrder.reduce((sum, category) => sum + images[category].length, 0);
  const storeInfoIncomplete = Boolean(selectedStore && (!selectedStore.city?.trim() || !selectedStore.channel_type?.trim()));

  function addFiles(category: ImageCategory, files: FileList | null) {
    if (!files) return;
    const nextFiles = Array.from(files).slice(0, maxImages - totalImageCount);
    setImages((current) => ({
      ...current,
      [category]: [...current[category], ...nextFiles.map((file) => ({ file, preview: URL.createObjectURL(file) }))],
    }));
  }

  function removeImage(category: ImageCategory, index: number) {
    setImages((current) => ({
      ...current,
      [category]: current[category].filter((_, i) => i !== index),
    }));
  }

  async function submit() {
    if (!user?.id) {
      setError(copy.signInFirst);
      return;
    }
    if (!selectedStore) {
      setError(labels.selectStoreHint);
      return;
    }
    if (storeInfoIncomplete) {
      setError(labels.storeInfoIncomplete);
      return;
    }
    if (!visitDate) {
      setError(copy.completeStoreInfo);
      return;
    }
    if (images.makuku_shelf.length === 0) {
      setError(copy.uploadMakukuShelfRequired);
      return;
    }

    const flattenedImages = imageCategoryOrder.flatMap((category) => images[category].map((image) => ({ ...image, category })));
    if (flattenedImages.length > maxImages) {
      setError(`Upload up to ${maxImages} images.`);
      return;
    }

    setSubmitting(true);
    setSubmitStatus("Compressing photos...");
    setError(null);

    try {
      const compressedImages = [];
      for (let index = 0; index < flattenedImages.length; index += 1) {
        setSubmitStatus(`Compressing photo ${index + 1}/${flattenedImages.length}...`);
        const file = await compressImage(flattenedImages[index].file);
        if (file.size > maxUploadBytes) {
          throw new Error(`Photo ${index + 1} is still ${formatMb(file.size)} after compression. Please choose a smaller photo.`);
        }
        compressedImages.push({ file, category: flattenedImages[index].category });
      }

      setSubmitStatus("Creating store visit...");
      const res = await fetch("/api/store-visit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          store_id: selectedStore.id,
          store_name: selectedStore.name,
          city: selectedStore.city,
          region: selectedStore.city,
          channel_type: selectedStore.channel_type,
          channel: selectedStore.channel_type,
          channel_id: selectedStore.channel_id ?? selectedStore.channels?.id ?? null,
          visit_date: visitDate,
          promoter: user?.displayName ?? "",
          user_id: user.id,
          uploader_user_id: user.id,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? copy.submitFailed);
        return;
      }
      const visitId = String(data.visit?.id ?? "");
      if (!visitId) throw new Error("Store visit was created without an id.");

      for (let index = 0; index < compressedImages.length; index += 1) {
        setSubmitStatus(`Uploading photo ${index + 1}/${compressedImages.length}...`);
        const imageFormData = new FormData();
        imageFormData.set("image", compressedImages[index].file);
        imageFormData.set("image_category", compressedImages[index].category);
        const imageRes = await fetch(`/api/store-visit/${visitId}/images`, {
          method: "POST",
          body: imageFormData,
        });
        const imageData = await imageRes.json().catch(() => ({}));
        if (!imageRes.ok) {
          throw new Error(`Photo ${index + 1} upload failed: ${imageData.error ?? copy.submitFailed}`);
        }
      }

      setSubmitStatus("Starting analysis...");
      void fetch("/api/store-visit/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visit_id: visitId }),
      })
        .then(async (analysisRes) => {
          if (analysisRes.ok) return;
          const analysisData = await analysisRes.json().catch(() => ({}));
          window.alert(`${copy.aiAnalysisFailed}: ${analysisData.error ?? copy.networkRetry}`);
        })
        .catch(() => window.alert(copy.aiAnalysisFailed));

      setSubmitStatus("Submitted.");
      router.push(`/${locale}/mobile/offline-capture`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : copy.networkRetry);
    } finally {
      setSubmitting(false);
      setSubmitStatus("");
    }
  }

  if (!userLoaded) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md items-center justify-center bg-slate-50 px-4 text-slate-950">
        <div className="text-center text-sm text-slate-500">
          <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
          {copy.loading}
        </div>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="mx-auto min-h-screen max-w-md bg-slate-50 px-4 py-5 text-slate-950">
        <header className="mb-5 flex items-start gap-3">
          <Link href={`/${locale}/mobile/offline-capture`} className="mt-1 rounded-full border border-slate-200 bg-white p-2 text-slate-700">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-normal text-blue-600">{copy.aiStoreVisit}</p>
            <h1 className="mt-2 text-2xl font-bold">{labels.signInTitle}</h1>
            <p className="mt-1 text-sm text-slate-500">{labels.signInBody}</p>
          </div>
          <MobileLanguageSwitch locale={locale} currentPath="/mobile/offline-capture/new" />
        </header>
        <Link href={`/${locale}/mobile/offline-capture`} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 text-sm font-bold text-white">
          <LogIn className="h-4 w-4" />
          {copy.goToCapture}
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen max-w-md bg-slate-50 px-4 py-5 text-slate-950">
      <header className="mb-5 flex items-start gap-3">
        <Link href={`/${locale}/mobile/offline-capture`} className="mt-1 rounded-full border border-slate-200 bg-white p-2 text-slate-700">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-normal text-blue-600">{copy.aiStoreVisit}</p>
          <h1 className="mt-2 text-2xl font-bold">{copy.newVisit}</h1>
          <p className="mt-1 text-sm text-slate-500">{selectedStore ? selectedStore.name : labels.selectStoreHint}</p>
        </div>
        <MobileLanguageSwitch locale={locale} currentPath="/mobile/offline-capture/new" />
      </header>

      {error ? <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
      {submitStatus ? <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">{submitStatus}</div> : null}

      {!selectedStore ? (
        <StoreSearchStep locale={locale} onSelect={(store) => { setSelectedStore(store); setError(null); }} />
      ) : (
        <>
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs font-semibold uppercase tracking-normal text-slate-500">{labels.selectedStore}</div>
                <h2 className="mt-1 truncate text-lg font-bold">{selectedStore.name}</h2>
              </div>
              <button
                type="button"
                onClick={() => setSelectedStore(null)}
                className="shrink-0 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700"
              >
                {labels.changeStore}
              </button>
            </div>
            <div className="mt-4 grid gap-2 text-sm">
              <ReadOnlyRow label={labels.city} value={selectedStore.city || "-"} />
              <ReadOnlyRow label={labels.channelType} value={channelLabel(selectedStore.channel_type, selectedStore)} />
              <ReadOnlyRow label={labels.address} value={selectedStore.address || "-"} />
            </div>
            {storeInfoIncomplete ? <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{labels.storeInfoIncomplete}</div> : null}
          </section>

          <label className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm">
            <span className="shrink-0 font-semibold text-slate-600">{labels.visitDate}</span>
            <input type="date" value={visitDate} onChange={(event) => setVisitDate(event.target.value)} className="h-9 min-w-0 flex-1 rounded-lg border border-slate-200 px-2 text-right text-sm outline-none focus:border-blue-500" />
          </label>

          <section className="mt-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold">{copy.shelfPhotos}</h2>
                <p className="mt-1 text-xs text-slate-500">{totalImageCount}/{maxImages} {copy.uploaded}</p>
              </div>
            </div>

            {imageCategoryOrder.map((category) => (
              <ImageUploadSection
                key={category}
                title={category === "makuku_shelf" ? copy.makukuShelfPhotos : category === "competitor_shelf" ? copy.competitorShelfPhotos : copy.storefrontPhotos}
                required={category === "makuku_shelf"}
                addLabel={copy.add}
                emptyText={copy.noPhotosYet}
                images={images[category]}
                disabled={totalImageCount >= maxImages}
                onAdd={(files) => addFiles(category, files)}
                onRemove={(index) => removeImage(category, index)}
              />
            ))}
          </section>

          <button type="button" onClick={submit} disabled={submitting || storeInfoIncomplete} className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 text-sm font-bold text-white disabled:opacity-60">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {submitting ? (submitStatus || copy.submitting) : copy.submitStoreVisit}
          </button>
        </>
      )}
    </main>
  );
}

function StoreSearchStep({ locale, onSelect }: { locale: Locale; onSelect: (store: OfflineStoreOption) => void }) {
  const labels = uiCopy(locale);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<OfflineStoreOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const timeout = setTimeout(async () => {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams();
      if (query.trim()) params.set("q", query.trim());
      try {
        const res = await fetch(`/api/offline-stores?${params.toString()}`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (!cancelled) {
            setError(data.error ?? labels.createFailed);
            setResults([]);
          }
          return;
        }
        if (!cancelled) setResults((data.stores ?? []) as OfflineStoreOption[]);
      } catch {
        if (!cancelled) {
          setError(labels.createFailed);
          setResults([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [labels.createFailed, query]);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div>
        <h2 className="font-semibold">{labels.selectStore}</h2>
        <p className="mt-1 text-sm leading-5 text-slate-500">{labels.selectStoreHint}</p>
      </div>
      <div className="relative mt-4">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={labels.searchPlaceholder}
          className="h-11 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm outline-none focus:border-blue-500"
        />
        {loading ? <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-slate-400" /> : null}
      </div>
      {error ? <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      <div className="mt-4 space-y-2">
        {!loading && results.length === 0 ? <div className="rounded-xl border border-dashed border-slate-300 p-5 text-center text-sm text-slate-500">{labels.noStoreFound}</div> : null}
        {results.map((store) => (
          <button
            key={store.id}
            type="button"
            onClick={() => onSelect(store)}
            className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3 text-left shadow-sm"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
              <Building2 className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-bold">{store.name}</span>
              <span className="mt-1 block truncate text-xs text-slate-500">{store.city || "-"} / {channelLabel(store.channel_type, store)}</span>
            </span>
            {store.address ? <MapPin className="h-4 w-4 shrink-0 text-slate-400" /> : null}
          </button>
        ))}
      </div>
      <button type="button" onClick={() => setShowCreate(true)} className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 text-sm font-bold text-white">
        <Plus className="h-4 w-4" />
        {labels.createStore}
      </button>

      {showCreate ? (
        <CreateStoreSheet
          locale={locale}
          onClose={() => setShowCreate(false)}
          onCreated={(store) => {
            setShowCreate(false);
            onSelect(store);
          }}
        />
      ) : null}
    </section>
  );
}

function CreateStoreSheet({ locale, onClose, onCreated }: { locale: Locale; onClose: () => void; onCreated: (store: OfflineStoreOption) => void }) {
  const labels = uiCopy(locale);
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [channelType, setChannelType] = useState("modern_trade");
  const [address, setAddress] = useState("");
  const [storeLocation, setStoreLocation] = useState<StoreLocationEvidence | null>(null);
  const [locationStatus, setLocationStatus] = useState("");
  const [locating, setLocating] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function captureStoreLocation() {
    if (!navigator.geolocation) {
      setLocationStatus(labels.locationUnavailable);
      return;
    }

    setLocating(true);
    setLocationStatus("");
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const capturedLocation = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          location_accuracy_m: Number.isFinite(position.coords.accuracy) ? Math.round(position.coords.accuracy) : null,
          location_captured_at: new Date().toISOString(),
        };
        setStoreLocation(capturedLocation);

        try {
          const params = new URLSearchParams({
            lat: String(capturedLocation.latitude),
            lon: String(capturedLocation.longitude),
          });
          const res = await fetch(`/api/location/reverse?${params.toString()}`);
          const data = (await res.json().catch(() => ({}))) as ReverseLocationResponse;
          if (!res.ok) {
            setLocationStatus(labels.reverseAddressFailed);
            return;
          }
          if (data.city) setCity(data.city);
          if (data.address) setAddress(data.address);
          setLocationStatus(data.city || data.address ? "" : labels.reverseAddressMissing);
        } catch {
          setLocationStatus(labels.reverseAddressFailed);
        } finally {
          setLocating(false);
        }
      },
      () => {
        setLocationStatus(labels.locationFailed);
        setLocating(false);
      },
      { enableHighAccuracy: true, maximumAge: 60_000, timeout: 8_000 },
    );
  }

  async function createStore() {
    if (!name.trim() || !channelType.trim() || !city.trim()) {
      setError(labels.createRequired);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/offline-stores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          city,
          channel_type: channelType,
          address,
          latitude: storeLocation?.latitude ?? null,
          longitude: storeLocation?.longitude ?? null,
          location_accuracy_m: storeLocation?.location_accuracy_m ?? null,
          location_captured_at: storeLocation?.location_captured_at ?? null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? labels.createFailed);
        return;
      }
      onCreated(data.store as OfflineStoreOption);
    } catch {
      setError(labels.createFailed);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-slate-950/40">
      <div className="mx-auto w-full max-w-md rounded-t-2xl bg-white p-5 shadow-xl">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold">{labels.createStore}</h2>
          <button type="button" onClick={onClose} className="rounded-full p-1 text-slate-500">
            <X className="h-5 w-5" />
          </button>
        </div>
        {error ? <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
        <div className="mt-4 space-y-3">
          <input required value={name} onChange={(event) => setName(event.target.value)} placeholder={labels.storeNameRequired} className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-blue-500" />
          <label className="block">
            <span className="mb-1.5 block text-xs font-bold text-slate-600">{labels.channelTypeRequired}</span>
            <select required value={channelType} onChange={(event) => setChannelType(event.target.value)} className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-blue-500">
              <option value="modern_trade">Modern Trade</option>
              <option value="baby_store">Baby Store</option>
              <option value="pharmacy">Pharmacy</option>
              <option value="general_trade">General Trade</option>
              <option value="other">Other</option>
            </select>
          </label>
        </div>

        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="min-w-0">
            <div className="text-sm font-bold text-slate-900">{labels.storeLocationGroup}</div>
            <p className="mt-1 text-xs leading-5 text-slate-500">{labels.storeLocationHint}</p>
          </div>
          <div className="mt-3 space-y-3">
            <input required value={city} onChange={(event) => setCity(event.target.value)} placeholder={labels.cityRequired} className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-blue-500" />
            <input value={address} onChange={(event) => setAddress(event.target.value)} placeholder={labels.addressOptional} className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-blue-500" />
            <button
              type="button"
              onClick={captureStoreLocation}
              disabled={locating}
              className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-3 text-xs font-bold text-white disabled:opacity-60"
            >
              {locating ? <Loader2 className="h-4 w-4 animate-spin" /> : <LocateFixed className="h-4 w-4" />}
              {locating ? labels.locating : labels.locate}
            </button>
          </div>
          {storeLocation ? (
            <div className="mt-3 flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
              <CheckCircle2 className="h-4 w-4" />
              {labels.located}
              {storeLocation.location_accuracy_m !== null ? ` / ${storeLocation.location_accuracy_m}m` : null}
            </div>
          ) : null}
          {locationStatus ? <div className="mt-3 rounded-lg bg-white px-3 py-2 text-sm text-slate-600">{locationStatus}</div> : null}
          <div className="mt-3 text-[11px] font-medium text-slate-400">{labels.locationAttribution}</div>
        </div>
        <button type="button" onClick={createStore} disabled={loading} className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 text-sm font-bold text-white disabled:opacity-60">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Building2 className="h-4 w-4" />}
          {labels.createStore}
        </button>
      </div>
    </div>
  );
}

function ReadOnlyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2">
      <span className="text-xs font-semibold text-slate-500">{label}</span>
      <span className="min-w-0 truncate text-sm font-medium text-slate-900">{value}</span>
    </div>
  );
}

function ImageUploadSection({
  title,
  required,
  addLabel,
  emptyText,
  images,
  disabled,
  onAdd,
  onRemove,
}: {
  title: string;
  required: boolean;
  addLabel: string;
  emptyText: string;
  images: PendingImage[];
  disabled: boolean;
  onAdd: (files: FileList | null) => void;
  onRemove: (index: number) => void;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold">
            {title}
            {required ? <span className="ml-1 text-red-500">*</span> : null}
          </h3>
          <p className="mt-1 text-xs text-slate-500">{images.length} uploaded</p>
        </div>
        <label className={`inline-flex h-10 items-center gap-2 rounded-lg px-3 text-sm font-semibold text-white ${disabled ? "cursor-not-allowed bg-slate-300" : "cursor-pointer bg-blue-600"}`}>
          <Camera className="h-4 w-4" />
          {addLabel}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            className="sr-only"
            disabled={disabled}
            onChange={(event) => {
              onAdd(event.target.files);
              event.currentTarget.value = "";
            }}
          />
        </label>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3">
        {images.map((image, index) => (
          <div key={image.preview} className="relative aspect-square overflow-hidden rounded-xl bg-slate-100">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={image.preview} alt={`${title} ${index + 1}`} className="h-full w-full object-cover" />
            <button type="button" onClick={() => onRemove(index)} className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        {images.length === 0 ? <div className="col-span-3 rounded-xl border border-dashed border-slate-300 p-5 text-center text-sm text-slate-500">{emptyText}</div> : null}
      </div>
    </div>
  );
}

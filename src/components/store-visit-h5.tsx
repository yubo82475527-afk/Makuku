"use client";

import { ArrowLeft, Camera, Loader2, Trash2 } from "lucide-react";
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
  const [storeName, setStoreName] = useState("");
  const [region, setRegion] = useState("");
  const [channel, setChannel] = useState("Modern Trade");
  const [visitDate, setVisitDate] = useState(new Date().toISOString().slice(0, 10));
  const [promoter, setPromoter] = useState("");
  const [user, setUser] = useState<AppUser | null>(null);
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
        if (stored?.id) {
          setUser(stored);
          setPromoter((current) => current || stored.displayName || "");
        }
      } catch {
        setUser(null);
      }
    }, 0);
    return () => clearTimeout(timeout);
  }, []);

  const totalImageCount = imageCategoryOrder.reduce((sum, category) => sum + images[category].length, 0);

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
    if (!storeName || !region || !channel || !visitDate || !promoter) {
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
          store_name: storeName,
          region,
          channel,
          visit_date: visitDate,
          promoter,
          user_id: user?.id ?? null,
          uploader_user_id: user?.id ?? null,
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

      setSubmitStatus("Submitted.");
      router.push(`/${locale}/mobile/offline-capture`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : copy.networkRetry);
    } finally {
      setSubmitting(false);
      setSubmitStatus("");
    }
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
          <p className="mt-1 text-sm text-slate-500">{copy.newVisitHint}</p>
        </div>
        <MobileLanguageSwitch locale={locale} currentPath="/mobile/offline-capture/new" />
      </header>

      {error ? <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
      {submitStatus ? <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">{submitStatus}</div> : null}

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="font-semibold">{copy.storeInformation}</h2>
        <div className="mt-4 space-y-3">
          <input value={storeName} onChange={(e) => setStoreName(e.target.value)} placeholder={copy.storeName} className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-blue-500" />
          <input value={region} onChange={(e) => setRegion(e.target.value)} placeholder={copy.region} className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-blue-500" />
          <select value={channel} onChange={(e) => setChannel(e.target.value)} className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-blue-500">
            <option>Modern Trade</option>
            <option>Baby Store</option>
            <option>Pharmacy</option>
            <option>General Trade</option>
            <option>Other</option>
          </select>
          <input type="date" value={visitDate} onChange={(e) => setVisitDate(e.target.value)} className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-blue-500" />
          <input value={promoter} onChange={(e) => setPromoter(e.target.value)} placeholder={copy.promoter} className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-blue-500" />
        </div>
      </section>

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

      <button type="button" onClick={submit} disabled={submitting} className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 text-sm font-bold text-white disabled:opacity-60">
        {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {submitting ? (submitStatus || copy.submitting) : copy.submitStoreVisit}
      </button>
    </main>
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

"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";

type ThumbnailImage = {
  id?: string;
  path: string;
  url: string | null;
  label: string;
  meta: string;
};

type ActiveImageState = {
  status: "loading" | "ready" | "error";
  label: string;
  url?: string;
  error?: string;
};

export function StoreVisitThumbnailGallery({
  visitId,
  images,
}: {
  visitId: string;
  images: ThumbnailImage[];
}) {
  const [activeImage, setActiveImage] = useState<ActiveImageState | null>(null);

  async function fetchOriginalImageUrl(image: ThumbnailImage) {
    const params = new URLSearchParams();
    if (image.id) {
      params.set("image_id", image.id);
    } else {
      params.set("path", image.path);
    }
    const response = await fetch(`/api/store-visit/${visitId}/image-url?${params.toString()}`);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || typeof payload.url !== "string" || !payload.url) {
      throw new Error("Unable to load original image.");
    }
    return payload.url;
  }

  async function openOriginalImage(image: ThumbnailImage) {
    setActiveImage({ status: "loading", label: image.label });
    try {
      const url = await fetchOriginalImageUrl(image);
      setActiveImage({ status: "ready", label: image.label, url });
    } catch (error) {
      setActiveImage({
        status: "error",
        label: image.label,
        error: error instanceof Error ? error.message : "Unable to load original image.",
      });
    }
  }

  return (
    <>
      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-4">
        {images.map((image, index) => (
          <div key={`${image.path}-${index}`} className="overflow-hidden rounded-md border border-slate-200 bg-slate-50">
            <button
              type="button"
              onClick={() => void openOriginalImage(image)}
              className="flex aspect-[4/3] w-full items-center justify-center bg-slate-100"
            >
              {image.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={image.url} alt={image.label} className="h-full w-full object-cover" />
              ) : (
                <div className="text-sm text-slate-400">No preview</div>
              )}
            </button>
            <div className="border-t border-slate-200 px-3 py-2 text-xs text-slate-600">
              <div className="font-medium text-slate-900">{image.meta}</div>
              <div className="mt-1 truncate">{image.path}</div>
            </div>
          </div>
        ))}
      </div>

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
              Close
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
    </>
  );
}

"use client";

import { Camera, Loader2, RefreshCw, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Button, SelectInput } from "@/components/ui";
import type { Dictionary } from "@/lib/i18n/get-dictionary";
import type { OfflineImageType } from "@/lib/types";

const imageTypes: OfflineImageType[] = ["own_shelf", "competitor_shelf", "promo_tag", "other"];

export function VisitImageUploadForm({
  dict,
  visitId,
  returnTo,
  mobile = false,
}: {
  dict: Dictionary;
  visitId: string;
  returnTo: string;
  mobile?: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const formData = new FormData(event.currentTarget);
      formData.set("json", "1");
      formData.set("auto_analyze", "1");
      const response = await fetch(`/api/offline-store-visits/${visitId}/images`, {
        method: "POST",
        body: formData,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(payload.error ?? "Upload failed");
        return;
      }
      if (inputRef.current) inputRef.current.value = "";
      router.refresh();
    } catch {
      setError("Upload failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className={mobile ? "space-y-3" : "grid gap-3 md:grid-cols-[180px_1fr_auto]"}>
      <input type="hidden" name="return_to" value={returnTo} />
      <SelectInput name="image_type" required>
        {imageTypes.map((type) => (
          <option key={type} value={type}>
            {type === "own_shelf"
              ? dict.offlineUploads.ownShelf
              : type === "competitor_shelf"
                ? dict.offlineUploads.competitorShelf
                : type === "promo_tag"
                  ? dict.offlineUploads.promoTag
                  : dict.offlineUploads.otherImage}
          </option>
        ))}
      </SelectInput>
      <input
        ref={inputRef}
        name="image"
        type="file"
        accept="image/*"
        capture={mobile ? "environment" : undefined}
        required
        className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 py-1 text-sm"
      />
      <Button type="submit" disabled={loading} className={mobile ? "w-full" : undefined}>
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : mobile ? <Camera className="h-4 w-4" /> : <Upload className="h-4 w-4" />}
        {dict.offlineUploads.uploadImages}
      </Button>
      {error ? <div className="text-sm text-red-700 md:col-span-3">{error}</div> : null}
    </form>
  );
}

export function AnalyzeImageButton({ imageId, label }: { imageId: string; label: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function analyze() {
    setLoading(true);
    try {
      await fetch(`/api/offline-visit-images/${imageId}/analyze`, { method: "POST" });
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button type="button" onClick={analyze} disabled={loading} className="bg-slate-700 hover:bg-slate-600">
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
      {label}
    </Button>
  );
}

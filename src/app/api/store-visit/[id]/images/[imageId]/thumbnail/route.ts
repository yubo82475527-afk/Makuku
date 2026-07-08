import { NextResponse } from "next/server";
import { requireAppSession } from "@/lib/auth-session";
import { createSupabaseServiceClient } from "@/lib/supabase";
import {
  buildStoreVisitThumbnailPath,
  createStoreVisitThumbnail,
  isValidJpegBuffer,
  storeVisitThumbnailContentType,
  toStorageUploadBody,
} from "@/lib/store-visit-image-variants";
import { readStoreVisitThumbnailToken } from "@/lib/store-visit-thumbnail-token";

type RouteContext = {
  params: Promise<{ id: string; imageId: string }>;
};

const retryDelaysMs = [0, 180, 650, 1400];

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function jsonError(message: string, status: number) {
  return NextResponse.json(
    { error: message },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}

async function downloadStorageObject(input: {
  supabase: ReturnType<typeof createSupabaseServiceClient>;
  bucket: "offline-visit-images";
  path: string;
}) {
  let lastError: string | null = null;

  for (const delay of retryDelaysMs) {
    if (delay > 0) await sleep(delay);
    const result = await input.supabase.storage.from(input.bucket).download(input.path);
    if (!result.error && result.data) {
      return {
        bytes: Buffer.from(await result.data.arrayBuffer()),
        contentType: result.data.type || storeVisitThumbnailContentType,
      };
    }
    lastError = result.error?.message ?? "Storage object is not available";
  }

  throw new Error(lastError ?? "Storage object is not available");
}

async function ensureValidThumbnailBytes(input: {
  supabase: ReturnType<typeof createSupabaseServiceClient>;
  thumbnailPath: string;
  originalPath: string;
}) {
  try {
    const thumbnail = await downloadStorageObject({
      supabase: input.supabase,
      bucket: "offline-visit-images",
      path: input.thumbnailPath,
    });
    if (isValidJpegBuffer(thumbnail.bytes)) {
      return { ...thumbnail, repaired: false };
    }
  } catch {
    // Missing thumbnails are repaired from the original below when possible.
  }

  const original = await downloadStorageObject({
    supabase: input.supabase,
    bucket: "offline-visit-images",
    path: input.originalPath,
  });
  const regenerated = await createStoreVisitThumbnail({ bytes: original.bytes });
  const uploadResult = await input.supabase.storage
    .from("offline-visit-images")
    .upload(input.thumbnailPath, toStorageUploadBody(regenerated.buffer, regenerated.contentType), {
      contentType: regenerated.contentType,
      upsert: true,
    });
  if (uploadResult.error) throw new Error(uploadResult.error.message);

  return {
    bytes: regenerated.buffer,
    contentType: regenerated.contentType,
    repaired: true,
  };
}

export async function GET(request: Request, ctx: RouteContext) {
  const { id, imageId } = await ctx.params;
  const token = readStoreVisitThumbnailToken(new URL(request.url).searchParams.get("token"));
  const tokenAuthorized = token?.visitId === id && token.imageId === imageId;
  if (!tokenAuthorized) {
    const auth = await requireAppSession(request);
    if (auth.response) return auth.response;
  }

  const supabase = createSupabaseServiceClient();
  const imageResult = await supabase
    .from("offline_visit_images")
    .select("id,visit_id,image_path,thumbnail_path,deleted_at,replaced_by_image_id")
    .eq("id", imageId)
    .eq("visit_id", id)
    .maybeSingle();

  if (imageResult.error) return jsonError(imageResult.error.message, 500);
  const image = imageResult.data;
  if (!image) return jsonError("Image not found", 404);
  if (image.deleted_at || image.replaced_by_image_id) return jsonError("Image is inactive", 410);

  const thumbnailPath = image.thumbnail_path ?? buildStoreVisitThumbnailPath(image.image_path);
  if (tokenAuthorized && token.thumbnailPath !== thumbnailPath) return jsonError("Thumbnail token is no longer valid", 403);
  try {
    const thumbnail = await ensureValidThumbnailBytes({
      supabase,
      thumbnailPath,
      originalPath: image.image_path,
    });
    return new Response(thumbnail.bytes, {
      headers: {
        "Content-Type": thumbnail.contentType,
        "Content-Length": String(thumbnail.bytes.length),
        "Cache-Control": "private, max-age=300, stale-while-revalidate=3600",
        ...(thumbnail.repaired ? { "X-Thumbnail-Repaired": "1" } : {}),
      },
    });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Thumbnail is not available", 404);
  }
}

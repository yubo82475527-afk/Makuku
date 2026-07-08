import { NextResponse } from "next/server";
import { requireAppSession } from "@/lib/auth-session";
import { createSupabaseServiceClient } from "@/lib/supabase";
import { buildStoreVisitThumbnailPath } from "@/lib/store-visit-image-variants";
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

async function downloadThumbnail(input: {
  bucket: "offline-visit-images";
  path: string;
}) {
  const supabase = createSupabaseServiceClient();
  let lastError: string | null = null;

  for (const delay of retryDelaysMs) {
    if (delay > 0) await sleep(delay);
    const result = await supabase.storage.from(input.bucket).download(input.path);
    if (!result.error && result.data) {
      return result.data;
    }
    lastError = result.error?.message ?? "Thumbnail is not available";
  }

  throw new Error(lastError ?? "Thumbnail is not available");
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
    const blob = await downloadThumbnail({
      bucket: "offline-visit-images",
      path: thumbnailPath,
    });
    const bytes = Buffer.from(await blob.arrayBuffer());
    return new Response(bytes, {
      headers: {
        "Content-Type": blob.type || "image/jpeg",
        "Content-Length": String(bytes.length),
        "Cache-Control": "private, max-age=300, stale-while-revalidate=3600",
      },
    });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Thumbnail is not available", 404);
  }
}

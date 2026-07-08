import { requireAppSession } from "@/lib/auth-session";
import { createSupabaseServiceClient } from "@/lib/supabase";
import { buildStoreVisitThumbnailPath } from "@/lib/store-visit-image-variants";
import type { OfflineStoreVisit } from "@/lib/types";

type RouteContext = {
  params: Promise<{ id: string }>;
};

async function attachImageUrls(visit: OfflineStoreVisit) {
  const supabase = createSupabaseServiceClient();
  return {
    ...visit,
    offline_visit_images: await Promise.all((visit.offline_visit_images ?? []).map(async (image) => {
      const thumbnailPath = image.thumbnail_path ?? buildStoreVisitThumbnailPath(image.image_path);
      const thumbnailResult = await supabase.storage
        .from("offline-visit-images")
        .createSignedUrl(thumbnailPath, 60 * 60);
      const { data } = await supabase.storage
        .from("offline-visit-images")
        .createSignedUrl(image.image_path, 60 * 60);
      return {
        ...image,
        image_url: data?.signedUrl ?? null,
        thumbnail_url: thumbnailResult.data?.signedUrl ?? data?.signedUrl ?? null,
      };
    })),
  };
}

export async function GET(request: Request, ctx: RouteContext) {
  try {
    const auth = await requireAppSession(request);
    if (auth.response) return auth.response;
    const mode = new URL(request.url).searchParams.get("mode");
    const { id } = await ctx.params;
    const supabase = createSupabaseServiceClient();
    const { data, error } = await supabase
      .from("offline_store_visits")
      .select("*, offline_visit_images(*)")
      .eq("id", id)
      .single();

    if (error) return Response.json({ error: error.message }, { status: 404 });
    if (mode === "status") {
      const visit = data as OfflineStoreVisit;
      return Response.json({
        visit: {
          id: visit.id,
          store_name: visit.store_name,
          visit_status: visit.visit_status,
          analysis_status: visit.analysis_status,
          offline_visit_images: (visit.offline_visit_images ?? []).map((image) => ({
            id: image.id,
            analysis_status: image.analysis_status,
            image_type: image.image_type,
          })),
        },
      });
    }
    return Response.json({ visit: await attachImageUrls(data as OfflineStoreVisit) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}

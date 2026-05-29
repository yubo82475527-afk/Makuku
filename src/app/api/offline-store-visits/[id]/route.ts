import { createSupabaseServiceClient } from "@/lib/supabase";
import type { OfflineStoreVisit } from "@/lib/types";

type RouteContext = {
  params: Promise<{ id: string }>;
};

async function attachImageUrls(visit: OfflineStoreVisit) {
  const supabase = createSupabaseServiceClient();
  return {
    ...visit,
    offline_visit_images: await Promise.all((visit.offline_visit_images ?? []).map(async (image) => {
      if (image.image_url) return image;
      const { data } = await supabase.storage
        .from("offline-visit-images")
        .createSignedUrl(image.image_path, 60 * 60);
      return { ...image, image_url: data?.signedUrl ?? null };
    })),
  };
}

export async function GET(request: Request, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;
    const supabase = createSupabaseServiceClient();
    const { data, error } = await supabase
      .from("offline_store_visits")
      .select("*, offline_visit_images(*)")
      .eq("id", id)
      .single();

    if (error) return Response.json({ error: error.message }, { status: 404 });
    return Response.json({ visit: await attachImageUrls(data as OfflineStoreVisit) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}

import { createSupabaseServiceClient } from "@/lib/supabase";
import type { OfflineStoreVisit, StoreVisitImageCategory } from "@/lib/types";

type RouteContext = {
  params: Promise<{ id: string }>;
};

async function attachSignedImageUrls(visit: OfflineStoreVisit) {
  const supabase = createSupabaseServiceClient();
  const imagePaths = Array.isArray(visit.image_urls) ? visit.image_urls : [];
  const categories = Array.isArray(visit.image_categories) ? visit.image_categories : [];
  const signedImages = await Promise.all(imagePaths.map(async (path, index) => {
    const { data } = await supabase.storage.from("store-visits").createSignedUrl(path, 60 * 60);
    return { path, url: data?.signedUrl ?? null, category: categories[index] as StoreVisitImageCategory | undefined };
  }));
  return { ...visit, signed_images: signedImages };
}

export async function GET(_request: Request, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;
    const supabase = createSupabaseServiceClient();
    const { data, error } = await supabase
      .from("offline_store_visits")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !data) return Response.json({ error: error?.message ?? "Visit not found" }, { status: 404 });
    return Response.json({ visit: await attachSignedImageUrls(data as OfflineStoreVisit) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}

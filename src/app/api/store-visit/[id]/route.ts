import { createSupabaseServiceClient } from "@/lib/supabase";
import type { OfflineImageType, OfflineStoreVisit, StoreVisitImageCategory } from "@/lib/types";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function toStoreVisitImageCategory(category: OfflineImageType | StoreVisitImageCategory | null | undefined): StoreVisitImageCategory | undefined {
  if (category === "own_shelf") return "makuku_shelf";
  if (category === "competitor_shelf") return "competitor_shelf";
  if (category === "other" || category === "promo_tag") return "storefront";
  if (category === "makuku_shelf" || category === "storefront") return category;
  return undefined;
}

async function attachSignedImageUrls(visit: OfflineStoreVisit) {
  const supabase = createSupabaseServiceClient();
  const imagePaths = Array.isArray(visit.image_urls) ? visit.image_urls : [];
  const categories = Array.isArray(visit.image_categories) ? visit.image_categories : [];
  const legacySignedImages = await Promise.all(imagePaths.map(async (path, index) => {
    const { data } = await supabase.storage.from("store-visits").createSignedUrl(path, 60 * 60);
    return { path, url: data?.signedUrl ?? null, category: toStoreVisitImageCategory(categories[index]) };
  }));
  const tableSignedImages = await Promise.all((visit.offline_visit_images ?? []).map(async (image) => {
    const category = toStoreVisitImageCategory(image.image_type);
    if (image.image_url) return { path: image.image_path, url: image.image_url, category };
    const { data } = await supabase.storage.from("offline-visit-images").createSignedUrl(image.image_path, 60 * 60);
    return { path: image.image_path, url: data?.signedUrl ?? null, category };
  }));
  return { ...visit, signed_images: [...tableSignedImages, ...legacySignedImages] };
}

export async function GET(_request: Request, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;
    const supabase = createSupabaseServiceClient();
    const { data, error } = await supabase
      .from("offline_store_visits")
      .select("*, offline_visit_images(*)")
      .eq("id", id)
      .single();

    if (error || !data) return Response.json({ error: error?.message ?? "Visit not found" }, { status: 404 });
    return Response.json({ visit: await attachSignedImageUrls(data as OfflineStoreVisit) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}

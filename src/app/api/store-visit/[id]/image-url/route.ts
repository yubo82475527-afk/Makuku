import { requireAppSession } from "@/lib/auth-session";
import { createSupabaseServiceClient } from "@/lib/supabase";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: Request, ctx: RouteContext) {
  try {
    const auth = await requireAppSession(request);
    if (auth.response) return auth.response;
    const { id } = await ctx.params;
    const { searchParams } = new URL(request.url);
    const imageId = searchParams.get("image_id")?.trim() || "";
    const path = searchParams.get("path")?.trim() || "";
    const supabase = createSupabaseServiceClient();

    if (imageId) {
      const { data: image, error } = await supabase
        .from("offline_visit_images")
        .select("image_path,visit_id")
        .eq("id", imageId)
        .eq("visit_id", id)
        .single();
      if (error || !image) {
        return Response.json({ error: error?.message ?? "Image not found" }, { status: 404 });
      }
      const signed = await supabase.storage.from("offline-visit-images").createSignedUrl(String(image.image_path), 60 * 60);
      return Response.json({ url: signed.data?.signedUrl ?? null });
    }

    if (path) {
      const { data: visit, error } = await supabase
        .from("offline_store_visits")
        .select("image_urls")
        .eq("id", id)
        .single();
      if (error || !visit) {
        return Response.json({ error: error?.message ?? "Visit not found" }, { status: 404 });
      }
      const imagePaths = Array.isArray(visit.image_urls) ? visit.image_urls : [];
      if (!imagePaths.includes(path)) {
        return Response.json({ error: "Image not found" }, { status: 404 });
      }
      const signed = await supabase.storage.from("store-visits").createSignedUrl(path, 60 * 60);
      return Response.json({ url: signed.data?.signedUrl ?? null });
    }

    return Response.json({ error: "image_id or path is required" }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}

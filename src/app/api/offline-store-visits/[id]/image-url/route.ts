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
    const imageId = new URL(request.url).searchParams.get("image_id")?.trim() || "";
    if (!imageId) {
      return Response.json({ error: "image_id is required" }, { status: 400 });
    }

    const supabase = createSupabaseServiceClient();
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
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}

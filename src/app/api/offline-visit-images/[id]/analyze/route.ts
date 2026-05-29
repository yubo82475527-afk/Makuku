import { revalidatePath } from "next/cache";
import { analyzeOfflineImage } from "@/lib/offline-vision";
import { createSupabaseServiceClient } from "@/lib/supabase";
import type { OfflineImageType } from "@/lib/types";

export async function POST(_request: Request, ctx: RouteContext<"/api/offline-visit-images/[id]/analyze">) {
  try {
    const { id } = await ctx.params;
    const supabase = createSupabaseServiceClient();
    const { data: image, error: imageError } = await supabase
      .from("offline_visit_images")
      .select("*, offline_store_visits(*)")
      .eq("id", id)
      .single();

    if (imageError || !image) {
      return Response.json({ error: imageError?.message ?? "Image not found" }, { status: 404 });
    }

    await supabase.from("offline_visit_images").update({ analysis_status: "analyzing", error_message: null }).eq("id", id);
    await supabase.from("offline_store_visits").update({ visit_status: "analyzing" }).eq("id", image.visit_id);

    const { data: signed } = await supabase.storage
      .from("offline-visit-images")
      .createSignedUrl(image.image_path, 60 * 10);
    const visit = image.offline_store_visits as { store_name?: string; city?: string } | null;
    const previousResult = image.vision_result as { target_brand?: string | null } | null;
    const result = await analyzeOfflineImage({
      imageType: image.image_type as OfflineImageType,
      imageUrl: signed?.signedUrl ?? null,
      fileName: image.file_name,
      targetBrand: previousResult?.target_brand ?? null,
      storeName: visit?.store_name,
      city: visit?.city,
    });

    const { error: updateError } = await supabase
      .from("offline_visit_images")
      .update({
        analysis_status: "analyzed",
        vision_result: result,
        error_message: null,
      })
      .eq("id", id);
    if (updateError) return Response.json({ error: updateError.message }, { status: 400 });

    await refreshVisitStatus(image.visit_id);
    revalidatePath("/zh/offline-uploads");
    revalidatePath("/en/offline-uploads");
    revalidatePath(`/zh/offline-uploads/${image.visit_id}`);
    revalidatePath(`/en/offline-uploads/${image.visit_id}`);

    return Response.json({ result });
  } catch (error) {
    const { id } = await ctx.params;
    try {
      const supabase = createSupabaseServiceClient();
      await supabase
        .from("offline_visit_images")
        .update({
          analysis_status: "failed",
          error_message: error instanceof Error ? error.message : "Unknown error",
        })
        .eq("id", id);
    } catch {}
    return Response.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}

async function refreshVisitStatus(visitId: string) {
  const supabase = createSupabaseServiceClient();
  const { data: images } = await supabase
    .from("offline_visit_images")
    .select("analysis_status, vision_result")
    .eq("visit_id", visitId);
  const statuses = (images ?? []).map((image) => image.analysis_status as string);
  const visitStatus = statuses.length === 0
    ? "draft"
    : statuses.some((status) => status === "analyzing")
      ? "analyzing"
      : statuses.some((status) => status === "pending")
        ? "uploaded"
        : statuses.every((status) => status === "failed")
          ? "failed"
          : "analyzed";

  const detectedProducts = (images ?? []).flatMap((image) => {
    const result = image.vision_result as { detected_products?: unknown[] } | null;
    return result?.detected_products ?? [];
  });

  await supabase
    .from("offline_store_visits")
    .update({
      visit_status: visitStatus,
      summary_result: {
        detected_product_count: detectedProducts.length,
        analyzed_image_count: statuses.filter((status) => status === "analyzed").length,
        failed_image_count: statuses.filter((status) => status === "failed").length,
      },
    })
    .eq("id", visitId);
}

import { revalidatePath } from "next/cache";
import { formReturnRedirect } from "@/lib/request";
import { createSupabaseServiceClient } from "@/lib/supabase";
import type { OfflineImageType } from "@/lib/types";

const imageTypes: OfflineImageType[] = ["own_shelf", "competitor_shelf", "promo_tag", "other"];
const bucketName = "offline-visit-images";
const maxFileSizeBytes = 8 * 1024 * 1024;

function isImageType(value: string): value is OfflineImageType {
  return imageTypes.includes(value as OfflineImageType);
}

export async function POST(request: Request, ctx: RouteContext<"/api/offline-store-visits/[id]/images">) {
  try {
    const { id } = await ctx.params;
    const formData = await request.formData();
    const body = Object.fromEntries(formData.entries());
    const file = formData.get("image");
    const imageType = String(formData.get("image_type") ?? "");
    const targetBrand = String(formData.get("target_brand") ?? "").trim() || null;

    if (!(file instanceof File)) {
      return Response.json({ error: "Missing image file" }, { status: 400 });
    }
    if (!isImageType(imageType)) {
      return Response.json({ error: "Invalid image type" }, { status: 400 });
    }
    if (!file.type.startsWith("image/")) {
      return Response.json({ error: "Only image files are supported" }, { status: 400 });
    }
    if (file.size > maxFileSizeBytes) {
      return Response.json({ error: "Image must be 8MB or smaller" }, { status: 400 });
    }

    const supabase = createSupabaseServiceClient();
    const { data: visit, error: visitError } = await supabase
      .from("offline_store_visits")
      .select("*")
      .eq("id", id)
      .single();
    if (visitError || !visit) {
      return Response.json({ error: visitError?.message ?? "Visit not found" }, { status: 404 });
    }

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
    const imagePath = `${id}/${imageType}/${Date.now()}-${safeName}`;
    const { error: uploadError } = await supabase.storage
      .from(bucketName)
      .upload(imagePath, file, {
        contentType: file.type,
        upsert: false,
      });
    if (uploadError) return Response.json({ error: uploadError.message }, { status: 400 });

    const { data: image, error: insertError } = await supabase
      .from("offline_visit_images")
      .insert({
        visit_id: id,
        image_type: imageType,
        image_path: imagePath,
        image_url: null,
        file_name: file.name,
        content_type: file.type,
        file_size: file.size,
        analysis_status: "pending",
        vision_result: targetBrand ? { target_brand: targetBrand } : {},
      })
      .select("*")
      .single();
    if (insertError) return Response.json({ error: insertError.message }, { status: 400 });

    await supabase
      .from("offline_store_visits")
      .update({ visit_status: "uploaded" })
      .eq("id", id);

    revalidatePath("/zh/offline-uploads");
    revalidatePath("/en/offline-uploads");
    revalidatePath(`/zh/offline-uploads/${id}`);
    revalidatePath(`/en/offline-uploads/${id}`);
    revalidatePath("/zh/mobile/offline-capture");
    revalidatePath("/en/mobile/offline-capture");

    if (formData.get("auto_analyze") === "1") {
      fetch(new URL(`/api/offline-visit-images/${image.id}/analyze`, request.url), { method: "POST" }).catch(() => {});
    }

    if (formData.get("json") === "1") return Response.json({ image });
    return formReturnRedirect(request, body, `/offline-uploads/${id}`);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}

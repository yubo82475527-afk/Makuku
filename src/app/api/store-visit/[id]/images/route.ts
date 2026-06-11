import { revalidatePath } from "next/cache";
import { createSupabaseServiceClient } from "@/lib/supabase";
import { requireAppSession } from "@/lib/auth-session";
import type { OfflineImageType, OfflineStoreVisit, StoreVisitImageCategory } from "@/lib/types";

const bucketName = "offline-visit-images";
const maxImages = 20;
const maxFileSizeBytes = 8 * 1024 * 1024;
const imageCategories: StoreVisitImageCategory[] = ["makuku_shelf", "competitor_shelf", "storefront"];

function isImageCategory(value: string): value is StoreVisitImageCategory {
  return imageCategories.includes(value as StoreVisitImageCategory);
}

function toOfflineImageType(category: StoreVisitImageCategory): OfflineImageType {
  if (category === "makuku_shelf") return "own_shelf";
  if (category === "competitor_shelf") return "competitor_shelf";
  return "other";
}

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, ctx: RouteContext) {
  try {
    const auth = await requireAppSession(request);
    if (auth.response) return auth.response;
    const { id } = await ctx.params;
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return Response.json({ error: "Image request is too large or invalid. Please compress photos and retry." }, { status: 413 });
    }

    const file = formData.get("image");
    const category = String(formData.get("image_category") ?? "");
    if (!(file instanceof File)) {
      return Response.json({ error: "Missing image file" }, { status: 400 });
    }
    if (!isImageCategory(category)) {
      return Response.json({ error: "Invalid image category" }, { status: 400 });
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
      .select("*, offline_visit_images(id)")
      .eq("id", id)
      .single();
    if (visitError || !visit) {
      return Response.json({ error: visitError?.message ?? "Visit not found" }, { status: 404 });
    }

    const typedVisit = visit as OfflineStoreVisit;
    const legacyImageCount = Array.isArray(typedVisit.image_urls) ? typedVisit.image_urls.length : 0;
    const tableImageCount = Array.isArray(typedVisit.offline_visit_images) ? typedVisit.offline_visit_images.length : 0;
    if (legacyImageCount + tableImageCount >= maxImages) {
      return Response.json({ error: "Upload up to 20 images" }, { status: 400 });
    }

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
    const imageType = toOfflineImageType(category);
    const path = `${id}/${imageType}/${Date.now()}-${safeName}`;
    const { error: uploadError } = await supabase.storage
      .from(bucketName)
      .upload(path, file, { contentType: file.type, upsert: false });
    if (uploadError) return Response.json({ error: uploadError.message }, { status: 400 });

    const { data: image, error: imageInsertError } = await supabase
      .from("offline_visit_images")
      .insert({
        visit_id: id,
        image_type: imageType,
        image_path: path,
        image_url: null,
        file_name: file.name,
        content_type: file.type,
        file_size: file.size,
        analysis_status: "pending",
        vision_result: {},
      })
      .select("*")
      .single();
    if (imageInsertError) return Response.json({ error: imageInsertError.message }, { status: 400 });

    const { data: updated, error: updateError } = await supabase
      .from("offline_store_visits")
      .update({
        visit_status: "uploaded",
        analysis_status: "pending",
        analysis_error: null,
      })
      .eq("id", id)
      .select("*")
      .single();
    if (updateError) return Response.json({ error: updateError.message }, { status: 400 });

    revalidatePath("/zh/mobile/offline-capture");
    revalidatePath("/en/mobile/offline-capture");
    revalidatePath("/zh/mobile/offline-capture/list");
    revalidatePath("/en/mobile/offline-capture/list");
    revalidatePath(`/zh/mobile/offline-capture/${id}`);
    revalidatePath(`/en/mobile/offline-capture/${id}`);

    return Response.json({ visit: updated, image_path: path, image });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}

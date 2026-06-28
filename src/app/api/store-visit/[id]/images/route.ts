import { revalidatePath } from "next/cache";
import { invalidateStoreVisitImagePriceImpact, refreshStoreVisitStoredPriceState } from "@/lib/store-visit-image-maintenance";
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

type ReplacedImageRow = {
  id: string;
  visit_id: string;
  image_type: OfflineImageType;
  vision_result: Record<string, unknown> | null;
  replaced_by_image_id: string | null;
};

function isMissingReplacementColumnsError(error: { message?: string } | null) {
  const message = error?.message ?? "";
  return message.includes("replaces_image_id") || message.includes("replaced_by_image_id");
}

function isMissingDeleteColumnsError(error: { message?: string } | null) {
  const message = error?.message ?? "";
  return message.includes("deleted_at") || message.includes("deletion_reason") || message.includes("schema cache");
}

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
    const replacesImageId = String(formData.get("replaces_image_id") ?? "").trim() || null;
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
    if (!replacesImageId) {
      return Response.json(
        { error: "Adding new photos to an existing visit is no longer supported. Create a new visit instead." },
        { status: 400 },
      );
    }

    let replacedImage: ReplacedImageRow | null = null;
    let { data: existingImage, error: existingImageError } = await supabase
      .from("offline_visit_images")
      .select("id, image_type, vision_result, visit_id, replaced_by_image_id")
      .eq("id", replacesImageId)
      .single();
    if (isMissingReplacementColumnsError(existingImageError)) {
      const legacyExistingImage = await supabase
        .from("offline_visit_images")
        .select("id, image_type, vision_result, visit_id")
        .eq("id", replacesImageId)
        .single();
      existingImage = legacyExistingImage.data
        ? { ...legacyExistingImage.data, replaced_by_image_id: null }
        : null;
      existingImageError = legacyExistingImage.error;
    }
    if (existingImageError || !existingImage || existingImage.visit_id !== id) {
      return Response.json({ error: existingImageError?.message ?? "Original image not found" }, { status: 404 });
    }
    if (existingImage.replaced_by_image_id) {
      return Response.json({ error: "Original image has already been replaced" }, { status: 400 });
    }
    replacedImage = existingImage as ReplacedImageRow;

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
    const imageType = toOfflineImageType(category);
    const path = `${id}/${imageType}/${Date.now()}-${safeName}`;
    const { error: uploadError } = await supabase.storage
      .from(bucketName)
      .upload(path, file, { contentType: file.type, upsert: false });
    if (uploadError) return Response.json({ error: uploadError.message }, { status: 400 });

    const insertPayload = {
      visit_id: id,
      replaces_image_id: replacesImageId,
      image_type: imageType,
      image_path: path,
      image_url: null,
      file_name: file.name,
      content_type: file.type,
      file_size: file.size,
      analysis_status: "pending",
      vision_result: {
        ...(replacedImage?.vision_result ?? {}),
        upload_category: category,
        is_retake: Boolean(replacesImageId),
        is_latest_version: true,
        replaced_image_id: replacesImageId,
      },
    };

    let { data: image, error: imageInsertError } = await supabase
      .from("offline_visit_images")
      .insert(insertPayload)
      .select("*")
      .single();
    if (isMissingReplacementColumnsError(imageInsertError)) {
      const legacyInsertResult = await supabase
        .from("offline_visit_images")
        .insert({
          ...insertPayload,
          vision_result: {
            ...(replacedImage?.vision_result ?? {}),
            upload_category: category,
            is_retake: Boolean(replacesImageId),
            is_latest_version: true,
            replaced_image_id: replacesImageId,
          },
        })
        .select("*")
        .single();
      image = legacyInsertResult.data;
      imageInsertError = legacyInsertResult.error;
    }
    if (imageInsertError) return Response.json({ error: imageInsertError.message }, { status: 400 });

    if (replacedImage) {
      const replacedVisionResult = {
        ...(replacedImage.vision_result ?? {}),
        is_replaced: true,
        is_latest_version: false,
        replaced_by_image_id: image.id,
      };
      let { error: replacedUpdateError } = await supabase
        .from("offline_visit_images")
        .update({
          replaced_by_image_id: image.id,
          vision_result: replacedVisionResult,
        })
        .eq("id", replacedImage.id);
      if (isMissingReplacementColumnsError(replacedUpdateError)) {
        const legacyUpdateResult = await supabase
          .from("offline_visit_images")
          .update({
            vision_result: replacedVisionResult,
          })
          .eq("id", replacedImage.id);
        replacedUpdateError = legacyUpdateResult.error;
      }
      if (replacedUpdateError) return Response.json({ error: replacedUpdateError.message }, { status: 400 });

      await invalidateStoreVisitImagePriceImpact({
        visitId: id,
        imageIds: [replacedImage.id],
        lifecycleStatus: "replaced",
        rejectionReason: "H5 replaced this photo with a newer version.",
        supabase,
      });
    }

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

export async function DELETE(request: Request, ctx: RouteContext) {
  try {
    const auth = await requireAppSession(request);
    if (auth.response) return auth.response;

    const { id } = await ctx.params;
    const body = await request.json().catch(() => ({}));
    const imageId = String(body.image_id ?? "").trim();
    if (!imageId) {
      return Response.json({ error: "image_id is required" }, { status: 400 });
    }

    const supabase = createSupabaseServiceClient();
    let { data: image, error: imageError } = await supabase
      .from("offline_visit_images")
      .select("id, visit_id, vision_result, deleted_at")
      .eq("id", imageId)
      .eq("visit_id", id)
      .single();
    if (isMissingDeleteColumnsError(imageError)) {
      const legacyImageResult = await supabase
        .from("offline_visit_images")
        .select("id, visit_id, vision_result")
        .eq("id", imageId)
        .eq("visit_id", id)
        .single();
      image = legacyImageResult.data ? { ...legacyImageResult.data, deleted_at: null } : null;
      imageError = legacyImageResult.error;
    }
    if (imageError || !image) {
      return Response.json({ error: imageError?.message ?? "Image not found" }, { status: 404 });
    }
    if (image.deleted_at) {
      return Response.json({ error: "Image has already been deleted" }, { status: 400 });
    }

    const currentVisionResult = typeof image.vision_result === "object" && image.vision_result !== null
      ? image.vision_result as Record<string, unknown>
      : {};
    const deletedAt = new Date().toISOString();
    let { error: updateError } = await supabase
      .from("offline_visit_images")
      .update({
        deleted_at: deletedAt,
        deletion_reason: "h5_deleted",
        vision_result: {
          ...currentVisionResult,
          h5_deleted: true,
          h5_deleted_at: deletedAt,
        },
      })
      .eq("id", imageId)
      .eq("visit_id", id);
    if (isMissingDeleteColumnsError(updateError)) {
      const legacyUpdateResult = await supabase
        .from("offline_visit_images")
        .update({
          vision_result: {
            ...currentVisionResult,
            h5_deleted: true,
            h5_deleted_at: deletedAt,
          },
        })
        .eq("id", imageId)
        .eq("visit_id", id);
      updateError = legacyUpdateResult.error;
    }
    if (updateError) {
      return Response.json({ error: updateError.message }, { status: 400 });
    }

    const impact = await invalidateStoreVisitImagePriceImpact({
      visitId: id,
      imageIds: [imageId],
      lifecycleStatus: "deleted",
      rejectionReason: "H5 deleted this photo.",
      supabase,
    });

    await refreshStoreVisitStoredPriceState({ visitId: id, supabase });

    revalidatePath("/zh/mobile/offline-capture");
    revalidatePath("/en/mobile/offline-capture");
    revalidatePath("/zh/mobile/offline-capture/list");
    revalidatePath("/en/mobile/offline-capture/list");
    revalidatePath(`/zh/mobile/offline-capture/${id}`);
    revalidatePath(`/en/mobile/offline-capture/${id}`);

    return Response.json({
      ok: true,
      image_id: imageId,
      deleted_snapshot_count: impact.deletedSnapshotCount,
      rejected_candidate_count: impact.rejectedCandidateCount,
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}

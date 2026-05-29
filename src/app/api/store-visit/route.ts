import { revalidatePath } from "next/cache";
import { createSupabaseServiceClient } from "@/lib/supabase";

const bucketName = "store-visits";
const maxImages = 6;
const maxFileSizeBytes = 8 * 1024 * 1024;
const imageCategories = ["makuku_shelf", "competitor_shelf", "storefront"] as const;

function clean(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

function missingColumn(error: { message?: string } | null) {
  return Boolean(error?.message?.includes("column") || error?.message?.includes("schema cache"));
}

function cleanCategory(value: FormDataEntryValue | null) {
  const category = clean(value);
  return imageCategories.includes(category as (typeof imageCategories)[number]) ? category : null;
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const storeName = clean(formData.get("store_name"));
    const region = clean(formData.get("region"));
    const channel = clean(formData.get("channel"));
    const visitDate = clean(formData.get("visit_date")) || new Date().toISOString().slice(0, 10);
    const promoter = clean(formData.get("promoter"));
    const userId = clean(formData.get("user_id")) || clean(formData.get("uploader_user_id")) || null;
    const files = formData.getAll("images").filter((file): file is File => file instanceof File);
    const categories = formData.getAll("image_categories").map(cleanCategory);

    if (!storeName || !region || !channel || !promoter) {
      return Response.json({ error: "Missing required fields" }, { status: 400 });
    }
    if (files.length === 0) {
      return Response.json({ error: "At least one image is required" }, { status: 400 });
    }
    if (files.length > maxImages) {
      return Response.json({ error: "Upload up to 6 images" }, { status: 400 });
    }
    if (categories.length !== files.length || categories.some((category) => !category)) {
      return Response.json({ error: "Image categories are invalid" }, { status: 400 });
    }
    if (!categories.includes("makuku_shelf")) {
      return Response.json({ error: "At least one Makuku shelf image is required" }, { status: 400 });
    }
    for (const file of files) {
      if (!file.type.startsWith("image/")) return Response.json({ error: "Only image files are supported" }, { status: 400 });
      if (file.size > maxFileSizeBytes) return Response.json({ error: "Each image must be 8MB or smaller" }, { status: 400 });
    }

    const supabase = createSupabaseServiceClient();
    const payload = {
      store_name: storeName,
      region,
      channel,
      promoter,
      visit_date: visitDate,
      city: region,
      channel_type: channel,
      uploader_name: promoter,
      user_id: userId,
      uploader_user_id: userId,
      visit_status: "uploaded",
      analysis_status: "pending",
      analysis_error: null,
      image_urls: [],
      image_categories: [],
      ai_result: null,
    };

    let { data: visit, error: visitError } = await supabase
      .from("offline_store_visits")
      .insert(payload)
      .select("*")
      .single();

    if (visitError?.message.includes("user_id")) {
      const uploaderOnlyPayload = {
        store_name: payload.store_name,
        region: payload.region,
        channel: payload.channel,
        promoter: payload.promoter,
        visit_date: payload.visit_date,
        city: payload.city,
        channel_type: payload.channel_type,
        uploader_name: payload.uploader_name,
        uploader_user_id: payload.uploader_user_id,
        visit_status: payload.visit_status,
        analysis_status: payload.analysis_status,
        analysis_error: payload.analysis_error,
        image_urls: payload.image_urls,
        image_categories: payload.image_categories,
        ai_result: payload.ai_result,
      };
      const fallbackResult = await supabase
        .from("offline_store_visits")
        .insert(uploaderOnlyPayload)
        .select("*")
        .single();
      visit = fallbackResult.data;
      visitError = fallbackResult.error;
    }

    if (missingColumn(visitError)) {
      return Response.json({ error: "Store visit schema is not migrated. Run the latest supabase migrations." }, { status: 500 });
    }
    if (visitError || !visit) {
      return Response.json({ error: visitError?.message ?? "Failed to create visit" }, { status: 400 });
    }

    const imageUrls: string[] = [];
    for (const file of files) {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
      const path = `store-visits/${visit.id}/${Date.now()}-${safeName}`;
      const { error: uploadError } = await supabase.storage
        .from(bucketName)
        .upload(path, file, { contentType: file.type, upsert: false });
      if (uploadError) return Response.json({ error: uploadError.message }, { status: 400 });
      imageUrls.push(path);
    }

    const { data: updated, error: updateError } = await supabase
      .from("offline_store_visits")
      .update({ image_urls: imageUrls, image_categories: categories })
      .eq("id", visit.id)
      .select("*")
      .single();

    if (updateError) return Response.json({ error: updateError.message }, { status: 400 });

    revalidatePath("/zh/mobile/offline-capture");
    revalidatePath("/en/mobile/offline-capture");
    revalidatePath("/zh/mobile/offline-capture/list");
    revalidatePath("/en/mobile/offline-capture/list");

    return Response.json({ visit: updated });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}

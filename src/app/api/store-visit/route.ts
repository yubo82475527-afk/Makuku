import { revalidatePath } from "next/cache";
import { createSupabaseServiceClient } from "@/lib/supabase";

const bucketName = "store-visits";
const maxImages = 6;
const maxFileSizeBytes = 8 * 1024 * 1024;
const imageCategories = ["makuku_shelf", "competitor_shelf", "storefront"] as const;
type StoreVisitImageCategory = (typeof imageCategories)[number];

function clean(value: FormDataEntryValue | string | number | null | undefined) {
  return String(value ?? "").trim();
}

function missingColumn(error: { message?: string } | null) {
  return Boolean(error?.message?.includes("column") || error?.message?.includes("schema cache"));
}

function cleanOptionalNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isLocationColumnError(error: { message?: string } | null) {
  const message = error?.message ?? "";
  return message.includes("latitude") || message.includes("longitude") || message.includes("location_accuracy_m") || message.includes("location_captured_at");
}

function isStoreColumnError(error: { message?: string } | null) {
  const message = error?.message ?? "";
  return message.includes("store_id") || message.includes("channel_id");
}

function cleanCategory(value: FormDataEntryValue | null) {
  const category = clean(value);
  return imageCategories.includes(category as (typeof imageCategories)[number]) ? category : null;
}

function isJsonRequest(request: Request) {
  return request.headers.get("content-type")?.includes("application/json") ?? false;
}

async function insertVisit(input: {
  storeName: string;
  city: string;
  channelType: string;
  storeId: string | null;
  channelId: string | null;
  visitDate: string;
  promoter: string;
  userId: string | null;
  latitude: number | null;
  longitude: number | null;
  locationAccuracyM: number | null;
  locationCapturedAt: string | null;
  visitStatus: "draft" | "uploaded";
}) {
  const supabase = createSupabaseServiceClient();
  const payload = {
    store_name: input.storeName,
    region: input.city,
    channel: input.channelType,
    promoter: input.promoter,
    visit_date: input.visitDate,
    city: input.city,
    channel_type: input.channelType,
    store_id: input.storeId,
    channel_id: input.channelId,
    latitude: input.latitude,
    longitude: input.longitude,
    location_accuracy_m: input.locationAccuracyM,
    location_captured_at: input.locationCapturedAt,
    uploader_name: input.promoter,
    user_id: input.userId,
    uploader_user_id: input.userId,
    visit_status: input.visitStatus,
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

  if (isLocationColumnError(visitError)) {
    const noLocationPayload = {
      store_name: payload.store_name,
      region: payload.region,
      channel: payload.channel,
      promoter: payload.promoter,
      visit_date: payload.visit_date,
      city: payload.city,
      channel_type: payload.channel_type,
      store_id: payload.store_id,
      channel_id: payload.channel_id,
      uploader_name: payload.uploader_name,
      user_id: payload.user_id,
      uploader_user_id: payload.uploader_user_id,
      visit_status: payload.visit_status,
      analysis_status: payload.analysis_status,
      analysis_error: payload.analysis_error,
      image_urls: payload.image_urls,
      image_categories: payload.image_categories,
      ai_result: payload.ai_result,
    };
    const noLocationResult = await supabase
      .from("offline_store_visits")
      .insert(noLocationPayload)
      .select("*")
      .single();
    visit = noLocationResult.data;
    visitError = noLocationResult.error;
  }

  if (isStoreColumnError(visitError)) {
    const noStorePayload = {
      store_name: payload.store_name,
      region: payload.region,
      channel: payload.channel,
      promoter: payload.promoter,
      visit_date: payload.visit_date,
      city: payload.city,
      channel_type: payload.channel_type,
      uploader_name: payload.uploader_name,
      user_id: payload.user_id,
      uploader_user_id: payload.uploader_user_id,
      visit_status: payload.visit_status,
      analysis_status: payload.analysis_status,
      analysis_error: payload.analysis_error,
      image_urls: payload.image_urls,
      image_categories: payload.image_categories,
      ai_result: payload.ai_result,
    };
    const noStoreResult = await supabase
      .from("offline_store_visits")
      .insert(noStorePayload)
      .select("*")
      .single();
    visit = noStoreResult.data;
    visitError = noStoreResult.error;
  }

  if (visitError?.message.includes("user_id")) {
    const uploaderOnlyPayload = {
      store_name: payload.store_name,
      region: payload.region,
      channel: payload.channel,
      promoter: payload.promoter,
      visit_date: payload.visit_date,
      city: payload.city,
      channel_type: payload.channel_type,
      store_id: payload.store_id,
      channel_id: payload.channel_id,
      latitude: payload.latitude,
      longitude: payload.longitude,
      location_accuracy_m: payload.location_accuracy_m,
      location_captured_at: payload.location_captured_at,
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
    throw new Error("Store visit schema is not migrated. Run the latest supabase migrations.");
  }
  if (visitError || !visit) {
    throw new Error(visitError?.message ?? "Failed to create visit");
  }

  return { supabase, visit };
}

function validateBaseFields(input: {
  storeName: string;
  city: string;
  channelType: string;
  promoter: string;
}) {
  if (!input.storeName || !input.city || !input.channelType || !input.promoter) {
    return Response.json({ error: "Missing required fields" }, { status: 400 });
  }
  return null;
}

async function resolveStoreMaster(input: {
  storeId: string | null;
  storeName: string;
  city: string;
  channelType: string;
  channelId: string | null;
}) {
  if (!input.storeId) return input;

  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("offline_stores")
    .select("id,name,city,channel_type,channel_id")
    .eq("id", input.storeId)
    .maybeSingle();

  if (error?.message.includes("offline_stores") || missingColumn(error)) return input;
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Selected store not found");

  const store = data as {
    id: string;
    name: string;
    city: string;
    channel_type: string;
    channel_id: string | null;
  };

  return {
    storeId: store.id,
    storeName: clean(store.name) || input.storeName,
    city: clean(store.city) || input.city,
    channelType: clean(store.channel_type) || input.channelType,
    channelId: store.channel_id ?? input.channelId,
  };
}

export async function POST(request: Request) {
  try {
    if (isJsonRequest(request)) {
      const body = await request.json().catch(() => ({}));
      const storeId = clean(body.store_id) || null;
      const channelId = clean(body.channel_id) || null;
      const storeName = clean(body.store_name);
      const city = clean(body.city) || clean(body.region);
      const channelType = clean(body.channel_type) || clean(body.channel);
      const visitDate = clean(body.visit_date) || new Date().toISOString().slice(0, 10);
      const promoter = clean(body.promoter);
      const userId = clean(body.user_id) || clean(body.uploader_user_id) || null;
      const latitude = cleanOptionalNumber(body.latitude);
      const longitude = cleanOptionalNumber(body.longitude);
      const locationAccuracyM = cleanOptionalNumber(body.location_accuracy_m);
      const locationCapturedAt = clean(body.location_captured_at) || null;
      const resolved = await resolveStoreMaster({ storeId, storeName, city, channelType, channelId });
      const invalid = validateBaseFields({ storeName: resolved.storeName, city: resolved.city, channelType: resolved.channelType, promoter });
      if (invalid) return invalid;

      const { visit } = await insertVisit({
        storeName: resolved.storeName,
        city: resolved.city,
        channelType: resolved.channelType,
        storeId: resolved.storeId,
        channelId: resolved.channelId,
        visitDate,
        promoter,
        userId,
        latitude,
        longitude,
        locationAccuracyM,
        locationCapturedAt,
        visitStatus: "draft",
      });

      revalidatePath("/zh/mobile/offline-capture");
      revalidatePath("/en/mobile/offline-capture");
      revalidatePath("/zh/mobile/offline-capture/list");
      revalidatePath("/en/mobile/offline-capture/list");

      return Response.json({ visit });
    }

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return Response.json({ error: "Image request is too large or invalid. Please compress photos and retry." }, { status: 413 });
    }
    const storeName = clean(formData.get("store_name"));
    const storeId = clean(formData.get("store_id")) || null;
    const channelId = clean(formData.get("channel_id")) || null;
    const city = clean(formData.get("city")) || clean(formData.get("region"));
    const channelType = clean(formData.get("channel_type")) || clean(formData.get("channel"));
    const visitDate = clean(formData.get("visit_date")) || new Date().toISOString().slice(0, 10);
    const promoter = clean(formData.get("promoter"));
    const userId = clean(formData.get("user_id")) || clean(formData.get("uploader_user_id")) || null;
    const files = formData.getAll("images").filter((file): file is File => file instanceof File);
    const categories = formData.getAll("image_categories").map(cleanCategory);

    const latitude = cleanOptionalNumber(formData.get("latitude"));
    const longitude = cleanOptionalNumber(formData.get("longitude"));
    const locationAccuracyM = cleanOptionalNumber(formData.get("location_accuracy_m"));
    const locationCapturedAt = clean(formData.get("location_captured_at")) || null;
    const resolved = await resolveStoreMaster({ storeId, storeName, city, channelType, channelId });
    const invalid = validateBaseFields({ storeName: resolved.storeName, city: resolved.city, channelType: resolved.channelType, promoter });
    if (invalid) return invalid;
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

    const { supabase, visit } = await insertVisit({
      storeName: resolved.storeName,
      city: resolved.city,
      channelType: resolved.channelType,
      storeId: resolved.storeId,
      channelId: resolved.channelId,
      visitDate,
      promoter,
      userId,
      latitude,
      longitude,
      locationAccuracyM,
      locationCapturedAt,
      visitStatus: "uploaded",
    });

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
      .update({ image_urls: imageUrls, image_categories: categories as StoreVisitImageCategory[] })
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

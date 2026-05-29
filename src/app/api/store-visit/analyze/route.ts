import { revalidatePath } from "next/cache";
import { generateAiPriceCandidates } from "@/lib/ai-price-candidates";
import { analyzeStoreVisitImages } from "@/lib/store-visit-ai";
import { createSupabaseServiceClient } from "@/lib/supabase";
import type { OfflineStoreVisit } from "@/lib/types";

const maxInlineImageBytes = 8 * 1024 * 1024;

async function failVisit(visitId: string, message: string) {
  const supabase = createSupabaseServiceClient();
  await supabase
    .from("offline_store_visits")
    .update({
      analysis_status: "failed",
      visit_status: "failed",
      analysis_error: message,
    })
    .eq("id", visitId);
}

async function imageUrlToDataUrl(url: string) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Unable to fetch signed image URL: ${response.status}`);
  }
  const contentType = response.headers.get("content-type") || "image/jpeg";
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.byteLength > maxInlineImageBytes) {
    throw new Error("Image is too large to inline for AI analysis");
  }
  return `data:${contentType};base64,${bytes.toString("base64")}`;
}

export async function POST(request: Request) {
  let visitId = "";
  try {
    const body = await request.json().catch(() => ({}));
    visitId = String(body.visit_id ?? "").trim();
    if (!visitId) return Response.json({ error: "Missing visit_id" }, { status: 400 });

    const supabase = createSupabaseServiceClient();
    const { data: visit, error } = await supabase
      .from("offline_store_visits")
      .select("*")
      .eq("id", visitId)
      .single();
    if (error || !visit) return Response.json({ error: error?.message ?? "Visit not found" }, { status: 404 });

    const typedVisit = visit as OfflineStoreVisit;
    const imagePaths = Array.isArray(typedVisit.image_urls) ? typedVisit.image_urls : [];
    const imageCategories = Array.isArray(typedVisit.image_categories) ? typedVisit.image_categories : [];
    if (imagePaths.length === 0) {
      await failVisit(visitId, "No images found for this visit");
      return Response.json({ error: "No images found for this visit" }, { status: 400 });
    }

    await supabase
      .from("offline_store_visits")
      .update({
        analysis_status: "analyzing",
        visit_status: "analyzing",
        analysis_error: null,
      })
      .eq("id", visitId);

    const signedUrls = await Promise.all(imagePaths.map(async (path) => {
      const { data } = await supabase.storage.from("store-visits").createSignedUrl(path, 60 * 10);
      return data?.signedUrl ?? null;
    }));
    const imageUrls = signedUrls.filter((url): url is string => Boolean(url));
    if (imageUrls.length === 0) throw new Error("Unable to create signed image URLs");
    const inlineImageUrls = await Promise.all(imageUrls.map(imageUrlToDataUrl));

    const aiAnalysis = await analyzeStoreVisitImages({
      imageUrls: inlineImageUrls,
      imageCategories,
      storeName: typedVisit.store_name,
      region: typedVisit.region ?? typedVisit.city,
      channel: typedVisit.channel ?? typedVisit.channel_type,
      promoter: typedVisit.promoter ?? typedVisit.uploader_name,
      visitDate: typedVisit.visit_date,
    });
    const aiResult = aiAnalysis.normalized;
    const candidates = await generateAiPriceCandidates({ visitId, aiResult });

    const { data: updated, error: updateError } = await supabase
      .from("offline_store_visits")
      .update({
        ai_result: aiResult,
        summary_result: {
          ai_result_card: aiResult,
          raw_ai_text: aiAnalysis.rawText,
          raw_ai_parsed: aiAnalysis.parsed,
          ai_provider_metadata: aiAnalysis.metadata,
          image_paths: imagePaths,
          image_categories: imageCategories,
          signed_image_count: imageUrls.length,
          image_input_mode: "data_url",
          ai_price_candidate_count: candidates.length,
        },
        analysis_status: "completed",
        visit_status: "analyzed",
        analysis_error: null,
      })
      .eq("id", visitId)
      .select("*")
      .single();

    if (updateError) throw new Error(updateError.message);

    revalidatePath("/zh/mobile/offline-capture");
    revalidatePath(`/zh/mobile/offline-capture/${visitId}`);
    revalidatePath("/en/mobile/offline-capture");
    revalidatePath(`/en/mobile/offline-capture/${visitId}`);

    return Response.json({ visit: updated, ai_result: aiResult });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (visitId) await failVisit(visitId, message);
    return Response.json({ error: message }, { status: 500 });
  }
}

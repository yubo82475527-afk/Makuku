import { revalidatePath } from "next/cache";
import { generateAiPriceCandidates } from "@/lib/ai-price-candidates";
import { runStoreVisitAiAnalysisForVisit } from "@/lib/store-visit-ai-debug";
import { createSupabaseServiceClient } from "@/lib/supabase";
import type { OfflineStoreVisit } from "@/lib/types";

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

    const aiAnalysis = await runStoreVisitAiAnalysisForVisit({ visitId });
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
          ai_config: {
            id: aiAnalysis.config.id,
            version_name: aiAnalysis.config.version_name,
            temperature: aiAnalysis.config.temperature,
            max_tokens: aiAnalysis.config.max_tokens,
          },
          image_paths: aiAnalysis.image_paths,
          image_categories: aiAnalysis.image_categories,
          signed_image_count: aiAnalysis.signed_image_count,
          image_input_mode: aiAnalysis.image_input_mode,
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

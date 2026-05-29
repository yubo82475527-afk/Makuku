import { createStoreVisitAiTestToken, normalizeStoreVisitAiConfigInput } from "@/lib/store-visit-ai-config";
import { runStoreVisitAiAnalysisForVisit } from "@/lib/store-visit-ai-debug";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const visitId = String(body.visit_id ?? "").trim();
    if (!visitId) return Response.json({ error: "Missing visit_id" }, { status: 400 });

    const config = normalizeStoreVisitAiConfigInput(body);
    const result = await runStoreVisitAiAnalysisForVisit({ visitId, config });
    const testToken = createStoreVisitAiTestToken(visitId, config);

    return Response.json({
      ok: true,
      test_token: testToken,
      visit: {
        id: result.visit.id,
        store_name: result.visit.store_name,
        city: result.visit.city,
        channel_type: result.visit.channel_type,
        visit_date: result.visit.visit_date,
      },
      normalized: result.normalized,
      rawText: result.rawText,
      parsed: result.parsed,
      metadata: result.metadata,
      debug: {
        image_paths: result.image_paths,
        image_categories: result.image_categories,
        signed_image_count: result.signed_image_count,
        image_input_mode: result.image_input_mode,
        config: {
          version_name: config.version_name,
          temperature: config.temperature,
          max_tokens: config.max_tokens,
        },
      },
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}

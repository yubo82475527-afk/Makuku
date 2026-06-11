import { getAiPriceReviewRule, upsertAiPriceReviewRule } from "@/lib/data";
import { requireAdminSession } from "@/lib/auth-session";

function finiteNumber(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function GET() {
  const result = await getAiPriceReviewRule();
  return Response.json({ rule: result.data, error: result.error, demo: result.isDemo }, { status: result.error && !result.isDemo ? 500 : 200 });
}

export async function PATCH(request: Request) {
  const auth = await requireAdminSession(request);
  if (auth.response) return auth.response;
  const body = await request.json().catch(() => ({}));
  const result = await upsertAiPriceReviewRule({
    name: String(body.name ?? "Default bulk review rule"),
    min_ai_confidence: finiteNumber(body.min_ai_confidence, 0.95),
    min_match_score: finiteNumber(body.min_match_score, 0.9),
    require_matched_entity: Boolean(body.require_matched_entity),
    require_no_warnings: Boolean(body.require_no_warnings),
    require_price_and_piece: Boolean(body.require_price_and_piece),
  });
  return Response.json({ rule: result.data, error: result.error, demo: result.isDemo }, { status: result.error && !result.isDemo ? 500 : 200 });
}

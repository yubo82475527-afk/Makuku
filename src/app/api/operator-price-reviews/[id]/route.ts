import { revalidatePath } from "next/cache";
import { approveAiPriceCandidate, rejectAiPriceCandidate } from "@/lib/ai-price-review";
import { requireAdminSession } from "@/lib/auth-session";
import { getOperatorPriceReviewDetail } from "@/lib/operator-price-review";
import { createSupabaseServiceClient } from "@/lib/supabase";
import type { AiPriceCandidateMatchType } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminSession(request);
  if (auth.response) return auth.response;

  const { id } = await context.params;
  const locale = new URL(request.url).searchParams.get("locale") === "en" ? "en" : "zh";
  const result = await getOperatorPriceReviewDetail(id, locale);
  if (result.error && !result.isDemo) return Response.json({ error: result.error }, { status: 500 });
  if (!result.data) return Response.json({ error: "Operator review candidate not found" }, { status: 404 });
  return Response.json({ item: result.data });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminSession(request);
  if (auth.response) return auth.response;

  try {
    const { id } = await context.params;
    const body = await request.json().catch(() => ({}));
    const action = String(body.action ?? "").trim();
    const reviewToken = String(body.review_token ?? "").trim();
    if (!reviewToken) return Response.json({ error: "review_token is required" }, { status: 400 });

    const locale = body.locale === "en" ? "en" : "zh";
    const detailResult = await getOperatorPriceReviewDetail(id, locale);
    if (detailResult.error && !detailResult.isDemo) throw new Error(detailResult.error);
    const detail = detailResult.data;
    if (!detail) return Response.json({ error: "Operator review candidate not found" }, { status: 404 });

    const reviewer = auth.session.displayName;
    const supabase = createSupabaseServiceClient();

    if (action === "reject") {
      const candidate = await rejectAiPriceCandidate({
        supabase,
        candidateId: id,
        reason: "operator_marked_incorrect",
        reviewer,
        reviewMethod: "manual",
        reviewToken,
      });
      revalidateReviewPaths(detail.visit_detail_href);
      return Response.json({ candidate_id: candidate.id, decision: "rejected" });
    }

    const match = normalizeMatch(body, detail.current_match_type, detail.current_match_id, detail.current_match_label);

    if (action === "confirm") {
      const result = await approveAiPriceCandidate({
        supabase,
        candidateId: id,
        priceIdr: detail.evidence_package_price,
        pieceCount: detail.evidence_piece_count,
        reviewer,
        reviewMethod: "manual",
        reviewToken,
        matchedEntityType: match.type,
        matchedEntityId: match.id,
        matchedLabel: match.label,
      });
      revalidateReviewPaths(detail.visit_detail_href);
      return Response.json({ candidate_id: result.candidate.id, snapshot_id: result.snapshot.id, decision: "confirmed" });
    }

    if (action === "correct") {
      const packagePrice = positiveNumber(body.package_price ?? body.price_idr);
      const pieceCount = positiveInteger(body.piece_count);
      if (!packagePrice || !pieceCount) {
        return Response.json({ error: "Valid package price and piece count are required" }, { status: 400 });
      }
      const result = await approveAiPriceCandidate({
        supabase,
        candidateId: id,
        priceIdr: packagePrice,
        pieceCount,
        promoType: optionalText(body.promo_type),
        reviewer,
        reviewMethod: "manual",
        reviewToken,
        matchedEntityType: match.type,
        matchedEntityId: match.id,
        matchedLabel: match.label,
      });
      revalidateReviewPaths(detail.visit_detail_href);
      return Response.json({ candidate_id: result.candidate.id, snapshot_id: result.snapshot.id, decision: "corrected" });
    }

    return Response.json({ error: "Unsupported action" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: errorStatus(message) });
  }
}

function normalizeMatch(
  body: Record<string, unknown>,
  currentType: AiPriceCandidateMatchType,
  currentId: string | null,
  currentLabel: string | null,
) {
  const requestedType = optionalText(body.matched_entity_type) as AiPriceCandidateMatchType | null;
  const type = requestedType ?? currentType;
  if (type !== "material_master" && type !== "competitor_product" && type !== "unmatched") {
    throw new Error("matched_entity_type is invalid");
  }
  const id = optionalText(body.matched_entity_id) ?? currentId;
  const label = optionalText(body.matched_label) ?? currentLabel;
  if (type === "unmatched" || !id) throw new Error("Please match a product before approving this candidate");
  return { type, id, label };
}

function revalidateReviewPaths(visitDetailHref: string) {
  revalidatePath("/zh/offline-price-candidates");
  revalidatePath("/en/offline-price-candidates");
  revalidatePath("/zh/prices");
  revalidatePath("/en/prices");
  revalidatePath("/zh/competitors");
  revalidatePath("/en/competitors");
  revalidatePath("/zh/competitor-products");
  revalidatePath("/en/competitor-products");
  revalidatePath(visitDetailHref);
}

function errorStatus(message: string) {
  if (/inputs changed|pending candidates|not ready for operator review|ownership lost/i.test(message)) return 409;
  if (/valid |required|invalid|match a product|not found/i.test(message)) return 400;
  return 500;
}

function optionalText(value: unknown) {
  const text = String(value ?? "").trim();
  return text || null;
}

function positiveNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function positiveInteger(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 && Number.isInteger(parsed) ? parsed : null;
}

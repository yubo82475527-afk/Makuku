import { revalidatePath } from "next/cache";
import { approveAiPriceCandidate, rejectAiPriceCandidate } from "@/lib/ai-price-review";
import { createSupabaseServiceClient } from "@/lib/supabase";
import { requireAdminSession } from "@/lib/auth-session";

function revalidateReviewPaths() {
  revalidatePath("/zh/offline-price-candidates");
  revalidatePath("/en/offline-price-candidates");
  revalidatePath("/zh/prices");
  revalidatePath("/en/prices");
  revalidatePath("/zh/competitors");
  revalidatePath("/en/competitors");
}

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAdminSession(request);
    if (auth.response) return auth.response;
    const { id } = await ctx.params;
    const body = await request.json().catch(() => ({}));
    const action = String(body.action ?? "").trim();
    const reviewer = String(body.reviewer ?? "").trim() || null;
    const supabase = createSupabaseServiceClient();

    if (action === "save_review_input") {
      const price = Number(body.price_idr);
      const pieceCount = Number(body.piece_count);
      if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(pieceCount) || pieceCount <= 0) {
        return Response.json({ error: "Valid package price and piece count are required" }, { status: 400 });
      }

      const pricePerPiece = Math.round(price / Math.floor(pieceCount) * 100) / 100;
      const { data: candidate, error } = await supabase
        .from("ai_price_candidates")
        .update({
          parsed_price_idr: Math.round(price),
          piece_count: Math.floor(pieceCount),
          price_per_piece: pricePerPiece,
        })
        .eq("id", id)
        .eq("status", "pending")
        .select("*")
        .single();
      if (error || !candidate) throw new Error(error?.message ?? "Pending candidate not found");
      revalidateReviewPaths();
      return Response.json({ candidate });
    }

    if (action === "approve") {
      const result = await approveAiPriceCandidate({
        supabase,
        candidateId: id,
        priceIdr: body.price_idr ? Number(body.price_idr) : null,
        pieceCount: body.piece_count ? Number(body.piece_count) : null,
        reviewer,
        reviewMethod: "manual",
      });
      revalidateReviewPaths();
      return Response.json(result);
    }

    if (action === "reject") {
      const candidate = await rejectAiPriceCandidate({
        supabase,
        candidateId: id,
        reason: String(body.reason ?? "Rejected by reviewer"),
        reviewer,
        reviewMethod: "manual",
      });
      revalidateReviewPaths();
      return Response.json({ candidate });
    }

    return Response.json({ error: "Unsupported action" }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const auth = await requireAdminSession(request);
  if (auth.response) return auth.response;
  return Response.json({ error: "Use PATCH action=reject to keep review audit history." }, { status: 405 });
}

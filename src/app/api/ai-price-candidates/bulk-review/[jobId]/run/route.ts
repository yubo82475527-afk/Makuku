import { revalidatePath } from "next/cache";
import { approveAiPriceCandidate, candidateMatchesReviewRule, rejectAiPriceCandidate } from "@/lib/ai-price-review";
import { createSupabaseServiceClient, hasSupabaseServiceConfig } from "@/lib/supabase";
import { requireAdminSession } from "@/lib/auth-session";
import type { AiPriceCandidate, AiPriceReviewRule } from "@/lib/types";

const BATCH_REVIEW_CHUNK_SIZE = 10;

function revalidateReviewPaths() {
  revalidatePath("/zh/offline-price-candidates");
  revalidatePath("/en/offline-price-candidates");
  revalidatePath("/zh/prices");
  revalidatePath("/en/prices");
  revalidatePath("/zh/competitors");
  revalidatePath("/en/competitors");
  revalidatePath("/zh/competitor-products");
  revalidatePath("/en/competitor-products");
}

function cleanJobReviewOverrides(value: unknown) {
  const source = typeof value === "object" && value ? value as Record<string, unknown> : {};
  const reviewOverrides: Record<string, { price_idr: number; net_price_idr: number; piece_count: number; promo_type: string | null }> = {};

  for (const [candidateId, rawOverride] of Object.entries(source)) {
    const override = typeof rawOverride === "object" && rawOverride ? rawOverride as Record<string, unknown> : {};
    const priceIdr = Number(override.net_price_idr ?? override.price_idr);
    const pieceCount = Number(override.piece_count);
    if (!Number.isFinite(priceIdr) || priceIdr <= 0 || !Number.isFinite(pieceCount) || pieceCount <= 0) continue;
    reviewOverrides[candidateId] = {
      price_idr: Math.round(priceIdr),
      net_price_idr: Math.round(priceIdr),
      piece_count: Math.floor(pieceCount),
      promo_type: cleanOptionalText(override.promo_type),
    };
  }

  return reviewOverrides;
}

function cleanOptionalText(value: unknown) {
  const text = String(value ?? "").trim();
  return text ? text : null;
}

async function refreshJobCounts(supabase: ReturnType<typeof createSupabaseServiceClient>, jobId: string) {
  const { data: items, error } = await supabase
    .from("ai_price_review_job_items")
    .select("status")
    .eq("job_id", jobId);
  if (error) throw new Error(error.message);
  const counts = (items ?? []).reduce((acc, item) => {
    const status = String(item.status);
    if (status === "succeeded") acc.success_count += 1;
    if (status === "skipped") acc.skipped_count += 1;
    if (status === "failed") acc.failed_count += 1;
    if (status === "queued" || status === "processing") acc.remaining_count += 1;
    return acc;
  }, { success_count: 0, skipped_count: 0, failed_count: 0, remaining_count: 0 });

  const completed = counts.remaining_count === 0;
  const { data: job, error: updateError } = await supabase
    .from("ai_price_review_jobs")
    .update({
      status: completed ? "completed" : "running",
      success_count: counts.success_count,
      skipped_count: counts.skipped_count,
      failed_count: counts.failed_count,
      completed_at: completed ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobId)
    .select("*")
    .single();
  if (updateError) throw new Error(updateError.message);
  return job;
}

export async function POST(request: Request, ctx: { params: Promise<{ jobId: string }> }) {
  const auth = await requireAdminSession(request);
  if (auth.response) return auth.response;
  if (!hasSupabaseServiceConfig()) {
    return Response.json({ error: "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" }, { status: 500 });
  }

  const { jobId } = await ctx.params;
  const supabase = createSupabaseServiceClient();
  const { data: job, error: jobError } = await supabase
    .from("ai_price_review_jobs")
    .select("*")
    .eq("id", jobId)
    .single();
  if (jobError || !job) return Response.json({ error: jobError?.message ?? "Review job not found" }, { status: 404 });
  if (job.status === "completed") return Response.json({ job, processed: 0 });
  const filterSnapshot = typeof job.filter_snapshot === "object" && job.filter_snapshot ? job.filter_snapshot as Record<string, unknown> : {};
  const manualOverride = Boolean(filterSnapshot.manual_override);
  const reviewOverrides = cleanJobReviewOverrides(filterSnapshot.review_overrides);

  await supabase
    .from("ai_price_review_jobs")
    .update({ status: "running", started_at: job.started_at ?? new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", jobId);

  const { data: items, error: itemError } = await supabase
    .from("ai_price_review_job_items")
    .select("*, ai_price_candidates(*)")
    .eq("job_id", jobId)
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(BATCH_REVIEW_CHUNK_SIZE);
  if (itemError) return Response.json({ error: itemError.message }, { status: 500 });

  for (const item of items ?? []) {
    const candidate = item.ai_price_candidates as AiPriceCandidate | null;
    try {
      await supabase.from("ai_price_review_job_items").update({ status: "processing", updated_at: new Date().toISOString() }).eq("id", item.id);
      if (!candidate) throw new Error("Candidate not found");

      if (job.action === "reject") {
        await rejectAiPriceCandidate({
          supabase,
          candidateId: candidate.id,
          reason: String(job.rejection_reason ?? "Rejected by bulk review"),
          reviewJobId: jobId,
          reviewer: job.created_by,
          reviewMethod: "bulk_manual",
        });
        await supabase.from("ai_price_review_job_items").update({ status: "succeeded", updated_at: new Date().toISOString() }).eq("id", item.id);
        continue;
      }

      if (!manualOverride) {
        const eligibility = candidateMatchesReviewRule(candidate, job.rule_snapshot as AiPriceReviewRule);
        if (!eligibility.eligible) {
          await supabase.from("ai_price_review_job_items").update({ status: "skipped", error_message: eligibility.reason, updated_at: new Date().toISOString() }).eq("id", item.id);
          continue;
        }
      }

      const overrideForCandidate = reviewOverrides[candidate.id];
      await approveAiPriceCandidate({
        supabase,
        candidateId: candidate.id,
        priceIdr: overrideForCandidate?.net_price_idr ?? candidate.net_price_idr ?? candidate.parsed_price_idr,
        pieceCount: overrideForCandidate?.piece_count ?? candidate.piece_count,
        promoType: overrideForCandidate?.promo_type ?? candidate.promo_type,
        reviewJobId: jobId,
        reviewer: job.created_by,
        reviewMethod: "bulk_manual",
      });
      await supabase.from("ai_price_review_job_items").update({ status: "succeeded", updated_at: new Date().toISOString() }).eq("id", item.id);
    } catch (error) {
      await supabase
        .from("ai_price_review_job_items")
        .update({
          status: "failed",
          error_message: error instanceof Error ? error.message : "Unknown error",
          updated_at: new Date().toISOString(),
        })
        .eq("id", item.id);
    }
  }

  const updatedJob = await refreshJobCounts(supabase, jobId);
  revalidateReviewPaths();
  return Response.json({ job: updatedJob, processed: (items ?? []).length });
}

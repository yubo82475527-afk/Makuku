import { getAiPriceReviewRule } from "@/lib/data";
import { createSupabaseServiceClient, hasSupabaseServiceConfig } from "@/lib/supabase";

const maxJobItems = 5000;

function cleanIds(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => String(item).trim()).filter(Boolean)
    : [];
}

function cleanReviewOverrides(value: unknown, allowedIds: string[]) {
  const source = typeof value === "object" && value ? value as Record<string, unknown> : {};
  const allowed = new Set(allowedIds);
  const reviewOverrides: Record<string, { price_idr: number; piece_count: number }> = {};

  for (const [candidateId, rawOverride] of Object.entries(source)) {
    if (!allowed.has(candidateId)) continue;
    const override = typeof rawOverride === "object" && rawOverride ? rawOverride as Record<string, unknown> : {};
    const priceIdr = Number(override.price_idr);
    const pieceCount = Number(override.piece_count);
    if (!Number.isFinite(priceIdr) || priceIdr <= 0 || !Number.isFinite(pieceCount) || pieceCount <= 0) continue;
    reviewOverrides[candidateId] = {
      price_idr: Math.round(priceIdr),
      piece_count: Math.floor(pieceCount),
    };
  }

  return reviewOverrides;
}

function cleanFilters(value: unknown) {
  const source = typeof value === "object" && value ? value as Record<string, unknown> : {};
  return {
    status: source.status === "approved" || source.status === "rejected" ? source.status : "pending",
    date_from: typeof source.date_from === "string" ? source.date_from : "",
    date_to: typeof source.date_to === "string" ? source.date_to : "",
  };
}

export async function POST(request: Request) {
  if (!hasSupabaseServiceConfig()) {
    return Response.json({ error: "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" }, { status: 500 });
  }

  const body = await request.json().catch(() => ({}));
  const action = body.action === "reject" ? "reject" : "approve";
  const selectedIds = cleanIds(body.ids);
  const filters = cleanFilters(body.filters);
  const rejectionReason = String(body.rejection_reason ?? "").trim();
  const manualOverride = Boolean(body.manual_override);
  if (action === "reject" && !rejectionReason) {
    return Response.json({ error: "Rejection reason is required" }, { status: 400 });
  }

  const ruleResult = await getAiPriceReviewRule();
  if (ruleResult.error && !ruleResult.isDemo) return Response.json({ error: ruleResult.error }, { status: 500 });

  const supabase = createSupabaseServiceClient();
  let candidateIds = selectedIds;
  if (candidateIds.length === 0) {
    let query = supabase
      .from("ai_price_candidates")
      .select("id, offline_store_visits!inner(visit_date)")
      .eq("status", filters.status)
      .limit(maxJobItems);
    if (filters.date_from) query = query.gte("offline_store_visits.visit_date", filters.date_from);
    if (filters.date_to) query = query.lte("offline_store_visits.visit_date", filters.date_to);
    const { data, error } = await query;
    if (error) return Response.json({ error: error.message }, { status: 500 });
    candidateIds = (data ?? []).map((item) => String(item.id));
  }

  if (candidateIds.length === 0) {
    return Response.json({ error: "No candidates matched the batch review request" }, { status: 400 });
  }
  const reviewOverrides = cleanReviewOverrides(body.review_overrides, candidateIds);

  const { data: job, error: jobError } = await supabase
    .from("ai_price_review_jobs")
    .insert({
      action,
      status: "queued",
      rule_snapshot: ruleResult.data,
      filter_snapshot: selectedIds.length > 0 ? { ids: candidateIds, manual_override: manualOverride, review_overrides: reviewOverrides } : filters,
      rejection_reason: action === "reject" ? rejectionReason : null,
      total_count: candidateIds.length,
      created_by: String(body.reviewer ?? "").trim() || null,
    })
    .select("*")
    .single();
  if (jobError || !job) return Response.json({ error: jobError?.message ?? "Failed to create review job" }, { status: 500 });

  const itemRows = candidateIds.map((candidateId) => ({ job_id: job.id, candidate_id: candidateId, status: "queued" }));
  const { error: itemError } = await supabase.from("ai_price_review_job_items").insert(itemRows);
  if (itemError) return Response.json({ error: itemError.message }, { status: 500 });

  return Response.json({ job: { ...job, total_count: candidateIds.length } });
}

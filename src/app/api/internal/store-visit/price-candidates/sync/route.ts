import { syncStoreVisitPriceCandidatesFromImages } from "@/lib/store-visit-price-candidate-sync";
import { createSupabaseServiceClient } from "@/lib/supabase";

function isAuthorized(request: Request) {
  const expected = process.env.INTERNAL_JOB_SECRET || process.env.CRON_SECRET;
  if (!expected) return process.env.NODE_ENV !== "production";
  return request.headers.get("x-internal-job-secret") === expected
    || request.headers.get("authorization") === `Bearer ${expected}`;
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const visitId = String(body.visit_id ?? "").trim();
  const visitCode = String(body.visit_code ?? "").trim();
  const limit = Math.max(1, Math.min(100, Number(body.limit ?? 25) || 25));
  const supabase = createSupabaseServiceClient();

  let visitIds: string[] = [];
  if (visitId) {
    visitIds = [visitId];
  } else if (visitCode) {
    const { data, error } = await supabase
      .from("offline_store_visits")
      .select("id")
      .eq("visit_code", visitCode)
      .single();
    if (error || !data) return Response.json({ error: error?.message ?? "Visit not found" }, { status: 404 });
    visitIds = [String(data.id)];
  } else {
    const { data, error } = await supabase
      .from("offline_store_visits")
      .select("id")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) return Response.json({ error: error.message }, { status: 400 });
    visitIds = (data ?? []).map((row) => String(row.id));
  }

  const results = [];
  for (const id of visitIds) {
    const result = await syncStoreVisitPriceCandidatesFromImages({ visitId: id, supabase });
    results.push({ visit_id: id, ...result });
  }

  return Response.json({
    synced_visit_count: results.length,
    inserted_count: results.reduce((sum, item) => sum + item.inserted_count, 0),
    results,
  });
}

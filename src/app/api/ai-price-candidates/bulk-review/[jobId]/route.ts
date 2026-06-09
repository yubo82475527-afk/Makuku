import { createSupabaseServiceClient, hasSupabaseServiceConfig } from "@/lib/supabase";

export async function GET(_request: Request, ctx: { params: Promise<{ jobId: string }> }) {
  if (!hasSupabaseServiceConfig()) {
    return Response.json({ error: "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" }, { status: 500 });
  }
  const { jobId } = await ctx.params;
  const supabase = createSupabaseServiceClient();
  const { data: job, error } = await supabase
    .from("ai_price_review_jobs")
    .select("*")
    .eq("id", jobId)
    .single();
  if (error || !job) return Response.json({ error: error?.message ?? "Review job not found" }, { status: 404 });

  const { data: items, error: itemError } = await supabase
    .from("ai_price_review_job_items")
    .select("*")
    .eq("job_id", jobId)
    .order("created_at", { ascending: true })
    .limit(200);
  if (itemError) return Response.json({ error: itemError.message }, { status: 500 });

  return Response.json({ job, items: items ?? [] });
}

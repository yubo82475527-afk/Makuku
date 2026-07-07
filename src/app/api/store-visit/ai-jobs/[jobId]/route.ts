import { isAllowedAdminRole, requireAppSession } from "@/lib/auth-session";
import { createSupabaseServiceClient } from "@/lib/supabase";
import {
  loadStoreVisitAiJob,
  summarizeStoreVisitAiJob,
} from "@/lib/store-visit-ai-jobs";

export const dynamic = "force-dynamic";

async function canReadVisitJob(input: {
  visitId: string;
  userId: string;
  role: string;
}) {
  if (isAllowedAdminRole(input.role)) return true;
  const supabase = createSupabaseServiceClient();
  const current = await supabase
    .from("offline_store_visits")
    .select("id,user_id,uploader_user_id")
    .eq("id", input.visitId)
    .single();
  let data = current.data;
  let error = current.error;
  if (error?.message.includes("user_id")) {
    const legacy = await supabase
      .from("offline_store_visits")
      .select("id,uploader_user_id")
      .eq("id", input.visitId)
      .single();
    data = legacy.data ? { ...legacy.data, user_id: null } : legacy.data;
    error = legacy.error;
  }
  if (error || !data) return false;
  const row = data as { user_id?: string | null; uploader_user_id?: string | null };
  return row.user_id === input.userId || row.uploader_user_id === input.userId;
}

export async function GET(request: Request, ctx: { params: Promise<{ jobId: string }> }) {
  const auth = await requireAppSession(request);
  if (auth.response) return auth.response;

  try {
    const { jobId } = await ctx.params;
    const { job, items } = await loadStoreVisitAiJob({ jobId });
    const allowed = await canReadVisitJob({
      visitId: job.visit_id,
      userId: auth.session.id,
      role: auth.session.role,
    });
    if (!allowed) return Response.json({ error: "Not found" }, { status: 404 });

    return Response.json({
      job: {
        id: job.id,
        visit_id: job.visit_id,
        job_type: job.job_type,
        status: job.status,
        total_count: job.total_count,
        success_count: job.success_count,
        failed_count: job.failed_count,
        retake_required_count: job.retake_required_count,
        remaining_count: job.remaining_count,
        started_at: job.started_at,
        completed_at: job.completed_at,
      },
      items: items.map((item) => ({
        id: item.id,
        source_image_id: item.source_image_id,
        position: item.position,
        status: item.status,
      })),
      summary: summarizeStoreVisitAiJob(job, items),
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 404 });
  }
}

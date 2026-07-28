import { requireAdminSession } from "@/lib/auth-session";
import { rerunStoreVisitMatching } from "@/lib/store-visit-matching-rerun";
import { createStoreVisitMatchingRerunGateway } from "@/lib/store-visit-matching-rerun-gateway";
import { createSupabaseServiceClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await requireAdminSession(request);
  if (auth.response) return auth.response;

  try {
    const body = await request.json().catch(() => ({}));
    const supabase = createSupabaseServiceClient();
    const result = await rerunStoreVisitMatching(
      body,
      createStoreVisitMatchingRerunGateway(supabase, { requestUrl: request.url }),
    );
    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Matching rerun failed";
    const status = /exactly one|valid YYYY-MM-DD|cannot be after|No Visits found/.test(message) ? 400 : 500;
    return Response.json({ error: message }, { status });
  }
}

import { requirePagePermission } from "@/lib/auth-session";
import {
  getKnowledgeVersionDetail,
  listKnowledgeVersions,
  listRecentFallbackTurns,
  publishKnowledgeVersion,
} from "@/lib/usage-assistant";
import { hashUsageAssistantFacts, buildUsageAssistantFacts } from "@/lib/usage-assistant-facts";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requirePagePermission(request, "usage-assistant-knowledge");
  if (auth.response) return auth.response;

  try {
    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    const view = url.searchParams.get("view") || "detail";

    if (view === "versions") {
      const versions = await listKnowledgeVersions();
      return Response.json(versions);
    }
    if (view === "fallbacks") {
      const turns = await listRecentFallbackTurns();
      return Response.json({ turns });
    }

    const detail = await getKnowledgeVersionDetail(id);
    return Response.json({
      ...detail,
      liveFactsSourceHash: hashUsageAssistantFacts(buildUsageAssistantFacts()),
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const auth = await requirePagePermission(request, "usage-assistant-knowledge");
  if (auth.response) return auth.response;

  try {
    const body = await request.json().catch(() => ({}));
    const howtoZh = String(body.howtoZh ?? "");
    const howtoEn = String(body.howtoEn ?? "");
    const syncFacts = body.syncFacts !== false;
    const note = String(body.note ?? "");

    const pack = await publishKnowledgeVersion({
      howtoZh,
      howtoEn,
      syncFacts,
      note,
      session: auth.session,
    });

    return Response.json({
      pack,
      currentFactsSourceHash: hashUsageAssistantFacts(buildUsageAssistantFacts()),
      factsOutOfDate: false,
      usingSeed: false,
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

import { requireAdminSession } from "@/lib/auth-session";
import { askUsageAssistant } from "@/lib/usage-assistant";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await requireAdminSession(request);
  if (auth.response) return auth.response;

  try {
    const body = await request.json().catch(() => ({}));
    const message = String(body.message ?? "").trim();
    const uiLocale = String(body.locale ?? body.uiLocale ?? "en");
    const currentPath = String(body.currentPath ?? "");
    const history = Array.isArray(body.history) ? body.history : [];

    const result = await askUsageAssistant({
      message,
      uiLocale,
      currentPath,
      history,
      session: auth.session,
    });

    return Response.json(result);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

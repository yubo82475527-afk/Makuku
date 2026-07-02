import { revalidatePath } from "next/cache";
import { dispatchDueAgentReports } from "@/lib/agent-report-subscriptions";
import { requireAdminSession } from "@/lib/auth-session";
import { readRequestBody } from "@/lib/request";

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function readBoolean(value: unknown) {
  if (typeof value === "boolean") return value;
  const text = clean(value).toLowerCase();
  return text === "true" || text === "1" || text === "yes";
}

export async function POST(request: Request) {
  try {
    const auth = await requireAdminSession(request);
    if (auth.response) return auth.response;

    const { body } = await readRequestBody(request);
    const runAt = clean(body.run_at);
    const force = readBoolean(body.force);
    const result = await dispatchDueAgentReports({
      runAt: runAt || undefined,
      force,
    });
    if (!result.error) {
      revalidatePath("/zh/report-center");
      revalidatePath("/en/report-center");
    }
    return Response.json({ jobs: result.data, error: result.error, demo: result.isDemo }, { status: result.error ? 400 : 200 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 400 });
  }
}

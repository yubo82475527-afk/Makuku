import { revalidatePath } from "next/cache";
import { generateReportFromSubscription } from "@/lib/agent-report-subscriptions";
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
    const subscriptionId = clean(body.subscription_id);
    const periodAnchor = clean(body.period_anchor);
    const force = readBoolean(body.force);

    if (!subscriptionId) return Response.json({ error: "Missing subscription_id" }, { status: 400 });
    if (!periodAnchor) return Response.json({ error: "Missing period_anchor" }, { status: 400 });

    const result = await generateReportFromSubscription({
      subscriptionId,
      periodAnchor,
      force,
    });
    if (!result.error) {
      revalidatePath("/zh/report-center");
      revalidatePath("/en/report-center");
    }
    return Response.json({ report: result.data.report, recipient: result.data.recipient, error: result.error, demo: result.isDemo }, { status: result.error ? 400 : 200 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 400 });
  }
}

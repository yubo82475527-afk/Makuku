import { requireAppSession } from "@/lib/auth-session";
import { cleanPageNumber, cleanPageSize, proxyExternalMdJson } from "../_shared";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireAppSession(request);
  if (auth.response) return auth.response;

  try {
    // Proxy the external mdCustomer store query so dealerUserId and auth headers never leave the server.
    const { searchParams } = new URL(request.url);
    const dealerUserId = searchParams.get("dealerUserId")?.trim() ?? "";
    if (!dealerUserId) {
      return Response.json({ error: "Missing required fields: dealerUserId" }, { status: 400 });
    }

    const params = new URLSearchParams();
    const q = searchParams.get("q")?.trim() ?? "";
    const code = searchParams.get("code")?.trim() ?? "";
    const pageNo = cleanPageNumber(searchParams.get("pageNo"), 1);
    const pageSize = cleanPageSize(searchParams.get("pageSize"));

    params.set("dealerUserId", dealerUserId);
    if (code) params.set("code", code);
    else if (q) params.set("name", q);
    params.set("pageNo", String(pageNo));
    params.set("pageSize", String(pageSize));

    const data = await proxyExternalMdJson("mdCustomer/anon/getMdCustomerPage/page", params);
    return Response.json({ data });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "External MD store query failed" }, { status: 500 });
  }
}

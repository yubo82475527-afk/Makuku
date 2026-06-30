import { requireAppSession } from "@/lib/auth-session";
import { cleanPageNumber, cleanPageSize, proxyExternalMdJson } from "../_shared";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireAppSession(request);
  if (auth.response) return auth.response;

  try {
    // Proxy the external dealer query so AccessKey / AccessSecret / tenantId stay server-side.
    const { searchParams } = new URL(request.url);
    const params = new URLSearchParams();
    const q = searchParams.get("q")?.trim() ?? "";
    const code = searchParams.get("code")?.trim() ?? "";
    const pageNo = cleanPageNumber(searchParams.get("pageNo"), 1);
    const pageSize = cleanPageSize(searchParams.get("pageSize"));

    if (code) params.set("code", code);
    else if (q) params.set("name", q);
    params.set("pageNo", String(pageNo));
    params.set("pageSize", String(pageSize));

    const data = await proxyExternalMdJson("mdCustomer/anon/dealersInfo/page", params);
    return Response.json({ data });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "External MD dealer query failed" }, { status: 500 });
  }
}

import { revalidatePath } from "next/cache";
import { formReturnRedirect, readRequestBody } from "@/lib/request";
import { getChannels } from "@/lib/data";
import { createSupabaseServiceClient } from "@/lib/supabase";

export async function GET() {
  const result = await getChannels();
  return Response.json({
    channels: result.data,
    error: result.error,
    demo: result.isDemo,
  }, { status: result.error && !result.isDemo ? 400 : 200 });
}

export async function POST(request: Request) {
  try {
    const { body, isForm } = await readRequestBody(request);
    const code = String(body.code ?? "").trim().toLowerCase().replaceAll(" ", "_");
    const name = String(body.name ?? "").trim();
    const type = String(body.type ?? "offline").trim();
    const sortOrder = Number(body.sort_order ?? 100);

    if (!code || !name || !["online", "offline"].includes(type)) {
      return Response.json({ error: "Missing required fields: code, name, type" }, { status: 400 });
    }

    const supabase = createSupabaseServiceClient();
    const { data, error } = await supabase
      .from("channels")
      .insert({
        code,
        name,
        type,
        sort_order: Number.isFinite(sortOrder) ? sortOrder : 100,
        active: true,
      })
      .select("*")
      .single();

    if (error) return Response.json({ error: error.message }, { status: 400 });

    revalidatePath("/zh/dashboard");
    revalidatePath("/en/dashboard");
    revalidatePath("/zh/channels");
    revalidatePath("/en/channels");

    if (isForm) return formReturnRedirect(request, body, "/channels");
    return Response.json({ channel: data });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}

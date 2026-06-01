import { revalidatePath } from "next/cache";
import { formReturnRedirect, readRequestBody } from "@/lib/request";
import { getOfflineStores } from "@/lib/data";
import { createSupabaseServiceClient } from "@/lib/supabase";

function isMissingSchemaError(error: { message?: string } | null) {
  return Boolean(error?.message?.includes("Could not find the table") || error?.message?.includes("schema cache"));
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q")?.trim() ?? "";
    const result = await getOfflineStores();
    const keyword = q.toLowerCase();
    const stores = result.data
      .filter((store) => !keyword || store.name.toLowerCase().includes(keyword) || store.city.toLowerCase().includes(keyword))
      .slice(0, 100);

    if (result.error && result.isDemo) return Response.json({ error: result.error, stores, demo: true }, { status: 400 });
    return Response.json({ stores, demo: result.isDemo, error: result.error });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { body, isForm } = await readRequestBody(request);
    const name = String(body.name ?? "").trim();
    const city = String(body.city ?? "").trim();
    const channelId = String(body.channel_id ?? "").trim() || null;
    const channelTypeFromBody = String(body.channel_type ?? "").trim();
    const address = String(body.address ?? "").trim();

    if (!name || !city || (!channelId && !channelTypeFromBody)) {
      return Response.json({ error: "Missing required fields: name, city, channel_id" }, { status: 400 });
    }

    const supabase = createSupabaseServiceClient();
    let channelType = channelTypeFromBody;
    if (channelId) {
      const { data: channel } = await supabase
        .from("channels")
        .select("id,code,type")
        .eq("id", channelId)
        .eq("type", "offline")
        .maybeSingle();
      if (!channel && !channelTypeFromBody) return Response.json({ error: "Offline channel not found" }, { status: 404 });
      channelType = channelTypeFromBody || channel?.code || "other";
    }

    let { data, error } = await supabase
      .from("offline_stores")
      .insert({ name, city, channel_type: channelType, channel_id: channelId, address: address || null })
      .select("*, channels(id,code,name,type)")
      .single();

    if (error?.message.includes("channel_id") || error?.message.includes("channels")) {
      const legacy = await supabase
        .from("offline_stores")
        .insert({ name, city, channel_type: channelType, address: address || null })
        .select("*")
        .single();
      data = legacy.data;
      error = legacy.error;
    }

    if (isMissingSchemaError(error) && process.env.NODE_ENV !== "production") {
      return Response.json({
        store: {
          id: `demo-store-${Date.now()}`,
          name,
          city,
          channel_type: channelType,
          channel_id: channelId,
          address: address || null,
        },
        demo: true,
      });
    }
    if (error) return Response.json({ error: error.message }, { status: 400 });

    revalidatePath("/zh/dashboard");
    revalidatePath("/en/dashboard");
    revalidatePath("/zh/offline-stores");
    revalidatePath("/en/offline-stores");

    if (isForm) return formReturnRedirect(request, body, "/offline-stores");
    return Response.json({ store: data });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}

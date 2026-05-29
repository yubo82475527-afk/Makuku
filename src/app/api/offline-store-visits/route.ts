import { revalidatePath } from "next/cache";
import { formReturnRedirect, readRequestBody } from "@/lib/request";
import { getOfflineStoreVisits } from "@/lib/data";
import { createSupabaseServiceClient } from "@/lib/supabase";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Number(searchParams.get("limit") ?? 100);
    const result = await getOfflineStoreVisits({
      q: searchParams.get("q")?.trim() || undefined,
      city: searchParams.get("city")?.trim() || undefined,
      status: searchParams.get("status")?.trim() || undefined,
      uploaderName: searchParams.get("uploader_name")?.trim() || undefined,
      uploaderUserId: searchParams.get("uploader_user_id")?.trim() || undefined,
      dateFrom: searchParams.get("date_from")?.trim() || undefined,
      dateTo: searchParams.get("date_to")?.trim() || undefined,
      limit: Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 200) : 100,
    });

    return Response.json({
      visits: result.data,
      error: result.error,
      demo: result.isDemo,
    }, { status: result.error && !result.isDemo ? 400 : 200 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { body, isForm } = await readRequestBody(request);
    const storeName = String(body.store_name ?? "").trim();
    const city = String(body.city ?? "").trim();
    const channelType = String(body.channel_type ?? "").trim();
    const uploaderName = String(body.uploader_name ?? "").trim();
    const uploaderUserId = String(body.user_id ?? body.uploader_user_id ?? "").trim();
    const visitDate = String(body.visit_date ?? new Date().toISOString().slice(0, 10)).trim();

    if (!storeName || !city || !channelType || !uploaderName) {
      return Response.json({ error: "Missing required visit fields" }, { status: 400 });
    }

    const supabase = createSupabaseServiceClient();
    const payload = {
      store_name: storeName,
      city,
      channel_type: channelType,
      uploader_name: uploaderName,
      user_id: uploaderUserId || null,
      uploader_user_id: uploaderUserId || null,
      visit_date: visitDate,
      visit_status: "draft",
    };

    let { data, error } = await supabase
      .from("offline_store_visits")
      .insert(payload)
      .select("*")
      .single();

    if (error?.message.includes("user_id") && uploaderUserId) {
      const uploaderOnlyPayload = {
        store_name: payload.store_name,
        city: payload.city,
        channel_type: payload.channel_type,
        uploader_name: payload.uploader_name,
        uploader_user_id: payload.uploader_user_id,
        visit_date: payload.visit_date,
        visit_status: payload.visit_status,
      };
      const uploaderOnlyResult = await supabase
        .from("offline_store_visits")
        .insert(uploaderOnlyPayload)
        .select("*")
        .single();
      data = uploaderOnlyResult.data;
      error = uploaderOnlyResult.error;
    }

    if (error?.message.includes("uploader_user_id") || error?.message.includes("user_id")) {
      const legacyPayload = {
        store_name: payload.store_name,
        city: payload.city,
        channel_type: payload.channel_type,
        uploader_name: payload.uploader_name,
        visit_date: payload.visit_date,
        visit_status: payload.visit_status,
      };
      const legacyResult = await supabase
        .from("offline_store_visits")
        .insert(legacyPayload)
        .select("*")
        .single();
      data = legacyResult.data;
      error = legacyResult.error;
    }

    if (error) return Response.json({ error: error.message }, { status: 400 });

    revalidatePath("/zh/offline-uploads");
    revalidatePath("/en/offline-uploads");
    revalidatePath("/zh/mobile/offline-capture");
    revalidatePath("/en/mobile/offline-capture");
    revalidatePath("/zh/mobile/offline-capture/list");
    revalidatePath("/en/mobile/offline-capture/list");

    if (isForm) return formReturnRedirect(request, body, `/offline-uploads/${data.id}`);
    return Response.json({ visit: data });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}

import { createSupabaseServiceClient } from "@/lib/supabase";

const DEMO_STORES = [
  {
    id: "demo-store-jakarta",
    name: "Demo Jakarta Baby Store",
    city: "Jakarta",
    channel_type: "baby_store",
    address: "Demo address",
  },
  {
    id: "demo-store-surabaya",
    name: "Demo Surabaya Modern Trade",
    city: "Surabaya",
    channel_type: "modern_trade",
    address: "Demo address",
  },
];

function isMissingTableError(error: { message?: string } | null) {
  return Boolean(error?.message?.includes("Could not find the table"));
}

function filterDemoStores(q: string) {
  const keyword = q.toLowerCase();
  return DEMO_STORES.filter(
    (store) => !keyword || store.name.toLowerCase().includes(keyword) || store.city.toLowerCase().includes(keyword),
  );
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q")?.trim() ?? "";

    const supabase = createSupabaseServiceClient();
    let query = supabase.from("offline_stores").select("*").order("name").limit(20);

    if (q) {
      query = query.or(`name.ilike.%${q}%,city.ilike.%${q}%`);
    }

    const { data, error } = await query;
    if (isMissingTableError(error) && process.env.NODE_ENV !== "production") {
      return Response.json({ stores: filterDemoStores(q), demo: true });
    }
    if (error) return Response.json({ error: error.message }, { status: 400 });
    return Response.json({ stores: data ?? [] });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const name = String(body.name ?? "").trim();
    const city = String(body.city ?? "").trim();
    const channelType = String(body.channel_type ?? "").trim();
    const address = String(body.address ?? "").trim();

    if (!name || !city || !channelType) {
      return Response.json({ error: "Missing required fields: name, city, channel_type" }, { status: 400 });
    }

    const supabase = createSupabaseServiceClient();
    const { data, error } = await supabase
      .from("offline_stores")
      .insert({ name, city, channel_type: channelType, address: address || null })
      .select("*")
      .single();

    if (isMissingTableError(error) && process.env.NODE_ENV !== "production") {
      return Response.json({
        store: {
          id: `demo-store-${Date.now()}`,
          name,
          city,
          channel_type: channelType,
          address: address || null,
        },
        demo: true,
      });
    }
    if (error) return Response.json({ error: error.message }, { status: 400 });
    return Response.json({ store: data });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}

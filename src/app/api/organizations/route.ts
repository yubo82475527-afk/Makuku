import { revalidatePath } from "next/cache";
import { requireAdminSession } from "@/lib/auth-session";
import {
  listActiveOrganizationsByExternalOrgId,
  normalizeExternalOrgId,
} from "@/lib/organizations";
import { readRequestBody } from "@/lib/request";
import { createSupabaseServiceClient } from "@/lib/supabase";

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function revalidateOrganizationViews() {
  revalidatePath("/zh/dashboard");
  revalidatePath("/en/dashboard");
  revalidatePath("/zh/organizations");
  revalidatePath("/en/organizations");
  revalidatePath("/zh/offline-stores");
  revalidatePath("/en/offline-stores");
}

type ExternalOrganizationStoreRow = {
  id: string;
  external_org_id?: string | null;
  organization_id?: string | null;
  organization_assignment_method?: string | null;
};

async function listStoresForExternalOrganizationReconciliation(
  supabase: ReturnType<typeof createSupabaseServiceClient>,
  organizationId: string,
  impactedExternalOrgIds: Set<string>,
) {
  const rows: ExternalOrganizationStoreRow[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabase
      .from("offline_stores")
      .select("id,external_org_id,organization_id,organization_assignment_method")
      .range(from, from + pageSize - 1)
      .returns<ExternalOrganizationStoreRow[]>();

    if (error) throw new Error(error.message);
    const pageRows = data ?? [];
    rows.push(...pageRows.filter((store) => {
      const externalOrgId = normalizeExternalOrgId(store.external_org_id);
      return impactedExternalOrgIds.has(externalOrgId)
        || (store.organization_id === organizationId && store.organization_assignment_method === "external_org_id");
    }));
    if (pageRows.length < pageSize) return rows;
    from += pageSize;
  }
}

async function reconcileStoresForExternalOrganization(
  supabase: ReturnType<typeof createSupabaseServiceClient>,
  organizationId: string,
  previousExternalOrgId: string | null,
  nextExternalOrgId: string | null,
) {
  const impactedExternalOrgIds = new Set(
    [normalizeExternalOrgId(previousExternalOrgId), normalizeExternalOrgId(nextExternalOrgId)].filter(Boolean),
  );
  if (impactedExternalOrgIds.size === 0) return { updated_count: 0 };

  const [stores, organizationsByExternalOrgId] = await Promise.all([
    listStoresForExternalOrganizationReconciliation(supabase, organizationId, impactedExternalOrgIds),
    listActiveOrganizationsByExternalOrgId(supabase),
  ]);

  const clearIds: string[] = [];
  const assignIdsByOrganization = new Map<string, string[]>();

  for (const store of stores) {
    if (store.organization_assignment_method === "manual") continue;
    const externalOrgId = normalizeExternalOrgId(store.external_org_id);
    const matchedOrganizationId = organizationsByExternalOrgId.get(externalOrgId) ?? null;

    if (matchedOrganizationId) {
      const ids = assignIdsByOrganization.get(matchedOrganizationId) ?? [];
      ids.push(store.id);
      assignIdsByOrganization.set(matchedOrganizationId, ids);
      continue;
    }

    if (store.organization_assignment_method === "external_org_id") {
      clearIds.push(store.id);
    }
  }

  const now = new Date().toISOString();
  let updatedCount = 0;

  for (const [matchedOrganizationId, ids] of assignIdsByOrganization.entries()) {
    const { data, error } = await supabase
      .from("offline_stores")
      .update({
        organization_id: matchedOrganizationId,
        organization_assignment_method: "external_org_id",
        organization_assigned_at: now,
        organization_region_rule_id: null,
      })
      .in("id", ids)
      .select("id")
      .returns<{ id: string }[]>();

    if (error) throw new Error(error.message);
    updatedCount += data?.length ?? 0;
  }

  if (clearIds.length > 0) {
    const { data, error } = await supabase
      .from("offline_stores")
      .update({
        organization_id: null,
        organization_assignment_method: null,
        organization_assigned_at: null,
        organization_region_rule_id: null,
      })
      .in("id", clearIds)
      .select("id")
      .returns<{ id: string }[]>();

    if (error) throw new Error(error.message);
    updatedCount += data?.length ?? 0;
  }

  return { updated_count: updatedCount };
}

export async function POST(request: Request) {
  try {
    const auth = await requireAdminSession(request);
    if (auth.response) return auth.response;
    const { body } = await readRequestBody(request);
    const name = clean(body.name);
    const notes = clean(body.notes) || null;
    const externalOrgId = clean(body.external_org_id) || null;
    if (!name) return Response.json({ error: "Missing organization name" }, { status: 400 });

    const supabase = createSupabaseServiceClient();
    const { data, error } = await supabase
      .from("organizations")
      .insert({ name, notes, external_org_id: externalOrgId, status: "active" })
      .select("*")
      .single();

    if (error) return Response.json({ error: error.message }, { status: 400 });
    const storeUpdate = await reconcileStoresForExternalOrganization(supabase, data.id, null, externalOrgId);
    revalidateOrganizationViews();
    return Response.json({ organization: data, ...storeUpdate });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await requireAdminSession(request);
    if (auth.response) return auth.response;
    const { body } = await readRequestBody(request);
    const id = clean(body.id);
    const status = clean(body.status);
    const hasExternalOrgId = Object.prototype.hasOwnProperty.call(body, "external_org_id");
    const externalOrgId = hasExternalOrgId ? clean(body.external_org_id) || null : undefined;
    if (!id) return Response.json({ error: "Missing organization id" }, { status: 400 });
    if (!hasExternalOrgId && status !== "active" && status !== "inactive") return Response.json({ error: "Missing valid status" }, { status: 400 });

    const supabase = createSupabaseServiceClient();
    const { data: previousOrganization, error: previousOrganizationError } = await supabase
      .from("organizations")
      .select("external_org_id")
      .eq("id", id)
      .maybeSingle<{ external_org_id?: string | null }>();
    if (previousOrganizationError) return Response.json({ error: previousOrganizationError.message }, { status: 400 });

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (status === "active" || status === "inactive") patch.status = status;
    if (hasExternalOrgId) patch.external_org_id = externalOrgId;

    const { data, error } = await supabase
      .from("organizations")
      .update(patch)
      .eq("id", id)
      .select("*")
      .single();

    if (error) return Response.json({ error: error.message }, { status: 400 });
    const storeUpdate = hasExternalOrgId
      ? await reconcileStoresForExternalOrganization(
        supabase,
        id,
        previousOrganization?.external_org_id ?? null,
        externalOrgId ?? null,
      )
      : { updated_count: 0 };
    revalidateOrganizationViews();
    return Response.json({ organization: data, ...storeUpdate });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}

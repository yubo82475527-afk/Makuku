import { createJsonChatCompletion, hasAiConfig } from "@/lib/ai-client";
import { createSupabaseServiceClient } from "@/lib/supabase";
import { organizationAssignmentPatch, resolveOrganizationForRegion } from "@/lib/organizations";
import type { OfflineStore, Organization } from "@/lib/types";

type Supabase = ReturnType<typeof createSupabaseServiceClient>;

type AssignmentStatus = "rule_matched" | "ai_suggested" | "unassigned" | "manual_skipped";

export type StoreOrganizationAssignmentResult = {
  id: string;
  store_name: string;
  status: AssignmentStatus;
  organization_name: string | null;
  confidence: number | null;
  reason: string;
};

type AiSuggestion = {
  organization_name?: string;
  confidence?: number;
  reason?: string;
};

type RegionRuleForAi = {
  province: string;
  city_name?: string | null;
  district?: string | null;
  organizations?: { name?: string | null } | { name?: string | null }[] | null;
};

function normalize(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

async function suggestOrganizationWithAi(input: {
  store: Pick<OfflineStore, "name" | "province" | "city_name" | "district" | "address" | "organization_assignment_method">;
  organizations: Pick<Organization, "name">[];
  regionRules: Array<{ organization_name: string | null; province: string; city_name?: string | null; district?: string | null }>;
}): Promise<AiSuggestion | null> {
  if (!hasAiConfig()) return null;

  const messages = [
    {
      role: "system" as const,
      content: [
        "You assign a store to one of the provided organization names.",
        "Return strict JSON with organization_name, confidence, reason.",
        "confidence must be a number between 0 and 1.",
        "If unsure, set confidence below 0.85.",
      ].join(" "),
    },
    {
      role: "user" as const,
      content: JSON.stringify({
        store: {
          name: input.store.name,
          province: input.store.province,
          city_name: input.store.city_name,
          district: input.store.district,
          address: input.store.address,
        },
        organizations: input.organizations.map((organization) => organization.name),
        region_rules: input.regionRules,
      }),
    },
  ];

  const { parsed } = await createJsonChatCompletion({ messages, temperature: 0, maxTokens: 300 });
  const suggestion = parsed as AiSuggestion;
  if (!suggestion || typeof suggestion !== "object") return null;
  return {
    organization_name: typeof suggestion.organization_name === "string" ? suggestion.organization_name : undefined,
    confidence: typeof suggestion.confidence === "number" ? suggestion.confidence : undefined,
    reason: typeof suggestion.reason === "string" ? suggestion.reason : undefined,
  };
}

async function updateStoreAssignment(supabase: Supabase, storeId: string, patch: Record<string, unknown>) {
  const { error } = await supabase.from("offline_stores").update(patch).eq("id", storeId);
  if (error) throw new Error(error.message);
}

export async function assignOrganizationForStore(
  supabase: Supabase,
  store: Pick<OfflineStore, "id" | "name" | "province" | "city_name" | "district" | "address" | "organization_assignment_method" | "organization_id">,
): Promise<StoreOrganizationAssignmentResult> {
  if (store.organization_assignment_method === "manual" && store.organization_id) {
    const { data } = await supabase
      .from("organizations")
      .select("name")
      .eq("id", store.organization_id)
      .maybeSingle();
    return {
      id: store.id,
      store_name: store.name,
      status: "manual_skipped",
      organization_name: data?.name ?? null,
      confidence: null,
      reason: "Manual assignment skipped",
    };
  }

  const ruleAssignment = await resolveOrganizationForRegion(supabase, {
    province: store.province,
    cityName: store.city_name,
    district: store.district,
  });
  if (ruleAssignment) {
    const patch = organizationAssignmentPatch(ruleAssignment);
    await updateStoreAssignment(supabase, store.id, {
      ...patch,
      organization_assignment_confidence: null,
      organization_assignment_reason: null,
    });
    return {
      id: store.id,
      store_name: store.name,
      status: "rule_matched",
      organization_name: ruleAssignment.rule.organizations?.name ?? null,
      confidence: null,
      reason: "Matched organization region rule",
    };
  }

  const { data: organizations } = await supabase.from("organizations").select("id,name").eq("status", "active");
  const { data: regionRules } = await supabase
    .from("organization_region_rules")
    .select("province,city_name,district,organizations(name)")
    .eq("active", true);
  const typedRegionRules = (regionRules ?? []) as RegionRuleForAi[];
  let suggestion: AiSuggestion | null = null;
  try {
    suggestion = await suggestOrganizationWithAi({
      store,
      organizations: (organizations ?? []) as Pick<Organization, "name">[],
      regionRules: typedRegionRules.map((rule) => ({
        organization_name: Array.isArray(rule.organizations) ? (rule.organizations[0]?.name ?? null) : (rule.organizations?.name ?? null),
        province: rule.province,
        city_name: rule.city_name,
        district: rule.district,
      })),
    });
  } catch (error) {
    suggestion = {
      reason: error instanceof Error ? error.message : "AI suggestion failed",
    };
  }

  const matchedOrganization = suggestion?.organization_name
    ? (organizations ?? []).find((organization) => normalize(organization.name) === normalize(suggestion.organization_name))
    : null;

  if (matchedOrganization && (suggestion?.confidence ?? 0) >= 0.85) {
    await updateStoreAssignment(supabase, store.id, {
      organization_id: matchedOrganization.id,
      organization_assignment_method: "ai_suggested",
      organization_assigned_at: new Date().toISOString(),
      organization_region_rule_id: null,
      organization_assignment_confidence: suggestion?.confidence ?? null,
      organization_assignment_reason: suggestion?.reason ?? "AI suggested organization",
    });

    return {
      id: store.id,
      store_name: store.name,
      status: "ai_suggested",
      organization_name: matchedOrganization.name,
      confidence: suggestion?.confidence ?? null,
      reason: suggestion?.reason ?? "AI suggested organization",
    };
  }

  await updateStoreAssignment(supabase, store.id, {
    organization_id: null,
    organization_assignment_method: null,
    organization_assigned_at: null,
    organization_region_rule_id: null,
    organization_assignment_confidence: suggestion?.confidence ?? null,
    organization_assignment_reason: suggestion?.reason ?? (hasAiConfig() ? "AI confidence too low" : "AI not configured"),
  });

  return {
    id: store.id,
    store_name: store.name,
    status: "unassigned",
    organization_name: null,
    confidence: suggestion?.confidence ?? null,
    reason: suggestion?.reason ?? (hasAiConfig() ? "AI confidence too low" : "AI not configured"),
  };
}

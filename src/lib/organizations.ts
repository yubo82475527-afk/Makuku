import { createSupabaseServiceClient } from "@/lib/supabase";
import type { OrganizationRegionRule } from "@/lib/types";

type Supabase = ReturnType<typeof createSupabaseServiceClient>;

function clean(value: string | null | undefined) {
  return value?.trim() || "";
}

export function normalizeExternalOrgId(value: string | null | undefined) {
  const text = clean(value);
  return text ? text.toLowerCase() : "";
}

export function normalizeRegionPart(value: string | null | undefined) {
  return clean(value).toLowerCase();
}

export type OrganizationRegionInput = {
  province?: string | null;
  cityName?: string | null;
  district?: string | null;
};

export type ResolvedOrganizationAssignment = {
  organization_id: string;
  organization_region_rule_id: string;
  organization_assignment_method: "auto_region_rule";
  organization_assigned_at: string;
  rule: OrganizationRegionRule;
};

export type ResolvedExternalOrganizationAssignment = {
  organization_id: string;
  organization_assignment_method: "external_org_id";
  organization_assigned_at: string;
};

export async function listActiveOrganizationsByExternalOrgId(
  supabase: Supabase,
): Promise<Map<string, string>> {
  const { data, error } = await supabase
    .from("organizations")
    .select("id,external_org_id")
    .eq("status", "active")
    .not("external_org_id", "is", null);

  if (error) {
    if (error.message.includes("external_org_id") || error.message.includes("schema cache")) return new Map();
    throw new Error(error.message);
  }

  const result = new Map<string, string>();
  for (const row of (data ?? []) as Array<{ id?: string | null; external_org_id?: string | null }>) {
    const key = normalizeExternalOrgId(row.external_org_id);
    if (!key || !row.id || result.has(key)) continue;
    result.set(key, String(row.id));
  }
  return result;
}

export async function resolveOrganizationForRegion(
  supabase: Supabase,
  input: OrganizationRegionInput,
): Promise<ResolvedOrganizationAssignment | null> {
  const province = normalizeRegionPart(input.province);
  const cityName = normalizeRegionPart(input.cityName);
  const district = normalizeRegionPart(input.district);
  if (!province) return null;

  let query = supabase
    .from("organization_region_rules")
    .select("*, organizations(id,name,status)")
    .eq("active", true)
    .ilike("province", province);

  if (cityName) query = query.or(`city_name.ilike.${cityName},city_name.is.null`);
  else query = query.is("city_name", null);

  const { data, error } = await query;
  if (error) {
    if (error.message.includes("organization_region_rules") || error.message.includes("schema cache")) return null;
    throw new Error(error.message);
  }

  const rules = ((data ?? []) as OrganizationRegionRule[]).filter((rule) => rule.organizations?.status !== "inactive");
  const exactDistrict = cityName && district
    ? rules.find((rule) => normalizeRegionPart(rule.city_name) === cityName && normalizeRegionPart(rule.district) === district)
    : null;
  const cityRule = cityName
    ? rules.find((rule) => normalizeRegionPart(rule.city_name) === cityName && !normalizeRegionPart(rule.district))
    : null;
  const provinceRule = rules.find((rule) => !normalizeRegionPart(rule.city_name) && !normalizeRegionPart(rule.district));
  const rule = exactDistrict ?? cityRule ?? provinceRule ?? null;
  if (!rule) return null;

  return {
    organization_id: rule.organization_id,
    organization_region_rule_id: rule.id,
    organization_assignment_method: "auto_region_rule",
    organization_assigned_at: new Date().toISOString(),
    rule,
  };
}

export async function resolveOrganizationByExternalOrgId(
  supabase: Supabase,
  externalOrgId: string | null | undefined,
): Promise<ResolvedExternalOrganizationAssignment | null> {
  const normalizedExternalOrgId = normalizeExternalOrgId(externalOrgId);
  if (!normalizedExternalOrgId) return null;
  const organizationsByExternalOrgId = await listActiveOrganizationsByExternalOrgId(supabase);
  const organizationId = organizationsByExternalOrgId.get(normalizedExternalOrgId);
  if (!organizationId) return null;

  return {
    organization_id: organizationId,
    organization_assignment_method: "external_org_id",
    organization_assigned_at: new Date().toISOString(),
  };
}

export function organizationAssignmentPatch(assignment: ResolvedOrganizationAssignment | null) {
  return assignment
    ? {
        organization_id: assignment.organization_id,
        organization_assignment_method: assignment.organization_assignment_method,
        organization_assigned_at: assignment.organization_assigned_at,
        organization_region_rule_id: assignment.organization_region_rule_id,
      }
    : {
        organization_id: null,
        organization_assignment_method: null,
        organization_assigned_at: null,
        organization_region_rule_id: null,
      };
}

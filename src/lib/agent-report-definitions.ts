import type { AgentReportDefinition, AgentReportFamily, AgentReportScopeType } from "./types.ts";

const REGISTRY: AgentReportDefinition[] = [
  {
    code: "daily_price_country",
    family: "daily",
    name: "Daily Price Country Report",
    description: "Country-level prior-day daily price summary.",
    enabled: true,
    supported_scope_types: ["global"],
    default_schedule_rule: {
      send_time_local: "08:30:00",
      send_weekday: null,
      send_day_of_month: null,
    },
    template_version: 1,
  },
  {
    code: "daily_price_organization",
    family: "daily",
    name: "Daily Price Organization Report",
    description: "Organization-level prior-day daily price summary.",
    enabled: false,
    supported_scope_types: ["organization"],
    default_schedule_rule: {
      send_time_local: "08:30:00",
      send_weekday: null,
      send_day_of_month: null,
    },
    template_version: 1,
  },
  {
    code: "weekly_price_management",
    family: "weekly",
    name: "Weekly Price Management Report",
    description: "Management weekly price intelligence summary.",
    enabled: false,
    supported_scope_types: ["global"],
    default_schedule_rule: {
      send_time_local: "09:00:00",
      send_weekday: 1,
      send_day_of_month: null,
    },
    template_version: 1,
  },
  {
    code: "weekly_price_organization",
    family: "weekly",
    name: "Weekly Price Organization Report",
    description: "Organization weekly price performance summary.",
    enabled: false,
    supported_scope_types: ["organization"],
    default_schedule_rule: {
      send_time_local: "09:00:00",
      send_weekday: 1,
      send_day_of_month: null,
    },
    template_version: 1,
  },
  {
    code: "monthly_price_country_summary",
    family: "monthly",
    name: "Monthly Price Country Summary",
    description: "Country-level monthly price summary.",
    enabled: false,
    supported_scope_types: ["global"],
    default_schedule_rule: {
      send_time_local: "10:00:00",
      send_weekday: null,
      send_day_of_month: 1,
    },
    template_version: 1,
  },
];

const BY_CODE = new Map(REGISTRY.map((definition) => [definition.code, definition]));

export function listAgentReportDefinitions() {
  return REGISTRY.slice();
}

export function listEnabledAgentReportDefinitions() {
  return REGISTRY.filter((definition) => definition.enabled);
}

export function getAgentReportDefinition(code: string) {
  const definition = BY_CODE.get(code);
  if (!definition) throw new Error(`Unknown report_definition_code: ${code}`);
  return definition;
}

export function definitionSupportsScope(definition: Pick<AgentReportDefinition, "supported_scope_types">, scopeType: AgentReportScopeType) {
  return definition.supported_scope_types.includes(scopeType);
}

export function legacyReportTypeToDefinitionCode(reportType: AgentReportFamily, scopeType: AgentReportScopeType) {
  if (reportType === "daily") return scopeType === "organization" ? "daily_price_organization" : "daily_price_country";
  if (reportType === "weekly") return scopeType === "organization" ? "weekly_price_organization" : "weekly_price_management";
  return "monthly_price_country_summary";
}

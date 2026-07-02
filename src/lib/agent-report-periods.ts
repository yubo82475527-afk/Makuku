import { getAgentReportDefinition } from "./agent-report-definitions.ts";
import type { AgentReportDefinition } from "./types.ts";

const JAKARTA_TIMEZONE = "Asia/Jakarta";

function toJakartaDateParts(input: string | Date) {
  const date = input instanceof Date ? input : new Date(input);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: JAKARTA_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const read = (type: string) => Number(parts.find((item) => item.type === type)?.value ?? 0);
  return {
    year: read("year"),
    month: read("month"),
    day: read("day"),
  };
}

function dateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfPreviousMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() - 1, 1);
}

export function resolveLatestPeriodAnchor(definitionInput: AgentReportDefinition | string, now: string | Date = new Date()) {
  const definition = typeof definitionInput === "string" ? getAgentReportDefinition(definitionInput) : definitionInput;
  const jakarta = toJakartaDateParts(now);
  const base = new Date(jakarta.year, jakarta.month - 1, jakarta.day);

  if (definition.family === "daily") {
    base.setDate(base.getDate() - 1);
    return dateKey(base);
  }

  if (definition.family === "weekly") {
    base.setDate(base.getDate() - 7);
    return dateKey(base);
  }

  return dateKey(startOfPreviousMonth(base));
}

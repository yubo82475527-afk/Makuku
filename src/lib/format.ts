import type { Severity } from "@/lib/types";

export function formatIdr(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatPricePerPiece(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  return `${formatIdr(value)}/pc`;
}

export function formatPercent(value: number | null | undefined, digits = 1) {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  return `${value.toFixed(digits)}%`;
}

export function formatJakartaTime(value: string | null | undefined) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value)).replace(",", "");
}

export function formatJakartaDateTimeSeconds(value: string | null | undefined) {
  if (!value) return "-";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date(value));
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  const hour = parts.find((part) => part.type === "hour")?.value;
  const minute = parts.find((part) => part.type === "minute")?.value;
  const second = parts.find((part) => part.type === "second")?.value;
  return year && month && day && hour && minute && second
    ? `${year}-${month}-${day} ${hour}:${minute}:${second}`
    : "-";
}

export function formatShortImageId(value: string | null | undefined, length = 8) {
  const normalized = String(value ?? "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  if (!normalized) return "-";
  const safeLength = Math.min(Math.max(length, 4), 10);
  return normalized.slice(-safeLength);
}

export function severityClass(severity: Severity | string | null | undefined) {
  switch (severity) {
    case "critical":
      return "bg-red-100 text-red-800 ring-red-200";
    case "high":
      return "bg-rose-100 text-rose-800 ring-rose-200";
    case "medium":
      return "bg-yellow-100 text-yellow-800 ring-yellow-200";
    case "low":
      return "bg-emerald-100 text-emerald-800 ring-emerald-200";
    default:
      return "bg-slate-100 text-slate-700 ring-slate-200";
  }
}

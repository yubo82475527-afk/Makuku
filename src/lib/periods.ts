import type { MarketBenchmarkPeriodType, MarketBenchmarkWeekMode } from "@/lib/types";

export type BenchmarkPeriod = {
  key?: string;
  periodType: MarketBenchmarkPeriodType;
  startDate: string;
  endDate: string;
  label?: string;
};

export const DEFAULT_WEEK_MODE: MarketBenchmarkWeekMode = "month_fixed_4";

export function currentBenchmarkPeriod(
  periodType: MarketBenchmarkPeriodType = "week",
  date = new Date(),
  weekMode: MarketBenchmarkWeekMode = DEFAULT_WEEK_MODE,
): BenchmarkPeriod {
  if (periodType === "month") {
    const start = new Date(date.getFullYear(), date.getMonth(), 1);
    const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
    return { periodType, startDate: dateKey(start), endDate: dateKey(end) };
  }

  if (weekMode === "natural_week") {
    const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const day = start.getDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    start.setDate(start.getDate() + mondayOffset);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return { periodType, startDate: dateKey(start), endDate: dateKey(end) };
  }

  const month = dateKey(date).slice(0, 7);
  return monthFixedWeekForDate(month, date);
}

export function monthWeeks(
  month: string,
  weekMode: MarketBenchmarkWeekMode = DEFAULT_WEEK_MODE,
): BenchmarkPeriod[] {
  if (weekMode === "natural_week") {
    const [year, monthNumber] = month.split("-").map(Number);
    const first = new Date(year, (monthNumber ?? 1) - 1, 1);
    const last = new Date(year, monthNumber ?? 1, 0);
    const weeks: BenchmarkPeriod[] = [];
    let cursor = new Date(first);
    while (cursor <= last) {
      const period = currentBenchmarkPeriod("week", cursor, weekMode);
      const startDate = period.startDate < month ? `${month}-01` : period.startDate;
      const monthEnd = dateKey(last);
      const endDate = period.endDate > monthEnd ? monthEnd : period.endDate;
      const label = `W${weeks.length + 1}`;
      weeks.push({ ...period, key: label, startDate, endDate, label });
      const next = parseLocalDate(endDate);
      next.setDate(next.getDate() + 1);
      cursor = next;
    }
    return weeks;
  }

  return [
    { key: "W1", periodType: "week", label: "W1", startDate: `${month}-01`, endDate: `${month}-07` },
    { key: "W2", periodType: "week", label: "W2", startDate: `${month}-08`, endDate: `${month}-14` },
    { key: "W3", periodType: "week", label: "W3", startDate: `${month}-15`, endDate: `${month}-21` },
    { key: "W4", periodType: "week", label: "W4", startDate: `${month}-22`, endDate: monthEndDate(month) },
  ];
}

export function periodLabelForDate(
  value: string | null | undefined,
  weekMode: MarketBenchmarkWeekMode = DEFAULT_WEEK_MODE,
) {
  if (!value) return null;
  const date = parseLocalDate(value);
  if (Number.isNaN(date.getTime())) return null;
  if (weekMode === "natural_week") {
    const period = currentBenchmarkPeriod("week", date, weekMode);
    return period.label ?? null;
  }
  const day = date.getDate();
  if (day <= 7) return "W1";
  if (day <= 14) return "W2";
  if (day <= 21) return "W3";
  return "W4";
}

function monthFixedWeekForDate(month: string, date: Date): BenchmarkPeriod {
  const day = date.getDate();
  if (day <= 7) return { key: "W1", periodType: "week", label: "W1", startDate: `${month}-01`, endDate: `${month}-07` };
  if (day <= 14) return { key: "W2", periodType: "week", label: "W2", startDate: `${month}-08`, endDate: `${month}-14` };
  if (day <= 21) return { key: "W3", periodType: "week", label: "W3", startDate: `${month}-15`, endDate: `${month}-21` };
  return { key: "W4", periodType: "week", label: "W4", startDate: `${month}-22`, endDate: monthEndDate(month) };
}

function monthEndDate(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const end = new Date(year, monthNumber ?? 1, 0);
  return dateKey(end);
}

function parseLocalDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1);
}

function dateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

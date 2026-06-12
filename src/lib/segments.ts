import type { Segment } from "@/lib/types";

export const productGradeValues: Segment[] = ["AD", "BD Eco", "BD MID", "unknown"];

export function productGradeLabel(value: string | null | undefined) {
  if (value === "AD") return "AD";
  if (value === "BD Eco") return "BD Eco";
  if (value === "BD MID") return "BD MID";
  return "unknown";
}

export function normalizeProductGrade(value: string | null | undefined): Segment {
  const text = String(value ?? "").trim();
  if (text === "AD" || text.toLowerCase() === "adult diapers") return "AD";
  if (text === "BD Eco" || text.toLowerCase() === "bd eco" || text.toLowerCase() === "baby diapers economy") return "BD Eco";
  if (text === "BD MID" || text.toLowerCase() === "bd mid" || text.toLowerCase() === "baby diapers medium") return "BD MID";
  if (text === "premium" || text === "mid") return "BD MID";
  if (text === "value") return "BD Eco";
  return "unknown";
}

export function productGradeOptions() {
  return productGradeValues.map((value) => ({ value, label: productGradeLabel(value) }));
}

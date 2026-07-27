/** Shared helpers for price-index package multi-select filters (comma-separated in URL). */

export function normalizePackageFilterList(value: unknown): string[] {
  const values = Array.isArray(value)
    ? value
    : String(value ?? "").split(",");
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of values) {
    const text = String(item ?? "").trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    result.push(text);
  }
  return result;
}

export function joinPackageFilterList(values: string[] | null | undefined): string | undefined {
  const next = normalizePackageFilterList(values);
  return next.length ? next.join(",") : undefined;
}

export function intersectPackageFilterList(selected: string[], options: string[]): string[] {
  const allowed = new Set(options);
  return selected.filter((item) => allowed.has(item));
}

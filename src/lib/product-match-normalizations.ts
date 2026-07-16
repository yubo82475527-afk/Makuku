export type ProductMatchNormalizationField = "brand" | "series" | "size" | "piece_count";

export type ProductMatchNormalizationRule = {
  id: string;
  field: ProductMatchNormalizationField;
  brand_scope: string | null;
  source_value: string;
  canonical_value: string;
  active: boolean;
};

export type ProductMatchNormalizationCatalog = Record<ProductMatchNormalizationField, Array<string | number>>;

export type ProductMatchNormalizedValue = {
  value: string | null;
  ruleId: string | null;
};

type NormalizationEntry = {
  sourceKey: string;
  compactSourceKey: string;
  canonicalValue: string;
  ruleId: string | null;
};

function cleanValue(value: unknown) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

function compactValue(value: unknown) {
  return cleanValue(value).replace(/\s+/g, "");
}

function scopeKey(value: unknown) {
  return cleanValue(value) || "*";
}

function isBarePositiveInteger(value: unknown) {
  return /^\d+$/.test(String(value ?? "").trim());
}

function addEntry(target: Map<string, NormalizationEntry[]>, scope: string, entry: NormalizationEntry) {
  const entries = target.get(scope) ?? [];
  entries.push(entry);
  target.set(scope, entries);
}

function entriesForField(
  field: ProductMatchNormalizationField,
  rules: ProductMatchNormalizationRule[],
  catalog: ProductMatchNormalizationCatalog,
) {
  const entries = new Map<string, NormalizationEntry[]>();
  for (const value of catalog[field]) {
    const canonicalValue = String(value).trim();
    const sourceKey = cleanValue(canonicalValue);
    if (!sourceKey) continue;
    addEntry(entries, "*", {
      sourceKey,
      compactSourceKey: compactValue(canonicalValue),
      canonicalValue,
      ruleId: null,
    });
  }

  for (const rule of rules) {
    if (!rule.active || rule.field !== field) continue;
    if (field === "piece_count" && isBarePositiveInteger(rule.source_value) && rule.source_value.trim() !== rule.canonical_value.trim()) {
      throw new Error("piece_count rules cannot remap a bare integer");
    }
    const sourceKey = cleanValue(rule.source_value);
    const canonicalValue = String(rule.canonical_value ?? "").trim();
    if (!sourceKey || !canonicalValue) continue;
    addEntry(entries, scopeKey(rule.brand_scope), {
      sourceKey,
      compactSourceKey: compactValue(rule.source_value),
      canonicalValue,
      ruleId: rule.id,
    });
  }

  for (const scopedEntries of entries.values()) {
    scopedEntries.sort((left, right) => right.compactSourceKey.length - left.compactSourceKey.length || Number(Boolean(right.ruleId)) - Number(Boolean(left.ruleId)));
  }
  return entries;
}

function findExact(entries: NormalizationEntry[], rawValue: unknown): ProductMatchNormalizedValue | null {
  const sourceKey = cleanValue(rawValue);
  if (!sourceKey) return null;
  const found = entries.find((entry) => entry.sourceKey === sourceKey);
  return found ? { value: found.canonicalValue, ruleId: found.ruleId } : null;
}

function matchesText(entry: NormalizationEntry, rawValue: unknown) {
  const text = cleanValue(rawValue);
  if (!text) return false;
  if (entry.compactSourceKey.length <= 2) {
    return text.split(" ").some((token) => token === entry.sourceKey || (token.startsWith(entry.sourceKey) && /^\d+$/.test(token.slice(entry.sourceKey.length))));
  }
  return compactValue(text).includes(entry.compactSourceKey);
}

function findText(entries: NormalizationEntry[], rawValue: unknown): ProductMatchNormalizedValue | null {
  const found = entries.find((entry) => matchesText(entry, rawValue));
  return found ? { value: found.canonicalValue, ruleId: found.ruleId } : null;
}

export function compileProductMatchNormalizations(
  rules: ProductMatchNormalizationRule[],
  catalog: ProductMatchNormalizationCatalog,
) {
  const entriesByField = new Map<ProductMatchNormalizationField, Map<string, NormalizationEntry[]>>();
  for (const field of ["brand", "series", "size", "piece_count"] as const) {
    entriesByField.set(field, entriesForField(field, rules, catalog));
  }

  function scopedEntries(field: ProductMatchNormalizationField, brand: string | null | undefined) {
    const entries = entriesByField.get(field)!;
    const scoped = brand ? entries.get(scopeKey(brand)) ?? [] : [];
    return { scoped, global: entries.get("*") ?? [] };
  }

  return {
    normalizeExact(field: ProductMatchNormalizationField, rawValue: unknown, brand?: string | null): ProductMatchNormalizedValue {
      const { scoped, global } = scopedEntries(field, brand);
      return findExact(scoped, rawValue) ?? findExact(global, rawValue) ?? { value: null, ruleId: null };
    },
    findInText(field: ProductMatchNormalizationField, rawValue: unknown, brand?: string | null): ProductMatchNormalizedValue {
      const { scoped, global } = scopedEntries(field, brand);
      return findText(scoped, rawValue) ?? findText(global, rawValue) ?? { value: null, ruleId: null };
    },
  };
}

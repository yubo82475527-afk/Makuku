function clean(value: unknown) {
  return String(value ?? "").trim();
}

export function normalizeScopeIdInput(value: unknown) {
  if (value == null) return null;
  const text = clean(value);
  if (!text) return null;
  if (text.toLowerCase() === "null") return null;
  return text;
}

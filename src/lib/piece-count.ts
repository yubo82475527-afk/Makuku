export function normalizePieceCount(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.floor(parsed);
}

export function parsePieceCountText(value: string | null | undefined): number | null {
  const text = String(value ?? "");
  const bonusMatch = text.match(/\b(\d{1,3})\s*\+\s*(\d{1,3})\b/);
  if (bonusMatch) {
    return normalizePieceCount(Number(bonusMatch[1]) + Number(bonusMatch[2]));
  }

  const openBonusMatch = text.match(/\b(\d{1,3})\s*\+\b/);
  if (openBonusMatch) return normalizePieceCount(Number(openBonusMatch[1]));

  const pcsMatch = text.match(/\b(\d{1,3})\s*(?:pcs?|pieces?)\b/i);
  if (pcsMatch) return normalizePieceCount(Number(pcsMatch[1]));

  const trailingPackMatch = text.match(/\b(?:nb-s|nb|s|m|l|xl|xxl|xxxl|xxxxl)\s*(\d{1,3})(?:\s*\+\s*(\d{1,3}))?\b/i);
  if (trailingPackMatch) {
    const base = Number(trailingPackMatch[1]);
    const bonus = trailingPackMatch[2] ? Number(trailingPackMatch[2]) : 0;
    return normalizePieceCount(base + bonus);
  }

  const finalNumberMatch = text.match(/\b(\d{1,3})(?:\s*\+\s*(\d{1,3}))?\s*$/);
  if (finalNumberMatch) {
    const base = Number(finalNumberMatch[1]);
    const bonus = finalNumberMatch[2] ? Number(finalNumberMatch[2]) : 0;
    return normalizePieceCount(base + bonus);
  }

  return null;
}

export function normalizePieceCountFromCandidates(value: unknown, ...textCandidates: Array<string | null | undefined>) {
  const valueText = typeof value === "string" ? value : null;
  return normalizePieceCount(value) ?? [valueText, ...textCandidates].map(parsePieceCountText).find((item) => item !== null) ?? null;
}

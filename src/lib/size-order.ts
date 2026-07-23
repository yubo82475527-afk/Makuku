export const SIZE_DISPLAY_ORDER = [
  "NB",
  "NB-S",
  "S",
  "M",
  "L",
  "XL",
  "XXL",
  "XXXL",
] as const;

const SIZE_RANK = new Map<string, number>([
  ...SIZE_DISPLAY_ORDER.map((size, index) => [size, index] as const),
  // Same business slot as NB-S; appears as material/snapshot label in dashboard trees.
  ["NB/NB-S", 1],
]);

function sizeRank(value: string) {
  return SIZE_RANK.get(value) ?? Number.POSITIVE_INFINITY;
}

/** Diaper size display order: NB → NB-S / NB/NB-S → S → M → L → XL → XXL → XXXL. Unknown sizes sort after known ones. */
export function compareDiaperSize(a: string, b: string) {
  const rankA = sizeRank(a);
  const rankB = sizeRank(b);
  if (rankA !== rankB) return rankA - rankB;
  return a.localeCompare(b);
}

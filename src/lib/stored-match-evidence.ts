export type StoredMatchSourceItem = {
  brand: string;
  product: string;
  piece_count: number | null;
  raw_piece_count_text?: string | null;
  sourceImageId?: string | null;
  sourceRowIndex?: number | null;
  [key: string]: unknown;
};

export type PriorStoredCandidateEvidence = {
  source_image_id?: string | null;
  source_row_index?: number | null;
  raw_brand?: string | null;
  raw_product?: string | null;
  raw_piece_count_text?: string | null;
  piece_count?: number | null;
};

function rowKey(imageId: string | null | undefined, rowIndex: number | null | undefined) {
  return `${imageId ?? ""}:${rowIndex ?? ""}`;
}

function isUsefulProduct(value: string | null | undefined) {
  const text = String(value ?? "").trim();
  return Boolean(text) && !/unknown\s+sku/i.test(text);
}

function identityStem(value: string | null | undefined) {
  return String(value ?? "")
    .replace(/unknown\s+sku/gi, "")
    .replace(/\d+/g, "")
    .replace(/[^a-z]+/gi, "")
    .toLowerCase();
}

function evidenceIsCompatible(item: StoredMatchSourceItem, prior: PriorStoredCandidateEvidence) {
  const currentPieceCount = Number(item.piece_count ?? 0);
  const priorPieceCount = Number(prior.piece_count ?? 0);
  if (currentPieceCount > 0 && priorPieceCount > 0 && currentPieceCount !== priorPieceCount) return false;
  const currentStem = identityStem(item.product);
  const priorStem = identityStem(prior.raw_product);
  return currentStem.length >= 8 && priorStem.includes(currentStem);
}

export function mergeStoredCandidateEvidence<T extends StoredMatchSourceItem>(
  items: T[],
  priorCandidates: PriorStoredCandidateEvidence[],
): T[] {
  const priorByRow = new Map<string, PriorStoredCandidateEvidence>();
  for (const candidate of priorCandidates) {
    if (!isUsefulProduct(candidate.raw_product)) continue;
    const key = rowKey(candidate.source_image_id, candidate.source_row_index);
    if (!priorByRow.has(key)) priorByRow.set(key, candidate);
  }

  return items.map((item) => {
    if (isUsefulProduct(item.product)) return item;
    const prior = priorByRow.get(rowKey(item.sourceImageId, item.sourceRowIndex));
    if (!prior || !evidenceIsCompatible(item, prior)) return item;
    return {
      ...item,
      brand: String(prior.raw_brand ?? item.brand),
      product: String(prior.raw_product ?? item.product),
      piece_count: item.piece_count ?? prior.piece_count ?? null,
      raw_piece_count_text: item.raw_piece_count_text ?? prior.raw_piece_count_text ?? null,
    };
  });
}

export type ProductMatchMethod = "EXACT_CODE" | "FULL_SIGNATURE" | "UNIQUE_SIGNATURE" | "UNMATCHED";
export type ProductMatchEntityType = "material_master" | "competitor_product";
export type ProductShape = "PANTS" | "TAPE" | null;

export type SkuSignature = {
  brand: string | null;
  series: string | null;
  packageLevel: string | null;
  shape: ProductShape;
  size: string | null;
  pieceCount: number | null;
  version: string | null;
};

export type ProductMatchMaster = {
  id: string;
  entityType: ProductMatchEntityType;
  code: string | null;
  active: boolean;
  signature: SkuSignature | null;
  raw: Record<string, unknown>;
};

export type ProductMatchEvidence = {
  code: string | null;
  entityType: ProductMatchEntityType | null;
  signature: SkuSignature | null;
  sources: string[];
  raw: Record<string, unknown>;
};

export type NormalizedMatchMaster = Omit<ProductMatchMaster, "signature"> & {
  signature: SkuSignature;
};

export type NormalizedMatchInput = Omit<ProductMatchEvidence, "signature"> & {
  signature: SkuSignature;
  conflicts?: Array<{ field: string; values: string[] }>;
};

export type MatchNormalizationContext = {
  seriesOwners: Map<string, Set<string>>;
  brandEntityTypes: Map<string, Set<ProductMatchEntityType>>;
};

export type MatchRuleSet = {
  version: string;
  normalizeProduct(product: ProductMatchMaster): NormalizedMatchMaster;
  normalizeEvidence(evidence: ProductMatchEvidence, context: MatchNormalizationContext): NormalizedMatchInput;
  coreKey(signature: SkuSignature): string | null;
  isCompatible(evidence: NormalizedMatchInput, product: NormalizedMatchMaster): boolean;
  isFullSignature(evidence: NormalizedMatchInput, product: NormalizedMatchMaster): boolean;
  selectPreferredCandidate?(evidence: NormalizedMatchInput, products: NormalizedMatchMaster[]): NormalizedMatchMaster | null;
};

export type CompiledProductMatchIndex = MatchNormalizationContext & {
  products: NormalizedMatchMaster[];
  byCode: Map<string, NormalizedMatchMaster[]>;
  byBrand: Map<string, NormalizedMatchMaster[]>;
  byCoreSignature: Map<string, NormalizedMatchMaster[]>;
  invalidProductIds: Set<string>;
};

export type ProductMatchReason =
  | "EXACT_CODE_NOT_UNIQUE"
  | "INCOMPLETE_SIGNATURE"
  | "NO_ACTIVE_CANDIDATE"
  | "AMBIGUOUS_CANDIDATES"
  | "CONFLICT_SIGNATURE";

export type ProductMatchResult = {
  method: ProductMatchMethod;
  product: NormalizedMatchMaster | null;
  reason: ProductMatchReason | null;
  ruleVersion: string;
  evidence: {
    raw: Record<string, unknown>;
    signature: SkuSignature;
    conflicts?: Array<{ field: string; values: string[] }>;
    sources: string[];
    initialCandidateCount: number;
    filteredCandidateCount: number;
    chosenId: string | null;
    reason: ProductMatchReason | null;
  };
};

function normalizedCode(value: string | null | undefined) {
  return String(value ?? "").trim().toUpperCase();
}

function addToIndex<K, V>(index: Map<K, V[]>, key: K, value: V) {
  const items = index.get(key) ?? [];
  items.push(value);
  index.set(key, items);
}

export function compileProductMatchIndex(products: ProductMatchMaster[], rules: MatchRuleSet): CompiledProductMatchIndex {
  const normalized = products.map((product) => rules.normalizeProduct(product));
  const byCode = new Map<string, NormalizedMatchMaster[]>();
  const byBrand = new Map<string, NormalizedMatchMaster[]>();
  const byCoreSignature = new Map<string, NormalizedMatchMaster[]>();
  const seriesOwners = new Map<string, Set<string>>();
  const brandEntityTypes = new Map<string, Set<ProductMatchEntityType>>();
  const invalidProductIds = new Set<string>();

  for (const product of normalized) {
    if (!product.active) invalidProductIds.add(product.id);
    const code = normalizedCode(product.code);
    if (code) addToIndex(byCode, code, product);

    const brand = product.signature.brand;
    if (brand) {
      addToIndex(byBrand, brand, product);
      const entityTypes = brandEntityTypes.get(brand) ?? new Set<ProductMatchEntityType>();
      entityTypes.add(product.entityType);
      brandEntityTypes.set(brand, entityTypes);
    }

    if (brand && product.signature.series) {
      const owners = seriesOwners.get(product.signature.series) ?? new Set<string>();
      owners.add(brand);
      seriesOwners.set(product.signature.series, owners);
    }

    const coreKey = rules.coreKey(product.signature);
    if (coreKey) addToIndex(byCoreSignature, `${product.entityType}|${coreKey}`, product);
  }

  return { products: normalized, byCode, byBrand, byCoreSignature, seriesOwners, brandEntityTypes, invalidProductIds };
}

function unmatched(
  input: NormalizedMatchInput,
  rules: MatchRuleSet,
  reason: ProductMatchReason,
  initialCandidateCount: number,
  filteredCandidateCount: number,
): ProductMatchResult {
  return {
    method: "UNMATCHED",
    product: null,
    reason,
    ruleVersion: rules.version,
    evidence: {
      raw: input.raw,
      signature: input.signature,
      conflicts: input.conflicts ?? [],
      sources: input.sources,
      initialCandidateCount,
      filteredCandidateCount,
      chosenId: null,
      reason,
    },
  };
}

function matched(input: NormalizedMatchInput, rules: MatchRuleSet, product: NormalizedMatchMaster, method: Exclude<ProductMatchMethod, "UNMATCHED">, candidateCount: number): ProductMatchResult {
  return {
    method,
    product,
    reason: null,
    ruleVersion: rules.version,
    evidence: {
      raw: input.raw,
      signature: input.signature,
      conflicts: input.conflicts ?? [],
      sources: input.sources,
      initialCandidateCount: candidateCount,
      filteredCandidateCount: 1,
      chosenId: product.id,
      reason: null,
    },
  };
}

export function matchProduct(evidence: ProductMatchEvidence, index: CompiledProductMatchIndex, rules: MatchRuleSet): ProductMatchResult {
  const input = rules.normalizeEvidence(evidence, index);
  if (input.conflicts && input.conflicts.length > 0) return unmatched(input, rules, "CONFLICT_SIGNATURE", 0, 0);
  const code = normalizedCode(input.code);
  if (code) {
    const codeCandidates = (index.byCode.get(code) ?? [])
      .filter((product) => product.active && (!input.entityType || product.entityType === input.entityType));
    if (codeCandidates.length === 1) return matched(input, rules, codeCandidates[0], "EXACT_CODE", 1);
    if (codeCandidates.length > 1) return unmatched(input, rules, "EXACT_CODE_NOT_UNIQUE", codeCandidates.length, codeCandidates.length);
  }

  const coreKey = rules.coreKey(input.signature);
  if (!coreKey || !input.entityType) return unmatched(input, rules, "INCOMPLETE_SIGNATURE", 0, 0);

  const candidates = index.byCoreSignature.get(`${input.entityType}|${coreKey}`) ?? [];
  const compatible = candidates.filter((product) => product.active && rules.isCompatible(input, product));
  if (compatible.length === 0) return unmatched(input, rules, "NO_ACTIVE_CANDIDATE", candidates.length, 0);
  if (compatible.length > 1) {
    const preferred = rules.selectPreferredCandidate?.(input, compatible) ?? null;
    if (preferred) return matched(input, rules, preferred, rules.isFullSignature(input, preferred) ? "FULL_SIGNATURE" : "UNIQUE_SIGNATURE", candidates.length);
  }
  if (compatible.length > 1) return unmatched(input, rules, "AMBIGUOUS_CANDIDATES", candidates.length, compatible.length);

  const product = compatible[0];
  return matched(input, rules, product, rules.isFullSignature(input, product) ? "FULL_SIGNATURE" : "UNIQUE_SIGNATURE", candidates.length);
}

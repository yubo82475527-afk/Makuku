import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const candidateService = readFileSync("src/lib/ai-price-candidates.ts", "utf8");
const reviewService = readFileSync("src/lib/ai-price-review.ts", "utf8");
const bulkRunRoute = readFileSync("src/app/api/ai-price-candidates/bulk-review/[jobId]/run/route.ts", "utf8");

test("AI candidate matching refuses to reuse competitor products from a different brand", () => {
  assert.match(candidateService, /function competitorBrandsMatch/);
  assert.match(candidateService, /if \(!competitorBrandsMatch\(candidate\.brand, item\.brands\?\.name\)\) continue;/);
  assert.match(candidateService, /const brandScore = tokenScore\(candidate\.brand, item\.brands\?\.name \?\? ""\);/);
});

test("price review approval validates matched competitor brand before reusing it", () => {
  assert.match(reviewService, /async function findReusableMatchedCompetitorProduct/);
  assert.match(reviewService, /candidateBrandMatchesProductBrand\(candidate, product\)/);
  assert.match(reviewService, /const reusableProduct = await findReusableMatchedCompetitorProduct/);
  assert.match(reviewService, /if \(reusableProduct\) return reusableProduct as CompetitorProduct;/);
});

test("bulk manual approval revalidates competitor mapping pages after creating competitor products", () => {
  assert.match(bulkRunRoute, /revalidatePath\("\/zh\/competitors"\)/);
  assert.match(bulkRunRoute, /revalidatePath\("\/en\/competitors"\)/);
});

import assert from "node:assert/strict";
import test from "node:test";
import { findMatchingMaterialForSeries } from "../src/lib/competitor-series-mapping.ts";
import type { MaterialMaster } from "../src/lib/types.ts";

function material(code: string, subCategory: string, packCount: number): MaterialMaster {
  return {
    tenant_sku_code: code,
    tenant_sku_name: `${subCategory} DRY CARE L${packCount}`,
    category: "Baby Diaper",
    sub_category: subCategory,
    brand: "MAKUKU",
    sub_brand: "DRY CARE",
    type: subCategory,
    sub_type: "L",
    pack_count: packCount,
    box_count: 1,
    pcs_price: 1,
    f_expiry_date: "2099-01-01T00:00:00Z",
  };
}

test("series benchmark keeps Pants and Tape compatible before ranking piece count", () => {
  const result = findMatchingMaterialForSeries({
    size: "L",
    piece_count: 30,
    normalized_name: "Competitor Pants L30",
    raw_title: "Competitor Pants L30",
    pack_type: "pants",
  }, "DRY CARE", [material("TAPE-L30", "Tape", 30), material("PANTS-L28", "Pants", 28)]);

  assert.equal(result.material?.tenant_sku_code, "PANTS-L28");
});

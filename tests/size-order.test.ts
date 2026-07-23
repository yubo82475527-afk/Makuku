import assert from "node:assert/strict";
import test from "node:test";
import { compareDiaperSize, SIZE_DISPLAY_ORDER } from "../src/lib/size-order.ts";

test("orders standard diaper sizes NB through XXXL", () => {
  const shuffled = ["XL", "NB-S", "XXXL", "S", "NB", "XXL", "M", "L"];
  assert.deepEqual([...shuffled].sort(compareDiaperSize), [...SIZE_DISPLAY_ORDER]);
});

test("places NB before NB-S and NB/NB-S", () => {
  assert.ok(compareDiaperSize("NB", "NB-S") < 0);
  assert.ok(compareDiaperSize("NB-S", "NB") > 0);
  assert.ok(compareDiaperSize("NB", "NB/NB-S") < 0);
  assert.ok(compareDiaperSize("NB/NB-S", "S") < 0);
});

test("places NB/NB-S with NB-S after NB in a mixed list", () => {
  const mixed = ["XXL", "NB/NB-S", "S", "NB", "M"];
  assert.deepEqual([...mixed].sort(compareDiaperSize), [
    "NB",
    "NB/NB-S",
    "S",
    "M",
    "XXL",
  ]);
});

test("sorts unknown sizes after known ones, then by localeCompare", () => {
  const mixed = ["Unknown Size", "M", "ZZ", "NB", "AA"];
  const sorted = [...mixed].sort(compareDiaperSize);
  assert.deepEqual(sorted.slice(0, 2), ["NB", "M"]);
  assert.deepEqual(sorted.slice(2), ["Unknown Size", "ZZ", "AA"].sort((a, b) => a.localeCompare(b)));
});

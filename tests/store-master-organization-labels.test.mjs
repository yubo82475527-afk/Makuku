import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const storeMasterTable = readFileSync("src/components/store-master-table.tsx", "utf8");

test("store master organization column only shows organization name without assignment method labels", () => {
  assert.match(storeMasterTable, /store\.organizations\?\.name \?\? "-"/);
  assert.doesNotMatch(storeMasterTable, /organization_assignment_method/);
  assert.doesNotMatch(storeMasterTable, /AI\\u5efa\\u8bae|AI\)|Auto|\\u81ea\\u52a8/);
});

import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const storeVisitsListH5 = readFileSync("src/components/store-visits-list-h5.tsx", "utf8");

test("mobile visit list uses top settings menu for language and logout", () => {
  assert.match(storeVisitsListH5, /MobileCaptureSettingsMenu/);
  assert.match(storeVisitsListH5, /localStorage\.removeItem\(storageKey\)/);
  assert.match(storeVisitsListH5, /setUser\(null\)/);
  assert.match(storeVisitsListH5, /replacePathLocale/);
  assert.match(storeVisitsListH5, /Settings/);
  assert.match(storeVisitsListH5, /LogOut/);
  assert.doesNotMatch(storeVisitsListH5, /\{copy\.new\}/);
});

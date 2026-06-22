import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const offlineStoresApi = readFileSync("src/app/api/offline-stores/route.ts", "utf8");
const postStart = offlineStoresApi.indexOf("export async function POST(request: Request)");
const deleteStart = offlineStoresApi.indexOf("export async function DELETE(request: Request)");
const postBlock = postStart >= 0 && deleteStart > postStart ? offlineStoresApi.slice(postStart, deleteStart) : "";

test("store create API does not rerun synchronous organization assignment after insert", () => {
  assert.match(postBlock, /resolveOrganizationForRegion/);
  assert.match(postBlock, /organizationAssignmentPatch\(assignment\)/);
  assert.doesNotMatch(postBlock, /if \(data\?\.id\)\s*\{[\s\S]*assignOrganizationForStore/);
});

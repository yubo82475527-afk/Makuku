import { readFileSync } from "node:fs";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";

function loadEnvFile() {
  const raw = readFileSync(".env.local", "utf8");
  for (const line of raw.split(/\r?\n/)) {
    if (!line || line.trimStart().startsWith("#")) continue;
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match) continue;
    const [, key, value] = match;
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  throw new Error("Missing Supabase environment variables");
}

const supabase = createClient(url, key, { auth: { persistSession: false } });
const visitCode = "ST202606290003";
const targetImageId = "f9378fe8-95db-4c21-8644-ab3cae75a2c2";
const targetTimestamp = "2026-06-29T09:19";

const { data: visit, error: visitError } = await supabase
  .from("offline_store_visits")
  .select("id,visit_code")
  .eq("visit_code", visitCode)
  .single();
if (visitError || !visit) throw new Error(visitError?.message ?? `Visit ${visitCode} not found`);

const { data: candidates, error: candidatesError } = await supabase
  .from("ai_price_candidates")
  .select("id,source_image_id,price_snapshot_id,created_at")
  .eq("visit_id", visit.id)
  .is("source_image_id", null)
  .gte("created_at", `${targetTimestamp}:00.000Z`)
  .lt("created_at", `${targetTimestamp}:59.999Z`);
if (candidatesError) throw new Error(candidatesError.message);

const candidateIds = (candidates ?? []).map((row) => row.id);
const snapshotIds = (candidates ?? [])
  .map((row) => row.price_snapshot_id)
  .filter(Boolean);

if (candidateIds.length === 0) {
  console.log(JSON.stringify({ visitCode, candidateCount: 0, snapshotCount: 0, updated: false }, null, 2));
  process.exit(0);
}

const { error: updateCandidatesError } = await supabase
  .from("ai_price_candidates")
  .update({ source_image_id: targetImageId })
  .in("id", candidateIds);
if (updateCandidatesError) throw new Error(updateCandidatesError.message);

if (snapshotIds.length > 0) {
  const { error: updateSnapshotsError } = await supabase
    .from("price_snapshots")
    .update({ source_image_id: targetImageId })
    .in("id", snapshotIds);
  if (updateSnapshotsError) throw new Error(updateSnapshotsError.message);
}

console.log(JSON.stringify({
  visitCode,
  targetImageId,
  candidateCount: candidateIds.length,
  snapshotCount: snapshotIds.length,
  updated: true,
}, null, 2));

#!/usr/bin/env node

const commandName = "sync-store-visit-price-candidates";
const baseUrl = process.env.APP_URL || "http://localhost:3000";
const secret = process.env.INTERNAL_JOB_SECRET || process.env.CRON_SECRET || "";
const visitCode = process.argv.find((arg) => arg.startsWith("--visit-code="))?.split("=")[1];
const visitId = process.argv.find((arg) => arg.startsWith("--visit-id="))?.split("=")[1];
const limit = Number(process.argv.find((arg) => arg.startsWith("--limit="))?.split("=")[1] ?? "25");

const headers = { "Content-Type": "application/json" };
if (secret) {
  headers["x-internal-job-secret"] = secret;
}

const response = await fetch(`${baseUrl}/api/internal/store-visit/price-candidates/sync`, {
  method: "POST",
  headers,
  body: JSON.stringify({
    visit_code: visitCode,
    visit_id: visitId,
    limit,
  }),
});

const payload = await response.json().catch(() => ({}));
if (!response.ok) console.error(`${commandName} failed`);
console.log(JSON.stringify(payload, null, 2));
if (!response.ok) process.exit(1);

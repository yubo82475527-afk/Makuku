#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";

function readEnvFile(path = ".env.local") {
  if (!existsSync(path)) return {};
  return Object.fromEntries(
    readFileSync(path, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const separator = line.indexOf("=");
        return [line.slice(0, separator), line.slice(separator + 1)];
      }),
  );
}

function readArg(name) {
  const prefix = `--${name}=`;
  const entry = process.argv.slice(2).find((value) => value.startsWith(prefix));
  return entry ? entry.slice(prefix.length) : null;
}

function printResult(result) {
  const output = JSON.stringify(result, null, 2);
  console.log(output.length <= 10_000 ? output : `${output.slice(0, 10_000)}\n...truncated`);
}

const fileEnv = readEnvFile();
const secret = process.env.CRON_SECRET
  ?? process.env.INTERNAL_JOB_SECRET
  ?? fileEnv.CRON_SECRET
  ?? fileEnv.INTERNAL_JOB_SECRET;
if (!secret) throw new Error("CRON_SECRET or INTERNAL_JOB_SECRET is required.");

const baseUrl = (readArg("base-url") ?? "http://localhost:3000").replace(/\/+$/, "");
const benchmarkDate = readArg("benchmark-date");
const response = await fetch(`${baseUrl}/api/internal/price-quality/refresh-benchmarks`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${secret}`,
  },
  body: JSON.stringify({ benchmark_date: benchmarkDate }),
});
const payload = await response.json().catch(() => ({}));
printResult({ status: response.status, result: payload });
if (!response.ok) process.exitCode = 1;

import { createHash } from "crypto";
import { mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { pathToFileURL } from "url";
import { createRequire } from "module";
import ts from "typescript";
import { createContext, runInContext } from "vm";

function loadTs(relativePath, mocks = {}) {
  const require = createRequire(import.meta.url);
  const fullPath = path.resolve(relativePath);
  const source = readFileSync(fullPath, "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
  const module = { exports: {} };
  const context = createContext({
    module,
    exports: module.exports,
    require(id) {
      if (mocks[id]) return mocks[id];
      if (id.startsWith("@/")) {
        const mapped = id.replace("@/", `${path.resolve("src")}/`).replace(/\.ts$/, "") + ".ts";
        return loadTs(path.relative(process.cwd(), mapped), mocks);
      }
      return require(id);
    },
    console,
    Buffer,
    process,
    __dirname: path.dirname(fullPath),
    __filename: fullPath,
  });
  runInContext(transpiled, context);
  return module.exports;
}

const { buildUsageAssistantFacts, hashUsageAssistantFacts, assertUsageAssistantPackSize } = loadTs(
  "src/lib/usage-assistant-facts.ts",
  {
    "@/lib/nav-config": loadTs("src/lib/nav-config.ts", {
      "@/lib/page-permissions": loadTs("src/lib/page-permissions.ts"),
    }),
    "@/lib/page-permissions": loadTs("src/lib/page-permissions.ts"),
    "@/lib/operator-price-review-reasons": loadTs("src/lib/operator-price-review-reasons.ts", {
      "@/lib/types": {},
    }),
  },
);

const howtoZh = readFileSync("docs/business/usage-assistant-knowledge.zh.md", "utf8");
const howtoEn = readFileSync("docs/business/usage-assistant-knowledge.en.md", "utf8");
const facts = buildUsageAssistantFacts();
const factsSourceHash = hashUsageAssistantFacts(facts);
const contentHash = createHash("sha256")
  .update(JSON.stringify({ facts, howtoZh, howtoEn }))
  .digest("hex")
  .slice(0, 16);
const pack = {
  version: `seed-${contentHash}`,
  generatedAt: new Date().toISOString(),
  contentHash,
  factsSourceHash,
  facts,
  howtoZh,
  howtoEn,
  source: "seed",
};
assertUsageAssistantPackSize(JSON.stringify(pack));
const outDir = path.join(process.cwd(), "src", "lib", "generated");
mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, "usage-assistant-knowledge.json");
writeFileSync(outPath, `${JSON.stringify(pack, null, 2)}\n`, "utf8");
console.log(`Wrote ${outPath}`);

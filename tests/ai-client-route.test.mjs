import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

function loadAiClient() {
  const source = readFileSync("src/lib/ai-client.ts", "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
  const testModule = { exports: {} };
  vm.runInNewContext(transpiled, {
    module: testModule,
    exports: testModule.exports,
    process: { env: {} },
    require(id) {
      if (id === "@/lib/types") return {};
      throw new Error(`Unexpected require: ${id}`);
    },
  });
  return testModule.exports;
}

test("AI_API_FAMILY can route an unknown model through the Responses API", () => {
  const aiClient = loadAiClient();
  const route = aiClient.resolveAiRoute("gpt-5.6-luna", "https://api.beibeiai.top/v1", "responses");

  assert.equal(route.apiFamily, "responses");
  assert.equal(route.supportsJsonMode, false);
  assert.equal(route.resolvedBaseUrl, "https://api.beibeiai.top/v1");
});

test("models without an API-family override preserve the existing route fallback", () => {
  const aiClient = loadAiClient();
  const route = aiClient.resolveAiRoute("gpt-5.6-luna", "https://api.beibeiai.top/v1", null);

  assert.equal(route.apiFamily, "chat_completions");
  assert.equal(route.supportsJsonMode, true);
});

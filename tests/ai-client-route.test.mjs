import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

function loadAiClient() {
  return loadAiClientWithContext({});
}

function loadAiClientWithContext(overrides) {
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
    process: { env: overrides.env ?? {} },
    fetch: overrides.fetch,
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

test("empty Responses payload falls back to the chat-completions route", async () => {
  const calls = [];
  const aiClient = loadAiClientWithContext({
    env: {
      AI_API_KEY: "test-key",
      AI_BASE_URL: "https://api.beibeiai.top/v1",
      AI_MODEL: "gpt-5.6-luna",
      AI_API_FAMILY: "responses",
    },
    async fetch(url, init) {
      calls.push({ url: String(url), body: JSON.parse(String(init?.body ?? "{}")) });
      if (String(url).endsWith("/responses")) {
        return {
          ok: true,
          status: 200,
          headers: { get: () => "resp-request-id" },
          async text() {
            return JSON.stringify({
              id: "resp_empty",
              output: [{ type: "reasoning", content: [] }],
              usage: { total_tokens: 100 },
            });
          },
        };
      }
      return {
        ok: true,
        status: 200,
        headers: { get: () => "chat-request-id" },
        async text() {
          return JSON.stringify({
            id: "chat_ok",
            choices: [{ message: { content: "{\"ok\":true}" }, finish_reason: "stop" }],
            usage: { total_tokens: 10 },
          });
        },
      };
    },
  });

  const completion = await aiClient.createJsonChatCompletion({
    messages: [{ role: "user", content: "Return JSON" }],
    maxTokens: 6000,
  });

  assert.equal(JSON.stringify(completion.parsed), "{\"ok\":true}");
  assert.equal(completion.metadata.fallback_used, true);
  assert.equal(calls[0].url, "https://api.beibeiai.top/v1/responses");
  assert.equal(calls[0].body.max_output_tokens, 6000);
  assert.equal(calls[1].url, "https://api.beibeiai.top/v1/chat/completions");
});

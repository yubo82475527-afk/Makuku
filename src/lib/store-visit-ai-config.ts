import { createHmac, timingSafeEqual } from "crypto";
import { DEFAULT_STORE_VISIT_AI_CONFIG } from "@/lib/store-visit-ai";
import { createSupabaseServiceClient, hasSupabaseServiceConfig } from "@/lib/supabase";
import type { StoreVisitAiConfig } from "@/lib/types";

export type StoreVisitAiConfigInput = {
  version_name?: string;
  system_prompt: string;
  temperature: number;
  max_tokens: number;
};

type TestTokenPayload = {
  visit_id: string;
  config_hash: string;
  exp: number;
};

const tokenTtlMs = 30 * 60 * 1000;

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function signingSecret() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.AI_API_KEY || process.env.OPENAI_API_KEY || "store-visit-ai-debug-dev";
}

function base64UrlEncode(value: string) {
  return Buffer.from(value).toString("base64url");
}

function base64UrlDecode(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function hmac(value: string) {
  return createHmac("sha256", signingSecret()).update(value).digest("base64url");
}

export function normalizeStoreVisitAiConfigInput(value: unknown): StoreVisitAiConfigInput {
  const input = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const systemPrompt = asString(input.system_prompt);
  const versionName = asString(input.version_name);
  const temperature = Number(input.temperature);
  const maxTokens = Number(input.max_tokens);

  if (!systemPrompt || systemPrompt.length < 200) {
    throw new Error("System prompt must be at least 200 characters.");
  }
  if (!Number.isFinite(temperature) || temperature < 0 || temperature > 2) {
    throw new Error("Temperature must be between 0 and 2.");
  }
  if (!Number.isFinite(maxTokens) || maxTokens < 500 || maxTokens > 6000) {
    throw new Error("Max tokens must be between 500 and 6000.");
  }

  return {
    version_name: versionName || `Store visit AI ${new Date().toISOString().slice(0, 16).replace("T", " ")}`,
    system_prompt: systemPrompt,
    temperature: Number(temperature.toFixed(2)),
    max_tokens: Math.floor(maxTokens),
  };
}

export function storeVisitAiConfigHash(input: StoreVisitAiConfigInput) {
  return hmac(JSON.stringify({
    system_prompt: input.system_prompt,
    temperature: input.temperature,
    max_tokens: input.max_tokens,
  }));
}

export function createStoreVisitAiTestToken(visitId: string, input: StoreVisitAiConfigInput) {
  const payload: TestTokenPayload = {
    visit_id: visitId,
    config_hash: storeVisitAiConfigHash(input),
    exp: Date.now() + tokenTtlMs,
  };
  const encoded = base64UrlEncode(JSON.stringify(payload));
  return `${encoded}.${hmac(encoded)}`;
}

export function verifyStoreVisitAiTestToken(token: string, input: StoreVisitAiConfigInput) {
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) throw new Error("Run a successful test before saving.");

  const expected = hmac(encoded);
  const signatureBytes = Buffer.from(signature);
  const expectedBytes = Buffer.from(expected);
  if (signatureBytes.length !== expectedBytes.length || !timingSafeEqual(signatureBytes, expectedBytes)) {
    throw new Error("Test token is invalid. Run the test again before saving.");
  }

  const payload = JSON.parse(base64UrlDecode(encoded)) as TestTokenPayload;
  if (!payload.visit_id || payload.exp < Date.now()) {
    throw new Error("Test token expired. Run the test again before saving.");
  }
  if (payload.config_hash !== storeVisitAiConfigHash(input)) {
    throw new Error("Configuration changed after the last successful test. Run the test again before saving.");
  }
  return payload;
}

export async function listStoreVisitAiConfigs(): Promise<{
  active: StoreVisitAiConfig;
  history: StoreVisitAiConfig[];
  error: string | null;
  isDemo: boolean;
}> {
  if (!hasSupabaseServiceConfig()) {
    return { active: DEFAULT_STORE_VISIT_AI_CONFIG, history: [], error: null, isDemo: true };
  }

  try {
    const supabase = createSupabaseServiceClient();
    const { data, error } = await supabase
      .from("store_visit_ai_configs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      return { active: DEFAULT_STORE_VISIT_AI_CONFIG, history: [], error: error.message, isDemo: false };
    }

    const history = (data ?? []) as StoreVisitAiConfig[];
    return {
      active: history.find((item) => item.status === "active") ?? DEFAULT_STORE_VISIT_AI_CONFIG,
      history,
      error: null,
      isDemo: false,
    };
  } catch (error) {
    return {
      active: DEFAULT_STORE_VISIT_AI_CONFIG,
      history: [],
      error: error instanceof Error ? error.message : "Unknown error",
      isDemo: false,
    };
  }
}

type ChatContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

type ChatMessage = {
  role: "system" | "user";
  content: string | ChatContentPart[];
};

type ChatCompletionChoice = {
  finish_reason?: string | null;
  message?: {
    content?: string | ChatContentPart[] | null;
    refusal?: string | null;
  };
};

type ChatCompletionPayload = {
  choices?: ChatCompletionChoice[];
  usage?: unknown;
  id?: string;
};

function stripMarkdownFence(value: string) {
  const trimmed = value.trim();
  const match = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (match?.[1]) return match[1].trim();
  return trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function extractJsonObject(value: string) {
  const start = value.indexOf("{");
  const end = value.lastIndexOf("}");
  return start >= 0 && end > start ? value.slice(start, end + 1) : value;
}

function repairCommonJsonIssues(value: string) {
  return value
    .replace(/,\s*([}\]])/g, "$1")
    .replace(/(["}\]\d])\s*\n\s*("[A-Za-z0-9_ -]+"\s*:)/g, "$1,\n$2")
    .replace(/(["}\]\d])\s+("[A-Za-z0-9_ -]+"\s*:)/g, "$1,$2")
    .replace(/[“”]/g, "\"")
    .replace(/[‘’]/g, "'");
}

export function parseAiJson(text: string): { parsed: unknown; parseRepaired: boolean } {
  const stripped = extractJsonObject(stripMarkdownFence(text));
  try {
    return { parsed: JSON.parse(stripped), parseRepaired: false };
  } catch (firstError) {
    const repaired = repairCommonJsonIssues(stripped);
    try {
      return { parsed: JSON.parse(repaired), parseRepaired: true };
    } catch (secondError) {
      const message = secondError instanceof Error
        ? secondError.message
        : firstError instanceof Error
          ? firstError.message
          : "AI returned invalid JSON";
      const preview = stripped.slice(0, 800).replace(/\s+/g, " ");
      throw new Error(`AI returned invalid JSON: ${message}. Raw preview: ${preview}`);
    }
  }
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

export function getAiConfig() {
  const apiKey = process.env.AI_API_KEY || process.env.OPENAI_API_KEY || "";
  const baseUrl = trimTrailingSlash(process.env.AI_BASE_URL || "https://api.openai.com/v1");
  const model = process.env.AI_MODEL || "gpt-4o";
  const maxTokens = Number(process.env.AI_MAX_TOKENS ?? "");
  return {
    apiKey,
    baseUrl,
    model,
    maxTokens: Number.isFinite(maxTokens) && maxTokens > 0 ? Math.floor(maxTokens) : undefined,
  };
}

export function hasAiConfig() {
  return Boolean(getAiConfig().apiKey);
}

export async function createJsonChatCompletion(input: {
  messages: ChatMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
}): Promise<{
  parsed: unknown;
  rawText: string;
  providerPayload: ChatCompletionPayload;
  metadata: {
    model: string;
    base_url: string;
    parse_repaired: boolean;
    response_format: "json_object" | "none";
    usage?: unknown;
    response_id?: string;
  };
}> {
  const config = getAiConfig();
  if (!config.apiKey) {
    throw new Error("AI_API_KEY is not configured");
  }

  const requestBody = {
      model: input.model || config.model,
      messages: input.messages,
      temperature: input.temperature ?? 0.2,
      max_tokens: input.maxTokens ?? config.maxTokens ?? 1200,
  };

  async function requestCompletion(useJsonResponseFormat: boolean) {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...requestBody,
        ...(useJsonResponseFormat ? { response_format: { type: "json_object" } } : {}),
      }),
    });

    if (!response.ok) {
      const message = await response.text().catch(() => response.statusText);
      throw new Error(`AI analysis failed: ${message}`);
    }

    return await response.json() as ChatCompletionPayload;
  }

  function extractContent(payload: ChatCompletionPayload) {
    const content = payload.choices?.[0]?.message?.content;
    if (typeof content === "string") return content.trim();
    if (Array.isArray(content)) {
      return content
        .map((part) => part.type === "text" ? part.text : "")
        .join("")
        .trim();
    }
    return "";
  }

  let payload = await requestCompletion(true);
  let responseFormat: "json_object" | "none" = "json_object";
  let text = extractContent(payload);

  if (!text) {
    payload = await requestCompletion(false);
    responseFormat = "none";
    text = extractContent(payload);
  }

  if (!text) {
    const choice = payload.choices?.[0];
    const reason = choice?.finish_reason ?? "unknown";
    const refusal = choice?.message?.refusal;
    const preview = JSON.stringify({
      id: payload.id,
      finish_reason: reason,
      refusal,
      usage: payload.usage,
    });
    throw new Error(`AI returned an empty response after retry. Finish reason: ${reason}. Payload preview: ${preview}`);
  }

  const { parsed, parseRepaired } = parseAiJson(text);
  return {
    parsed,
    rawText: text,
    providerPayload: payload,
    metadata: {
      model: input.model || config.model,
      base_url: config.baseUrl,
      parse_repaired: parseRepaired,
      response_format: responseFormat,
      usage: payload.usage,
      response_id: payload.id,
    },
  };
}

export function textPart(text: string): ChatContentPart {
  return { type: "text", text };
}

export function imageUrlPart(url: string): ChatContentPart {
  return { type: "image_url", image_url: { url } };
}

import type { AiApiFamily, AiRequestDiagnostic } from "@/lib/types";

type ChatContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

type ChatMessage = {
  role: "system" | "user";
  content: string | ChatContentPart[];
};

type ChatCompletionChoice = {
  finish_reason?: string | null;
  delta?: {
    content?: string | ChatContentPart[] | null;
  };
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

type ResponsesOutputContent = {
  type?: string;
  text?: string;
};

type ResponsesOutputItem = {
  type?: string;
  content?: ResponsesOutputContent[];
};

type ResponsesPayload = {
  id?: string;
  output_text?: string;
  output?: ResponsesOutputItem[];
  usage?: unknown;
  error?: {
    message?: string;
    type?: string;
    code?: string;
  } | null;
};

type AiRouteDefinition = {
  model: string;
  apiFamily: AiApiFamily;
  supportsJsonMode: boolean;
  fallbackModel?: string;
  baseUrlOverride?: string;
};

type AiRouteResolved = AiRouteDefinition & {
  resolvedBaseUrl: string;
};

type ExecuteAttemptSuccess = {
  payload: ChatCompletionPayload | ResponsesPayload;
  rawText: string;
  parsedText: string;
  providerRequestId?: string;
  usage?: unknown;
  responseFormat: "json_object" | "none";
  route: AiRouteResolved;
  fallbackUsed: boolean;
  fallbackReason?: string;
  attemptCount: number;
};

type ExecuteAttemptFailure = Error & {
  httpStatus?: number;
  providerRequestId?: string;
  providerErrorType?: string;
  providerErrorCode?: string;
  requestUrl?: string;
};

const aiRouteDefinitions: AiRouteDefinition[] = [
  {
    model: "gpt-5.4",
    apiFamily: "responses",
    supportsJsonMode: false,
    fallbackModel: "gpt-4o",
  },
  {
    model: "gpt-4o",
    apiFamily: "chat_completions",
    supportsJsonMode: true,
  },
];

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

function previewText(value: string) {
  return value.slice(0, 800).replace(/\s+/g, " ");
}

function parseProviderErrorDetails(message: string) {
  const statusMatch = message.match(/status[_ ]code[=: ]+(\d{3})/i) ?? message.match(/HTTP\s+(\d{3})/i);
  const requestIdMatch = message.match(/Request ID[:= ]+([A-Za-z0-9_-]+)/i);
  const typeMatch = message.match(/"type"\s*:\s*"([^"]+)"/i);
  const codeMatch = message.match(/"code"\s*:\s*"([^"]+)"/i);
  return {
    httpStatus: statusMatch ? Number(statusMatch[1]) : undefined,
    providerRequestId: requestIdMatch?.[1],
    providerErrorType: typeMatch?.[1],
    providerErrorCode: codeMatch?.[1],
  };
}

function withFailureMetadata(error: unknown, metadata: Partial<ExecuteAttemptFailure>) {
  const baseError = error instanceof Error ? error : new Error(String(error));
  const extended = baseError as ExecuteAttemptFailure;
  Object.assign(extended, metadata);
  return extended;
}

function resolveAiRoute(model: string, baseUrl: string): AiRouteResolved {
  const matched = aiRouteDefinitions.find((route) => route.model === model);
  if (!matched) {
    return {
      model,
      apiFamily: "chat_completions",
      supportsJsonMode: true,
      fallbackModel: "gpt-4o",
      resolvedBaseUrl: baseUrl,
    };
  }
  return {
    ...matched,
    resolvedBaseUrl: trimTrailingSlash(matched.baseUrlOverride || baseUrl),
  };
}

function isRecoverableAiRouteError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();
  const { httpStatus, providerErrorCode, providerErrorType } = parseProviderErrorDetails(message);
  return (
    httpStatus === 405 ||
    httpStatus === 429 ||
    (typeof httpStatus === "number" && httpStatus >= 500) ||
    providerErrorCode === "bad_response_status_code" ||
    providerErrorType === "bad_response_status_code" ||
    isJsonResponseFormatCompatibilityError(message) ||
    normalized.includes("method not allowed")
  );
}

function isJsonResponseFormatCompatibilityError(message: string) {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("response_format") ||
    normalized.includes("json_object") ||
    normalized.includes("unknown parameter") ||
    normalized.includes("unsupported parameter")
  );
}

function parseChatCompletionPayload(text: string): ChatCompletionPayload {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error("AI provider returned an empty response");
  }

  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return JSON.parse(trimmed) as ChatCompletionPayload;
  }

  if (!trimmed.includes("data:")) {
    throw new Error(`AI provider returned unsupported response format. Preview: ${previewText(trimmed)}`);
  }

  const chunks: ChatCompletionPayload[] = [];
  for (const line of trimmed.split(/\r?\n/)) {
    const normalized = line.trim();
    if (!normalized.startsWith("data:")) continue;
    const data = normalized.slice("data:".length).trim();
    if (!data || data === "[DONE]") continue;
    chunks.push(JSON.parse(data) as ChatCompletionPayload);
  }

  if (chunks.length === 0) {
    throw new Error(`AI provider returned an empty event stream. Preview: ${previewText(trimmed)}`);
  }

  const content = chunks
    .map((chunk) => {
      const value = chunk.choices?.[0]?.delta?.content ?? chunk.choices?.[0]?.message?.content;
      if (typeof value === "string") return value;
      if (Array.isArray(value)) {
        return value.map((part) => part.type === "text" ? part.text : "").join("");
      }
      return "";
    })
    .join("")
    .trim();
  const lastChunk = chunks[chunks.length - 1];

  return {
    ...lastChunk,
    choices: [{
      finish_reason: lastChunk.choices?.[0]?.finish_reason ?? null,
      message: {
        content,
        refusal: lastChunk.choices?.[0]?.message?.refusal,
      },
    }],
    usage: lastChunk.usage ?? chunks.find((chunk) => chunk.usage)?.usage,
    id: lastChunk.id ?? chunks.find((chunk) => chunk.id)?.id,
  };
}

function parseResponsesPayload(text: string): ResponsesPayload {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error("AI provider returned an empty response");
  }
  return JSON.parse(trimmed) as ResponsesPayload;
}

function extractResponsesText(payload: ResponsesPayload) {
  if (typeof payload.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }
  const outputText = (payload.output ?? [])
    .flatMap((item) => item.content ?? [])
    .filter((item) => item.type === "output_text" || item.type === "text")
    .map((item) => item.text ?? "")
    .join("")
    .trim();
  return outputText;
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
  metadata: AiRequestDiagnostic & {
    response_id?: string;
  };
}> {
  const config = getAiConfig();
  if (!config.apiKey) {
    throw new Error("AI_API_KEY is not configured");
  }

  const requestedModel = input.model || config.model;
  const requestBody = {
    model: requestedModel,
    messages: input.messages,
    temperature: input.temperature ?? 0.2,
    max_tokens: input.maxTokens ?? config.maxTokens ?? 1200,
    stream: false,
  };

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

  async function requestChatCompletion(route: AiRouteResolved, useJsonResponseFormat: boolean) {
    const requestUrl = `${route.resolvedBaseUrl}/chat/completions`;
    const response = await fetch(requestUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...requestBody,
        model: route.model,
        ...(useJsonResponseFormat && route.supportsJsonMode ? { response_format: { type: "json_object" } } : {}),
      }),
    });

    const responseText = await response.text().catch(() => response.statusText);
    if (!response.ok) {
      const details = parseProviderErrorDetails(responseText);
      throw withFailureMetadata(
        new Error(`AI analysis failed: ${responseText}`),
        {
          httpStatus: response.status,
          requestUrl,
          providerRequestId: response.headers.get("x-request-id") ?? details.providerRequestId,
          providerErrorType: details.providerErrorType,
          providerErrorCode: details.providerErrorCode,
        },
      );
    }

    try {
      return {
        payload: parseChatCompletionPayload(responseText),
        requestUrl,
        providerRequestId: response.headers.get("x-request-id") ?? undefined,
      };
    } catch (error) {
      throw withFailureMetadata(error, { requestUrl });
    }
  }

  async function requestResponses(route: AiRouteResolved) {
    const requestUrl = `${route.resolvedBaseUrl}/responses`;
    const response = await fetch(requestUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: route.model,
        input: input.messages.map((message) => ({
          role: message.role,
          content: typeof message.content === "string"
            ? [{ type: "input_text", text: message.content }]
            : message.content.map((part) => (
              part.type === "text"
                ? { type: "input_text", text: part.text }
                : { type: "input_image", image_url: part.image_url.url }
            )),
        })),
        temperature: input.temperature ?? 0.2,
        max_output_tokens: input.maxTokens ?? config.maxTokens ?? 1200,
      }),
    });

    const responseText = await response.text().catch(() => response.statusText);
    if (!response.ok) {
      const details = parseProviderErrorDetails(responseText);
      throw withFailureMetadata(
        new Error(`AI analysis failed: ${responseText}`),
        {
          httpStatus: response.status,
          requestUrl,
          providerRequestId: response.headers.get("x-request-id") ?? details.providerRequestId,
          providerErrorType: details.providerErrorType,
          providerErrorCode: details.providerErrorCode,
        },
      );
    }

    try {
      return {
        payload: parseResponsesPayload(responseText),
        requestUrl,
        providerRequestId: response.headers.get("x-request-id") ?? undefined,
      };
    } catch (error) {
      throw withFailureMetadata(error, { requestUrl });
    }
  }

  async function executeRoute(
    route: AiRouteResolved,
    options?: { fallbackUsed?: boolean; fallbackReason?: string; attemptBase?: number },
  ): Promise<ExecuteAttemptSuccess> {
    const fallbackUsed = options?.fallbackUsed ?? false;
    const fallbackReason = options?.fallbackReason;
    const attemptBase = options?.attemptBase ?? 0;

    if (route.apiFamily === "chat_completions") {
      let responseFormat: "json_object" | "none" = route.supportsJsonMode ? "json_object" : "none";
      let attemptCount = attemptBase + 1;
      let result;
      try {
        result = await requestChatCompletion(route, responseFormat === "json_object");
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        if (!route.supportsJsonMode || !isJsonResponseFormatCompatibilityError(message)) throw error;
        responseFormat = "none";
        attemptCount += 1;
        result = await requestChatCompletion(route, false);
      }

      let parsedText = extractContent(result.payload);
      if (!parsedText) {
        responseFormat = "none";
        attemptCount += 1;
        const retryResult = await requestChatCompletion(route, false);
        result = retryResult;
        parsedText = extractContent(retryResult.payload);
      }

      if (!parsedText) {
        const choice = result.payload.choices?.[0];
        const reason = choice?.finish_reason ?? "unknown";
        const refusal = choice?.message?.refusal;
        const preview = JSON.stringify({
          id: result.payload.id,
          finish_reason: reason,
          refusal,
          usage: result.payload.usage,
        });
        throw new Error(`AI returned an empty response after retry. Finish reason: ${reason}. Payload preview: ${preview}`);
      }

      return {
        payload: result.payload,
        rawText: parsedText,
        parsedText,
        providerRequestId: result.providerRequestId ?? result.payload.id,
        usage: result.payload.usage,
        responseFormat,
        route,
        fallbackUsed,
        fallbackReason,
        attemptCount,
      };
    }

    const result = await requestResponses(route);
    const parsedText = extractResponsesText(result.payload);
    if (!parsedText) {
      throw new Error(`AI provider returned an empty responses payload. Preview: ${previewText(JSON.stringify(result.payload))}`);
    }

    return {
      payload: {
        id: result.payload.id,
        usage: result.payload.usage,
        choices: [{
          message: { content: parsedText },
          finish_reason: null,
        }],
      },
      rawText: parsedText,
      parsedText,
      providerRequestId: result.providerRequestId ?? result.payload.id,
      usage: result.payload.usage,
      responseFormat: "none",
      route,
      fallbackUsed,
      fallbackReason,
      attemptCount: attemptBase + 1,
    };
  }

  const primaryRoute = resolveAiRoute(requestedModel, config.baseUrl);
  let execution: ExecuteAttemptSuccess;
  try {
    execution = await executeRoute(primaryRoute);
  } catch (primaryError) {
    if (!primaryRoute.fallbackModel || !isRecoverableAiRouteError(primaryError)) {
      throw primaryError;
    }
    const fallbackRoute = resolveAiRoute(primaryRoute.fallbackModel, config.baseUrl);
    execution = await executeRoute(fallbackRoute, {
      fallbackUsed: true,
      fallbackReason: `${primaryRoute.model}:${primaryRoute.apiFamily}`,
      attemptBase: 1,
    });
  }

  const { parsed, parseRepaired } = parseAiJson(execution.parsedText);
  return {
    parsed,
    rawText: execution.rawText,
    providerPayload: execution.payload as ChatCompletionPayload,
    metadata: {
      model: execution.route.model,
      base_url: execution.route.resolvedBaseUrl,
      api_family: execution.route.apiFamily,
      request_url: `${execution.route.resolvedBaseUrl}/${execution.route.apiFamily === "chat_completions" ? "chat/completions" : "responses"}`,
      parse_repaired: parseRepaired,
      response_format: execution.responseFormat,
      usage: execution.usage,
      response_id: execution.payload.id,
      provider_request_id: execution.providerRequestId,
      fallback_used: execution.fallbackUsed,
      fallback_reason: execution.fallbackReason,
      attempt_count: execution.attemptCount,
    },
  };
}

export function textPart(text: string): ChatContentPart {
  return { type: "text", text };
}

export function imageUrlPart(url: string): ChatContentPart {
  return { type: "image_url", image_url: { url } };
}

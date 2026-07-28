import { createHash } from "crypto";
import { readFileSync } from "fs";
import path from "path";
import { createJsonChatCompletion, hasAiConfig } from "@/lib/ai-client";
import type { AppSession } from "@/lib/auth-session";
import { createSupabaseServiceClient, hasSupabaseServiceConfig } from "@/lib/supabase";
import {
  assertUsageAssistantPackSize,
  buildUsageAssistantFacts,
  hashUsageAssistantFacts,
  type UsageAssistantFacts,
} from "@/lib/usage-assistant-facts";

export type UsageAssistantGrounding = "grounded" | "fallback" | "refuse";
export type UsageAssistantReplyLanguage = "zh" | "en" | "id";

export type UsageAssistantKnowledgePack = {
  version: string;
  generatedAt: string;
  contentHash: string;
  factsSourceHash: string;
  facts: UsageAssistantFacts;
  howtoZh: string;
  howtoEn: string;
  source: "published" | "seed";
  id?: string;
};

export const USAGE_ASSISTANT_FALLBACK = {
  zh: "抱歉，暂无对应知识，请联系 IT 进行补充",
  en: "Sorry, no matching knowledge is available yet. Please contact IT to have it added.",
  id: "Maaf, belum ada pengetahuan yang sesuai. Silakan hubungi IT untuk menambahkan.",
} as const;

const HISTORY_LIMIT = 8;

type ChatTurn = { role: "user" | "assistant"; content: string };

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function readHowtoFile(locale: "zh" | "en") {
  const filePath = path.join(process.cwd(), "docs", "business", `usage-assistant-knowledge.${locale}.md`);
  try {
    return readFileSync(filePath, "utf8");
  } catch {
    return locale === "zh"
      ? "# 使用指引\n\n请在后台同步并发布知识库。"
      : "# Usage guide\n\nPlease sync and publish the knowledge base in admin.";
  }
}

export function detectUsageAssistantReplyLanguage(text: string): UsageAssistantReplyLanguage {
  const value = clean(text);
  if (/[\u4e00-\u9fff]/.test(value)) return "zh";
  // Indonesian common markers / words (when not Chinese)
  if (/\b(yang|dengan|untuk|tidak|bagaimana|apakah|silakan|tolong|harga|toko)\b/i.test(value)) {
    return "id";
  }
  return "en";
}

export function fixedFallbackAnswer(language: UsageAssistantReplyLanguage) {
  return USAGE_ASSISTANT_FALLBACK[language];
}

export function buildSeedKnowledgePack(): UsageAssistantKnowledgePack {
  try {
    const generatedPath = path.join(process.cwd(), "src", "lib", "generated", "usage-assistant-knowledge.json");
    const raw = readFileSync(generatedPath, "utf8");
    const parsed = JSON.parse(raw) as UsageAssistantKnowledgePack;
    if (parsed?.facts && parsed?.howtoZh && parsed?.howtoEn) {
      assertUsageAssistantPackSize(JSON.stringify(parsed));
      return { ...parsed, source: "seed" };
    }
  } catch {
    // Fall through to live build from code + markdown docs.
  }

  const facts = buildUsageAssistantFacts();
  const factsSourceHash = hashUsageAssistantFacts(facts);
  const howtoZh = readHowtoFile("zh");
  const howtoEn = readHowtoFile("en");
  const generatedAt = new Date().toISOString();
  const contentHash = createHash("sha256")
    .update(JSON.stringify({ facts, howtoZh, howtoEn }))
    .digest("hex")
    .slice(0, 16);
  const pack: UsageAssistantKnowledgePack = {
    version: `seed-${contentHash}`,
    generatedAt,
    contentHash,
    factsSourceHash,
    facts,
    howtoZh,
    howtoEn,
    source: "seed",
  };
  assertUsageAssistantPackSize(JSON.stringify(pack));
  return pack;
}

function rowToPack(row: {
  id: string;
  version: string;
  content_hash: string;
  facts: UsageAssistantFacts;
  howto_zh: string;
  howto_en: string;
  facts_source_hash: string;
  created_at: string;
}): UsageAssistantKnowledgePack {
  return {
    id: row.id,
    version: row.version,
    generatedAt: row.created_at,
    contentHash: row.content_hash,
    factsSourceHash: row.facts_source_hash,
    facts: row.facts,
    howtoZh: row.howto_zh,
    howtoEn: row.howto_en,
    source: "published",
  };
}

export async function loadPublishedKnowledgePack(): Promise<UsageAssistantKnowledgePack> {
  if (!hasSupabaseServiceConfig()) return buildSeedKnowledgePack();
  try {
    const supabase = createSupabaseServiceClient();
    const { data, error } = await supabase
      .from("usage_assistant_knowledge_versions")
      .select("id,version,content_hash,facts,howto_zh,howto_en,facts_source_hash,created_at,status")
      .eq("status", "published")
      .maybeSingle();
    if (error || !data) return buildSeedKnowledgePack();
    return rowToPack(data as {
      id: string;
      version: string;
      content_hash: string;
      facts: UsageAssistantFacts;
      howto_zh: string;
      howto_en: string;
      facts_source_hash: string;
      created_at: string;
    });
  } catch {
    return buildSeedKnowledgePack();
  }
}

export async function listKnowledgeVersions(limit = 20) {
  if (!hasSupabaseServiceConfig()) {
    const seed = buildSeedKnowledgePack();
    return { versions: [{ ...seed, status: "seed" as const }], usingSeed: true as const };
  }
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("usage_assistant_knowledge_versions")
    .select("id,version,content_hash,facts_source_hash,status,note,created_by_name,created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  const published = (data ?? []).find((row) => row.status === "published");
  return {
    versions: data ?? [],
    usingSeed: !published,
    currentFactsSourceHash: hashUsageAssistantFacts(buildUsageAssistantFacts()),
  };
}

export async function getKnowledgeVersionDetail(id?: string | null) {
  const currentFacts = buildUsageAssistantFacts();
  const currentFactsSourceHash = hashUsageAssistantFacts(currentFacts);
  if (!hasSupabaseServiceConfig()) {
    const seed = buildSeedKnowledgePack();
    return {
      pack: seed,
      currentFactsSourceHash,
      factsOutOfDate: seed.factsSourceHash !== currentFactsSourceHash,
      usingSeed: true,
    };
  }

  const supabase = createSupabaseServiceClient();
  let query = supabase
    .from("usage_assistant_knowledge_versions")
    .select("id,version,content_hash,facts,howto_zh,howto_en,facts_source_hash,status,note,created_by_name,created_at");
  if (id) query = query.eq("id", id);
  else query = query.eq("status", "published");
  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) {
    const seed = buildSeedKnowledgePack();
    return {
      pack: seed,
      currentFactsSourceHash,
      factsOutOfDate: seed.factsSourceHash !== currentFactsSourceHash,
      usingSeed: true,
    };
  }
  const pack = rowToPack(data as {
    id: string;
    version: string;
    content_hash: string;
    facts: UsageAssistantFacts;
    howto_zh: string;
    howto_en: string;
    facts_source_hash: string;
    created_at: string;
  });
  return {
    pack,
    currentFactsSourceHash,
    factsOutOfDate: pack.factsSourceHash !== currentFactsSourceHash,
    usingSeed: false,
    status: data.status,
    note: data.note,
    createdByName: data.created_by_name,
  };
}

export async function publishKnowledgeVersion(input: {
  howtoZh: string;
  howtoEn: string;
  syncFacts: boolean;
  note?: string;
  session: AppSession;
}) {
  if (!hasSupabaseServiceConfig()) {
    throw new Error("Supabase service config is required to publish knowledge");
  }

  const existing = await getKnowledgeVersionDetail();
  const facts = input.syncFacts || existing.usingSeed
    ? buildUsageAssistantFacts()
    : existing.pack.facts;
  const factsSourceHash = hashUsageAssistantFacts(facts);
  const howtoZh = clean(input.howtoZh) || existing.pack.howtoZh;
  const howtoEn = clean(input.howtoEn) || existing.pack.howtoEn;
  const contentHash = createHash("sha256")
    .update(JSON.stringify({ facts, howtoZh, howtoEn }))
    .digest("hex")
    .slice(0, 16);
  const version = `v-${contentHash}-${Date.now().toString(36)}`;
  const payload = {
    version,
    content_hash: contentHash,
    facts,
    howto_zh: howtoZh,
    howto_en: howtoEn,
    facts_source_hash: factsSourceHash,
    status: "published",
    note: clean(input.note) || null,
    created_by: input.session.id,
    created_by_name: input.session.displayName,
  };
  assertUsageAssistantPackSize(JSON.stringify(payload));

  const supabase = createSupabaseServiceClient();
  const { error: demoteError } = await supabase
    .from("usage_assistant_knowledge_versions")
    .update({ status: "draft" })
    .eq("status", "published");
  if (demoteError) throw new Error(demoteError.message);

  const { data, error } = await supabase
    .from("usage_assistant_knowledge_versions")
    .insert(payload)
    .select("id,version,content_hash,facts,howto_zh,howto_en,facts_source_hash,created_at,status")
    .single();
  if (error) throw new Error(error.message);
  return rowToPack(data as {
    id: string;
    version: string;
    content_hash: string;
    facts: UsageAssistantFacts;
    howto_zh: string;
    howto_en: string;
    facts_source_hash: string;
    created_at: string;
  });
}

function knowledgePromptText(pack: UsageAssistantKnowledgePack) {
  return [
    "## CODE_FACTS (authoritative for menus, reasons, statuses)",
    JSON.stringify(pack.facts, null, 2),
    "",
    "## HOWTO_ZH",
    pack.howtoZh,
    "",
    "## HOWTO_EN",
    pack.howtoEn,
  ].join("\n");
}

function buildSystemPrompt(pack: UsageAssistantKnowledgePack, currentPath: string) {
  const menuLinkHints = pack.facts.menus
    .filter((item) => !item.placeholder)
    .map((item) => `- ${item.zh} / ${item.en}: ${item.href}`)
    .join("\n");

  return [
    "You are Makuku SFA usage assistant. Answer ONLY how to use the system for daily operations.",
    "Use ONLY the knowledge pack below. CODE_FACTS wins over HOWTO when they conflict.",
    "If the knowledge pack does not contain enough information for an accurate usage answer, set grounding to \"fallback\".",
    "If the user asks for live metrics/counts/amounts, edits, approvals, or SQL/code internals, set grounding to \"refuse\".",
    "Only set grounding to \"grounded\" when your answer is fully supported by the knowledge pack.",
    "Reply language must match the user's latest question (zh, en, or id).",
    "Write the answer field in concise Markdown: use short headings (##), bullet/numbered lists, and **bold** for menu names.",
    "When telling the user where to go, ALWAYS include a Markdown link using the exact href from the menu list, e.g. [价格审核](/offline-price-candidates) or [Price Review](/offline-price-candidates).",
    "Do not invent paths. Do not wrap the whole answer in a code fence.",
    "Put matching menu hrefs into relatedMenus as well (use the href strings).",
    "Return JSON only: {\"grounding\":\"grounded\"|\"fallback\"|\"refuse\",\"answer\":\"...\",\"relatedMenus\":[\"/path\",...]}",
    `Current page path: ${currentPath || "(unknown)"}`,
    `Knowledge version: ${pack.version} hash=${pack.contentHash} source=${pack.source}`,
    "",
    "## MENU_LINKS (use these href values only)",
    menuLinkHints,
    "",
    knowledgePromptText(pack),
  ].join("\n");
}

function resolveRelatedMenuLinks(
  relatedMenus: string[],
  pack: UsageAssistantKnowledgePack,
  replyLanguage: UsageAssistantReplyLanguage,
) {
  const menus = pack.facts.menus.filter((item) => !item.placeholder);
  const resolved: Array<{ label: string; href: string }> = [];
  const seen = new Set<string>();

  for (const raw of relatedMenus) {
    const value = clean(raw);
    if (!value) continue;
    const normalizedPath = value.startsWith("/") ? value : `/${value}`;
    const hit = menus.find((item) =>
      item.href === value
      || item.href === normalizedPath
      || item.pageKey === value
      || item.zh === value
      || item.en === value
    ) ?? menus.find((item) =>
      value.includes(item.href)
      || item.zh.includes(value)
      || item.en.toLowerCase().includes(value.toLowerCase())
    );
    if (!hit || seen.has(hit.href)) continue;
    seen.add(hit.href);
    resolved.push({
      href: hit.href,
      label: replyLanguage === "en" || replyLanguage === "id" ? hit.en : hit.zh,
    });
  }
  return resolved.slice(0, 5);
}

function enrichAnswerWithDirectLinks(
  answer: string,
  relatedMenus: string[],
  pack: UsageAssistantKnowledgePack,
  replyLanguage: UsageAssistantReplyLanguage,
) {
  const links = resolveRelatedMenuLinks(relatedMenus, pack, replyLanguage);
  if (!links.length) return { answer, links };

  const missing = links.filter((item) =>
    !answer.includes(`](${item.href})`)
    && !answer.includes(`](${item.href}/`)
  );
  if (!missing.length) return { answer, links };

  const heading = replyLanguage === "zh"
    ? "## 直达入口"
    : replyLanguage === "id"
      ? "## Pintasan"
      : "## Open directly";
  const list = missing.map((item) => `- [${item.label}](${item.href})`).join("\n");
  return {
    answer: `${answer.trim()}\n\n${heading}\n${list}`,
    links,
  };
}

function normalizeGrounding(value: unknown): UsageAssistantGrounding {
  const raw = clean(value).toLowerCase();
  if (raw === "grounded") return "grounded";
  if (raw === "refuse") return "refuse";
  return "fallback";
}

export async function recordUsageAssistantTurn(input: {
  session: AppSession | null;
  locale?: string;
  uiLocale?: string;
  currentPath?: string;
  question: string;
  answer: string;
  grounding: UsageAssistantGrounding;
  relatedMenus?: string[];
  knowledgeVersion?: string;
  knowledgeContentHash?: string;
  model?: string;
  providerRequestId?: string;
  latencyMs?: number;
  error?: string;
}) {
  if (!hasSupabaseServiceConfig()) return;
  try {
    const supabase = createSupabaseServiceClient();
    await supabase.from("usage_assistant_turns").insert({
      user_id: input.session?.id ?? null,
      user_display_name: input.session?.displayName ?? null,
      user_role: input.session?.role ?? null,
      locale: input.locale ?? null,
      ui_locale: input.uiLocale ?? null,
      current_path: input.currentPath ?? null,
      question: input.question,
      answer: input.answer,
      grounding: input.grounding,
      related_menus: input.relatedMenus ?? null,
      knowledge_version: input.knowledgeVersion ?? null,
      knowledge_content_hash: input.knowledgeContentHash ?? null,
      model: input.model ?? null,
      provider_request_id: input.providerRequestId ?? null,
      latency_ms: input.latencyMs ?? null,
      error: input.error ?? null,
    });
  } catch {
    // Audit must not break the user reply path.
  }
}

export async function askUsageAssistant(input: {
  message: string;
  uiLocale?: string;
  currentPath?: string;
  history?: ChatTurn[];
  session: AppSession;
}) {
  const question = clean(input.message);
  const replyLanguage = detectUsageAssistantReplyLanguage(question);
  const started = Date.now();
  const pack = await loadPublishedKnowledgePack();

  if (!question) {
    const answer = fixedFallbackAnswer(replyLanguage);
    await recordUsageAssistantTurn({
      session: input.session,
      uiLocale: input.uiLocale,
      locale: replyLanguage,
      currentPath: input.currentPath,
      question: "",
      answer,
      grounding: "fallback",
      knowledgeVersion: pack.version,
      knowledgeContentHash: pack.contentHash,
      latencyMs: Date.now() - started,
      error: "empty_question",
    });
    return {
      answer,
      grounding: "fallback" as const,
      relatedMenus: [] as string[],
      recorded: true,
      knowledge: { version: pack.version, contentHash: pack.contentHash, source: pack.source, generatedAt: pack.generatedAt },
      replyLanguage,
    };
  }

  if (!hasAiConfig()) {
    const answer = fixedFallbackAnswer(replyLanguage);
    await recordUsageAssistantTurn({
      session: input.session,
      uiLocale: input.uiLocale,
      locale: replyLanguage,
      currentPath: input.currentPath,
      question,
      answer,
      grounding: "fallback",
      knowledgeVersion: pack.version,
      knowledgeContentHash: pack.contentHash,
      latencyMs: Date.now() - started,
      error: "AI_API_KEY is not configured",
    });
    return {
      answer,
      grounding: "fallback" as const,
      relatedMenus: [] as string[],
      recorded: true,
      knowledge: { version: pack.version, contentHash: pack.contentHash, source: pack.source, generatedAt: pack.generatedAt },
      replyLanguage,
      error: "AI is not configured",
    };
  }

  const history = (input.history ?? [])
    .filter((item) => (item.role === "user" || item.role === "assistant") && clean(item.content))
    .slice(-HISTORY_LIMIT);

  const historyBlock = history.length
    ? [
      "Conversation so far:",
      ...history.map((item) => `${item.role === "assistant" ? "Assistant" : "User"}: ${item.content}`),
      "",
      "Latest user question:",
      question,
    ].join("\n")
    : question;

  try {
    const completion = await createJsonChatCompletion({
      temperature: 0.2,
      maxTokens: 1200,
      messages: [
        { role: "system", content: buildSystemPrompt(pack, clean(input.currentPath)) },
        { role: "user", content: historyBlock },
      ],
    });

    const parsed = (completion.parsed && typeof completion.parsed === "object")
      ? completion.parsed as Record<string, unknown>
      : {};
    const modelGrounding = normalizeGrounding(parsed.grounding);
    const relatedMenus = Array.isArray(parsed.relatedMenus)
      ? parsed.relatedMenus.map((item) => clean(item)).filter(Boolean).slice(0, 8)
      : [];
    const modelAnswer = clean(parsed.answer);

    const groundedOk = modelGrounding === "grounded" && Boolean(modelAnswer);
    const grounding: UsageAssistantGrounding = groundedOk ? "grounded" : (modelGrounding === "refuse" ? "refuse" : "fallback");
    let answer = groundedOk ? modelAnswer : fixedFallbackAnswer(replyLanguage);
    let directLinks: Array<{ label: string; href: string }> = [];
    if (groundedOk) {
      const enriched = enrichAnswerWithDirectLinks(answer, relatedMenus, pack, replyLanguage);
      answer = enriched.answer;
      directLinks = enriched.links;
    }

    await recordUsageAssistantTurn({
      session: input.session,
      uiLocale: input.uiLocale,
      locale: replyLanguage,
      currentPath: input.currentPath,
      question,
      answer,
      grounding,
      relatedMenus: directLinks.map((item) => item.href),
      knowledgeVersion: pack.version,
      knowledgeContentHash: pack.contentHash,
      model: completion.metadata.model,
      providerRequestId: completion.metadata.provider_request_id,
      latencyMs: Date.now() - started,
    });

    return {
      answer,
      grounding,
      relatedMenus: directLinks.map((item) => item.href),
      directLinks,
      recorded: true,
      knowledge: { version: pack.version, contentHash: pack.contentHash, source: pack.source, generatedAt: pack.generatedAt },
      replyLanguage,
    };
  } catch (error) {
    const answer = fixedFallbackAnswer(replyLanguage);
    await recordUsageAssistantTurn({
      session: input.session,
      uiLocale: input.uiLocale,
      locale: replyLanguage,
      currentPath: input.currentPath,
      question,
      answer,
      grounding: "fallback",
      knowledgeVersion: pack.version,
      knowledgeContentHash: pack.contentHash,
      latencyMs: Date.now() - started,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return {
      answer,
      grounding: "fallback" as const,
      relatedMenus: [] as string[],
      recorded: true,
      knowledge: { version: pack.version, contentHash: pack.contentHash, source: pack.source, generatedAt: pack.generatedAt },
      replyLanguage,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function listRecentFallbackTurns(limit = 30) {
  if (!hasSupabaseServiceConfig()) return [];
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("usage_assistant_turns")
    .select("id,created_at,question,grounding,user_display_name,current_path,locale")
    .in("grounding", ["fallback", "refuse"])
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return data ?? [];
}

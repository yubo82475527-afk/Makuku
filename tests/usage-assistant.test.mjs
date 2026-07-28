import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import test from "node:test";

test("migration creates usage assistant tables with RLS and no client write policies", () => {
  const sql = readFileSync("supabase/migrations/202607280001_usage_assistant.sql", "utf8");
  assert.match(sql, /usage_assistant_knowledge_versions/);
  assert.match(sql, /usage_assistant_turns/);
  assert.match(sql, /enable row level security/);
  assert.match(sql, /uniq_usage_assistant_knowledge_one_published/);
  assert.doesNotMatch(sql, /create policy/);
});

test("page permissions and nav register usage-assistant-knowledge", () => {
  const pagePermissions = readFileSync("src/lib/page-permissions.ts", "utf8");
  const navConfig = readFileSync("src/lib/nav-config.ts", "utf8");
  const appShell = readFileSync("src/components/app-shell.tsx", "utf8");
  assert.match(pagePermissions, /"usage-assistant-knowledge"/);
  assert.match(pagePermissions, /使用助手知识库/);
  assert.match(navConfig, /usage-assistant-knowledge/);
  assert.match(appShell, /UsageAssistantDrawer/);
  assert.match(appShell, /NAV_GROUP_CONFIGS/);
});

test("howto knowledge files cover required modules", () => {
  const zh = readFileSync("docs/business/usage-assistant-knowledge.zh.md", "utf8");
  const en = readFileSync("docs/business/usage-assistant-knowledge.en.md", "utf8");
  for (const doc of [zh, en]) {
    assert.match(doc, /价格指数|Price Index/);
    assert.match(doc, /真实价格|Real Prices/);
    assert.match(doc, /巡店记录|Store Visit/);
    assert.match(doc, /价格审核|Price Review/);
    assert.match(doc, /报表中心|Report Center/);
  }
});

test("fixed fallback copy is locked for zh/en/id", () => {
  const source = readFileSync("src/lib/usage-assistant.ts", "utf8");
  assert.match(source, /抱歉，暂无对应知识，请联系 IT 进行补充/);
  assert.match(source, /Sorry, no matching knowledge is available yet\. Please contact IT to have it added\./);
  assert.match(source, /Maaf, belum ada pengetahuan yang sesuai\. Silakan hubungi IT untuk menambahkan\./);
  assert.match(source, /fixedFallbackAnswer/);
  assert.match(source, /MENU_LINKS/);
  assert.match(source, /直达入口|Open directly/);
  assert.match(source, /enrichAnswerWithDirectLinks/);
  assert.match(source, /modelGrounding === "grounded"/);
  assert.match(source, /detectUsageAssistantReplyLanguage/);
});

test("API routes and admin UI exist", () => {
  assert.equal(existsSync("src/app/api/usage-assistant/route.ts"), true);
  assert.equal(existsSync("src/app/api/usage-assistant-knowledge/route.ts"), true);
  assert.equal(existsSync("src/app/[locale]/usage-assistant-knowledge/page.tsx"), true);
  assert.equal(existsSync("src/components/usage-assistant-drawer.tsx"), true);
  assert.equal(existsSync("src/components/usage-assistant-knowledge-admin.tsx"), true);
  const askRoute = readFileSync("src/app/api/usage-assistant/route.ts", "utf8");
  const adminRoute = readFileSync("src/app/api/usage-assistant-knowledge/route.ts", "utf8");
  const drawer = readFileSync("src/components/usage-assistant-drawer.tsx", "utf8");
  assert.match(askRoute, /requireAdminSession/);
  assert.match(adminRoute, /usage-assistant-knowledge/);
  assert.match(adminRoute, /publishKnowledgeVersion/);
  assert.match(drawer, /AI 使用助手/);
  assert.match(drawer, /AI Assistant/);
  assert.doesNotMatch(drawer, /AI Help/);
  assert.match(drawer, /UsageAssistantMarkdown/);
  assert.match(drawer, /max-w-\[28rem\]/);
  assert.match(drawer, /Escape/);
  assert.match(drawer, /知识更新于/);
  assert.match(drawer, /onNavigate/);
  assert.doesNotMatch(drawer, /id: "welcome"/);
  const markdown = readFileSync("src/components/usage-assistant-markdown.tsx", "utf8");
  assert.match(markdown, /onNavigate/);
  assert.match(markdown, /bg-sky-50/);
  assert.doesNotMatch(markdown, /underline underline-offset-2/);
});

test("facts builder sources menus and review reasons from shared modules", () => {
  const facts = readFileSync("src/lib/usage-assistant-facts.ts", "utf8");
  assert.match(facts, /NAV_GROUP_CONFIGS/);
  assert.match(facts, /OPERATOR_PRICE_REVIEW_REASON_FILTERS/);
  assert.match(facts, /VISIT_ANALYSIS_STATUS_FACTS/);
  assert.match(facts, /Asia\/Jakarta/);
  assert.match(facts, /IDR/);
  assert.match(facts, /assertUsageAssistantPackSize/);
});

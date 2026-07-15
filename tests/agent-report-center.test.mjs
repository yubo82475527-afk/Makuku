import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

function readIfExists(path) {
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

const migrationFile = readIfExists("supabase/migrations/202607010002_agent_report_subscriptions_schedule.sql");
const subscriptionRouteFile = readIfExists("src/app/api/internal/agent-report-subscriptions/route.ts");
const subscriptionIdRouteFile = readIfExists("src/app/api/internal/agent-report-subscriptions/[id]/route.ts");
const replayRouteFile = readIfExists("src/app/api/internal/agent-reports/generate-from-subscription/route.ts");
const runSubscriptionsRouteFile = readIfExists("src/app/api/internal/agent-reports/run-subscriptions/route.ts");
const rerunRouteFile = readIfExists("src/app/api/internal/agent-reports/[id]/rerun/route.ts");
const redeliverRouteFile = readIfExists("src/app/api/internal/agent-reports/[id]/redeliver/route.ts");
const retryFailedRouteFile = readIfExists("src/app/api/internal/agent-reports/[id]/retry-failed/route.ts");
const dispatchRouteFile = readIfExists("src/app/api/internal/agent-reports/[id]/dispatch/route.ts");
const dispatchPreviewImageRouteFile = readIfExists("src/app/api/internal/agent-reports/[id]/dispatch-preview-image/route.ts");
const reportDetailRouteFile = readIfExists("src/app/api/internal/agent-reports/[id]/route.ts");
const reportCenterPageFile = readIfExists("src/app/[locale]/report-center/page.tsx");
const reportTemplatePreviewPageFile = readIfExists("src/app/[locale]/report-center/template-preview/page.tsx");
const reportCenterComponentFile = readIfExists("src/components/report-center.tsx");
const reportTemplatePreviewComponentFile = readIfExists("src/components/report-template-preview.tsx");
const reportTemplatePreviewActionsFile = readIfExists("src/components/report-template-preview-actions.tsx");
const appShellFile = readIfExists("src/components/app-shell.tsx");
const packageJsonFile = readIfExists("package.json");
const nextConfigFile = readIfExists("next.config.ts");
const typesFile = readIfExists("src/lib/types.ts");
const definitionsFile = readIfExists("src/lib/agent-report-definitions.ts");
const deliverySource = readIfExists("src/lib/agent-report-delivery.ts");
const feishuSource = readIfExists("src/lib/feishu.ts");
const vercelConfigFile = readIfExists("vercel.json");

test("subscription schedule migration upgrades agent_report_subscriptions for report center", () => {
  assert.equal(existsSync("supabase/migrations/202607010002_agent_report_subscriptions_schedule.sql"), true);
  assert.match(migrationFile, /alter table public\.agent_report_subscriptions/i);
  assert.match(migrationFile, /add column if not exists app_user_id uuid/i);
  assert.match(migrationFile, /add column if not exists feishu_user_id text/i);
  assert.match(migrationFile, /add column if not exists feishu_chat_id text/i);
  assert.match(migrationFile, /add column if not exists send_weekday smallint/i);
  assert.match(migrationFile, /add column if not exists send_day_of_month smallint/i);
  assert.match(migrationFile, /drop column if exists recipient_id/i);
  assert.match(migrationFile, /send_day_of_month >= 1 and send_day_of_month <= 28/i);
  assert.match(migrationFile, /timezone = 'Asia\/Jakarta'/i);
});

test("agent report types expose definition-aware schedule delivery summary and recipient details", () => {
  assert.match(typesFile, /export type AgentReportSubscription = \{/);
  assert.match(typesFile, /report_definition_code: string/);
  assert.match(typesFile, /report_family: AgentReportFamily/);
  assert.match(typesFile, /app_user_id\?: string \| null/);
  assert.match(typesFile, /feishu_user_id\?: string \| null/);
  assert.match(typesFile, /feishu_chat_id\?: string \| null/);
  assert.match(typesFile, /send_weekday\?: number \| null/);
  assert.match(typesFile, /send_day_of_month\?: number \| null/);
  assert.match(typesFile, /export type AgentReportDeliverySummary = \{/);
  assert.match(typesFile, /delivery_summary\?: AgentReportDeliverySummary/);
  assert.match(typesFile, /matched_subscriptions_count\?: number/);
  assert.match(typesFile, /recipients\?: AgentReportRecipient\[]/);
});

test("internal subscription APIs expose admin-only list create update and delete handlers", () => {
  assert.match(subscriptionRouteFile, /requireAdminSession/);
  assert.match(subscriptionRouteFile, /export async function GET/);
  assert.match(subscriptionRouteFile, /export async function POST/);
  assert.match(subscriptionIdRouteFile, /requireAdminSession/);
  assert.match(subscriptionIdRouteFile, /export async function PATCH/);
  assert.match(subscriptionIdRouteFile, /export async function DELETE/);
});

test("subscription update and delete routes cancel pending deliveries before removing delivery rules", () => {
  const subscriptionSource = readIfExists("src/lib/agent-report-subscriptions.ts");

  assert.match(subscriptionSource, /cancelPendingRecipientsForSubscription/);
  assert.match(subscriptionSource, /send_status", "pending"|send_status === "pending"/);
  assert.match(subscriptionSource, /export async function updateAgentReportSubscription[\s\S]*cancelPendingRecipientsForSubscription/);
  assert.match(subscriptionSource, /export async function deleteAgentReportSubscription[\s\S]*cancelPendingRecipientsForSubscription/);
  assert.match(subscriptionIdRouteFile, /updateAgentReportSubscription/);
  assert.match(subscriptionIdRouteFile, /deleteAgentReportSubscription/);
});

test("creating or re-enabling a subscription syncs pending delivery onto the latest matching report", () => {
  const subscriptionSource = readIfExists("src/lib/agent-report-subscriptions.ts");

  assert.match(subscriptionSource, /syncPendingRecipientToLatestReportForSubscription/);
  assert.match(subscriptionSource, /export async function createAgentReportSubscription[\s\S]*syncPendingRecipientToLatestReportForSubscription/);
  assert.match(subscriptionSource, /export async function updateAgentReportSubscription[\s\S]*syncPendingRecipientToLatestReportForSubscription/);
  assert.match(subscriptionSource, /order\("period_end", \{ ascending: false \}\)/);
});

test("reports page shows latest status and history with definition-aware subscriptions", () => {
  assert.match(replayRouteFile, /requireAdminSession/);
  assert.match(replayRouteFile, /export async function POST/);
  assert.match(runSubscriptionsRouteFile, /dispatchPendingAgentReportRecipients/);
  assert.match(runSubscriptionsRouteFile, /CRON_SECRET/);
  assert.match(runSubscriptionsRouteFile, /export async function GET/);
  assert.match(runSubscriptionsRouteFile, /export async function POST/);
  assert.match(rerunRouteFile, /requireAdminSession/);
  assert.match(rerunRouteFile, /export async function POST/);
  assert.match(redeliverRouteFile, /requireAdminSession/);
  assert.match(redeliverRouteFile, /export async function POST/);
  assert.match(redeliverRouteFile, /dispatchPendingAgentReportRecipients/);
  assert.match(retryFailedRouteFile, /requireAdminSession/);
  assert.match(retryFailedRouteFile, /export async function POST/);
  assert.match(dispatchRouteFile, /requireAdminSession/);
  assert.match(dispatchRouteFile, /export async function POST/);
  assert.match(dispatchRouteFile, /dispatchPendingAgentReportRecipients/);
  assert.match(reportDetailRouteFile, /recipients/i);
  assert.match(reportCenterPageFile, /PageShellState/);
  assert.match(reportCenterPageFile, /buildLatestStatusItems/);
  assert.match(reportCenterPageFile, /listEnabledAgentReportDefinitions/);
  assert.match(reportCenterComponentFile, /Reports/);
  assert.match(reportCenterComponentFile, /Latest Status/);
  assert.match(reportCenterComponentFile, /History/);
  assert.match(reportCenterComponentFile, /Report definition|Definition/);
  assert.match(reportCenterComponentFile, /daily_price_country/);
  assert.doesNotMatch(reportCenterComponentFile, /weekly_price_management/);
  assert.match(reportCenterComponentFile, /Add subscription|新增订阅/);
  assert.match(reportCenterComponentFile, /Not generated|未生成/);
  assert.match(reportCenterComponentFile, /formatReportStatus/);
  assert.match(reportCenterComponentFile, /Redeliver|重新投递/);
  assert.match(reportCenterComponentFile, /Rerun|重算/);
  assert.match(reportCenterComponentFile, /Dispatch pending|发送待发送/);
  assert.match(reportCenterComponentFile, /Retry failed|仅补失败/);
  assert.match(reportCenterComponentFile, /Template|模板预览/);
  assert.match(reportCenterComponentFile, /report-center\/template-preview\?report_id=/);
  assert.match(reportCenterComponentFile, /openReport/);
  assert.match(reportCenterComponentFile, /window\.confirm/);
  assert.match(reportCenterComponentFile, /可能重复发送|may send duplicate messages/i);
  assert.match(reportCenterComponentFile, /仅重试失败投递|only retry failed deliveries/i);
  assert.match(reportCenterComponentFile, /no card preview|卡片预览|There is no card preview/i);
  assert.doesNotMatch(reportCenterComponentFile, /<details>/);
  assert.doesNotMatch(reportCenterComponentFile, /Subscription Config/);
  assert.doesNotMatch(reportCenterComponentFile, /Generation Records/);
  assert.doesNotMatch(reportCenterComponentFile, /Run due subscriptions/);
  assert.match(appShellFile, /\/report-center/);
  assert.match(reportTemplatePreviewPageFile, /Template Preview|模板预览/);
  assert.match(reportTemplatePreviewPageFile, /getAgentReportById/);
  assert.match(reportTemplatePreviewPageFile, /daily_price_country/);
  assert.match(reportTemplatePreviewPageFile, /ReportTemplatePreviewActions/);
  assert.match(reportTemplatePreviewComponentFile, /Key Metric Definitions|指标说明/);
  assert.match(reportTemplatePreviewComponentFile, /Visited Stores/);
  assert.match(reportTemplatePreviewComponentFile, /Competitor Price Records/);
  assert.match(reportTemplatePreviewActionsFile, /Send Test Image|试发图片/);
  assert.match(reportTemplatePreviewActionsFile, /dispatch-preview-image/);
  assert.match(dispatchPreviewImageRouteFile, /dispatchReportTemplatePreviewImage/);
  assert.match(dispatchPreviewImageRouteFile, /requireAdminSession/);
});

test("redeliver rebuilds recipients from current subscriptions, removes stale pending or failed recipients, then dispatches", () => {
  const subscriptionSource = readIfExists("src/lib/agent-report-subscriptions.ts");

  assert.match(subscriptionSource, /pruneStaleRecipientsForReport/);
  assert.match(subscriptionSource, /send_status.*pending.*failed|in\("send_status", \["pending", "failed"\]\)/s);
  assert.match(subscriptionSource, /export async function redeliverAgentReport[\s\S]*pruneStaleRecipientsForReport/);
  assert.match(redeliverRouteFile, /redeliverAgentReport/);
  assert.match(redeliverRouteFile, /dispatchPendingAgentReportRecipients/);
  assert.match(redeliverRouteFile, /revalidatePath/);
});

test("delivery sender posts interactive cards to Feishu and updates recipient states", async () => {
  assert.match(feishuSource, /https:\/\/open\.feishu\.cn\/open-apis\/im\/v1\/messages/);
  assert.match(feishuSource, /msg_type:\s*"interactive"/);
  assert.match(feishuSource, /const content = JSON\.stringify\(input\.card\)/);
  assert.match(feishuSource, /content,/);
  assert.match(deliverySource, /send_status:\s*"sent"/);
  assert.match(deliverySource, /send_status:\s*"failed"/);
  assert.match(deliverySource, /feishu_message_id/);
  assert.match(deliverySource, /reportStatus = "sent"|status:\s*"sent"/);
  assert.match(deliverySource, /reportStatus = "failed"|status:\s*"failed"/);

  const feishuModule = await import("../src/lib/feishu.ts");
  assert.equal(typeof feishuModule.sendFeishuCardMessage, "function");

  const originalFetch = globalThis.fetch;
  const originalAppId = process.env.FEISHU_APP_ID;
  const originalAppSecret = process.env.FEISHU_APP_SECRET;
  const calls = [];
  process.env.FEISHU_APP_ID = "cli_test_app_id";
  process.env.FEISHU_APP_SECRET = "cli_test_app_secret";
  globalThis.fetch = async (input, init) => {
    calls.push({ input: String(input), init });
    if (String(input).includes("tenant_access_token")) {
      return new Response(JSON.stringify({ code: 0, tenant_access_token: "tenant_token" }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response(JSON.stringify({ code: 0, data: { message_id: "om_123" } }), { status: 200, headers: { "content-type": "application/json" } });
  };

  try {
    const messageId = await feishuModule.sendFeishuCardMessage({
      receiveIdType: "open_id",
      receiveId: "ou_123",
      card: { schema: "2.0" },
    });
    assert.equal(messageId, "om_123");
    assert.equal(calls.length, 2);
    assert.match(calls[1].input, /im\/v1\/messages\?receive_id_type=open_id/);
    assert.match(String(calls[1].init?.body ?? ""), /"msg_type":"interactive"/);
    assert.match(String(calls[1].init?.body ?? ""), /"receive_id":"ou_123"/);
    assert.match(String(calls[1].init?.body ?? ""), /"content":"\{.*\}"/);
    assert.doesNotMatch(String(calls[1].init?.body ?? ""), /"card":/);
  } finally {
    globalThis.fetch = originalFetch;
    process.env.FEISHU_APP_ID = originalAppId;
    process.env.FEISHU_APP_SECRET = originalAppSecret;
  }
});

test("preview image delivery uploads a Feishu image then sends image messages", () => {
  assert.match(feishuSource, /open-apis\/im\/v1\/images/);
  assert.match(feishuSource, /msg_type:\s*"image"/);
  assert.match(feishuSource, /image_key/);
  assert.match(deliverySource, /dispatchReportTemplatePreviewImage/);
  assert.match(deliverySource, /renderReportTemplatePreviewPng/);
  assert.match(deliverySource, /uploadFeishuMessageImage/);
  assert.match(deliverySource, /sendFeishuImageMessage/);
});

test("formal report delivery routes daily country reports to png while keeping other definitions on cards", async () => {
  assert.match(deliverySource, /resolveFormalReportDeliveryKind/);
  assert.match(deliverySource, /reportDefinitionCode === "daily_price_country"/);
  assert.match(deliverySource, /renderReportTemplatePreviewPng/);
  assert.match(deliverySource, /sendFeishuImageMessage/);
  assert.match(deliverySource, /sendFeishuCardMessage/);

  const deliveryModule = await import("../src/lib/agent-report-delivery.ts");
  assert.equal(deliveryModule.resolveFormalReportDeliveryKind("daily_price_country"), "image");
  assert.equal(deliveryModule.resolveFormalReportDeliveryKind("weekly_price_management"), "card");
});

test("subscription scheduling and delivery summary helpers validate definition-aware rules and create recipients", async () => {
  const subscriptionsModule = await import("../src/lib/agent-report-subscriptions.ts");
  const definitionsModule = await import("../src/lib/agent-report-definitions.ts");

  assert.match(definitionsFile, /supported_scope_types/);
  assert.equal(definitionsModule.getAgentReportDefinition("weekly_price_management").family, "weekly");

  assert.deepEqual(
    subscriptionsModule.normalizeSubscriptionInput({
      report_definition_code: "weekly_price_organization",
      recipient_type: "user",
      app_user_id: "user-1",
      feishu_user_id: "ou_123",
      scope_type: "organization",
      scope_id: "org-1",
      send_weekday: 1,
      send_time_local: "09:00:00",
      timezone: "Asia/Jakarta",
      enabled: true,
    }),
    {
      report_definition_code: "weekly_price_organization",
      report_family: "weekly",
      recipient_type: "user",
      app_user_id: "user-1",
      feishu_user_id: "ou_123",
      feishu_chat_id: null,
      scope_type: "organization",
      scope_id: "org-1",
      send_weekday: 1,
      send_day_of_month: null,
      send_time_local: "09:00:00",
      timezone: "Asia/Jakarta",
      enabled: true,
    },
  );

  assert.throws(
    () => subscriptionsModule.normalizeSubscriptionInput({
      report_definition_code: "monthly_price_country_summary",
      recipient_type: "chat",
      feishu_chat_id: "oc_123",
      scope_type: "global",
      scope_id: null,
      send_day_of_month: 31,
      send_time_local: "10:00:00",
      timezone: "Asia/Jakarta",
      enabled: true,
    }),
    /send_day_of_month/i,
  );

  assert.throws(
    () => subscriptionsModule.normalizeSubscriptionInput({
      report_definition_code: "daily_price_country",
      recipient_type: "user",
      app_user_id: "user-1",
      feishu_user_id: "ou_123",
      scope_type: "organization",
      scope_id: "org-1",
      send_time_local: "08:30:00",
      timezone: "Asia/Jakarta",
      enabled: true,
    }),
    /scope_type/i,
  );

  assert.equal(
    subscriptionsModule.formatSubscriptionSchedule({
      report_family: "daily",
      send_time_local: "08:30:00",
      send_weekday: null,
      send_day_of_month: null,
    }),
    "Daily 08:30",
  );

  assert.equal(
    subscriptionsModule.formatSubscriptionSchedule({
      report_family: "weekly",
      send_time_local: "09:00:00",
      send_weekday: 1,
      send_day_of_month: null,
    }),
    "Weekly Mon 09:00",
  );

  assert.equal(
    subscriptionsModule.formatSubscriptionSchedule({
      report_family: "monthly",
      send_time_local: "10:00:00",
      send_weekday: null,
      send_day_of_month: 1,
    }),
    "Monthly Day 1 10:00",
  );

  const recipient = subscriptionsModule.buildRecipientPayload({
    subscription: {
      id: "sub-1",
      report_definition_code: "daily_price_country",
      report_family: "daily",
      recipient_type: "user",
      app_user_id: "user-1",
      feishu_user_id: "ou_123",
      feishu_chat_id: null,
      scope_type: "global",
      scope_id: null,
      send_time_local: "08:30:00",
      send_weekday: null,
      send_day_of_month: null,
      timezone: "Asia/Jakarta",
      enabled: true,
      created_at: "2026-07-01T00:00:00.000Z",
      updated_at: "2026-07-01T00:00:00.000Z",
    },
    reportId: "report-1",
  });

  assert.deepEqual(recipient, {
    report_id: "report-1",
    app_user_id: "user-1",
    feishu_user_id: "ou_123",
    feishu_chat_id: null,
    delivery_channel: "user",
    send_status: "pending",
  });

  assert.deepEqual(subscriptionsModule.summarizeRecipients([
    { send_status: "pending" },
    { send_status: "sent" },
    { send_status: "sent" },
    { send_status: "failed" },
  ]), {
    recipient_count: 4,
    pending_count: 1,
    sent_count: 2,
    failed_count: 1,
  });

  assert.equal(
    subscriptionsModule.subscriptionMatchesReport(
      {
        report_definition_code: "weekly_price_organization",
        scope_type: "organization",
        scope_id: "org-1",
      },
      {
        report_definition_code: "weekly_price_organization",
        report_family: "weekly",
        recipient_type: "user",
        app_user_id: "user-1",
        feishu_user_id: "ou_123",
        feishu_chat_id: null,
        scope_type: "organization",
        scope_id: "org-1",
        send_time_local: "09:00:00",
        send_weekday: 1,
        send_day_of_month: null,
        timezone: "Asia/Jakarta",
        enabled: true,
      },
    ),
    true,
  );

  assert.equal(
    subscriptionsModule.subscriptionMatchesReport(
      {
        report_definition_code: "weekly_price_organization",
        scope_type: "organization",
        scope_id: "org-1",
      },
      {
        report_definition_code: "weekly_price_organization",
        report_family: "weekly",
        recipient_type: "user",
        app_user_id: "user-1",
        feishu_user_id: "ou_123",
        feishu_chat_id: null,
        scope_type: "organization",
        scope_id: "org-2",
        send_time_local: "09:00:00",
        send_weekday: 1,
        send_day_of_month: null,
        timezone: "Asia/Jakarta",
        enabled: true,
      },
    ),
    false,
  );

  assert.equal(
    subscriptionsModule.subscriptionMatchesReport(
      {
        report_definition_code: "weekly_price_organization",
        scope_type: "organization",
        scope_id: "org-1",
      },
      {
        report_definition_code: "weekly_price_organization",
        report_family: "weekly",
        recipient_type: "user",
        app_user_id: "user-1",
        feishu_user_id: "ou_123",
        feishu_chat_id: null,
        scope_type: "organization",
        scope_id: "org-1",
        send_time_local: "09:00:00",
        send_weekday: 1,
        send_day_of_month: null,
        timezone: "Asia/Jakarta",
        enabled: false,
      },
    ),
    false,
  );

  assert.equal(
    subscriptionsModule.subscriptionIsDueAt(
      {
        report_family: "daily",
        recipient_type: "chat",
        app_user_id: null,
        feishu_user_id: null,
        feishu_chat_id: "oc_123",
        scope_type: "global",
        scope_id: null,
        send_time_local: "08:30:00",
        send_weekday: null,
        send_day_of_month: null,
        timezone: "Asia/Jakarta",
        enabled: true,
      },
      "2026-07-02T01:30:00.000Z",
    ),
    true,
  );

  assert.equal(
    subscriptionsModule.subscriptionIsDueAt(
      {
        report_family: "weekly",
        recipient_type: "chat",
        app_user_id: null,
        feishu_user_id: null,
        feishu_chat_id: "oc_123",
        scope_type: "global",
        scope_id: null,
        send_time_local: "09:00:00",
        send_weekday: 1,
        send_day_of_month: null,
        timezone: "Asia/Jakarta",
        enabled: true,
      },
      "2026-07-06T02:00:00.000Z",
    ),
    true,
  );

  assert.equal(
    subscriptionsModule.subscriptionIsDueAt(
      {
        report_family: "monthly",
        recipient_type: "chat",
        app_user_id: null,
        feishu_user_id: null,
        feishu_chat_id: "oc_123",
        scope_type: "global",
        scope_id: null,
        send_time_local: "10:00:00",
        send_weekday: null,
        send_day_of_month: 1,
        timezone: "Asia/Jakarta",
        enabled: true,
      },
      "2026-07-01T03:00:00.000Z",
    ),
    true,
  );

  assert.equal(
    subscriptionsModule.resolveSubscriptionPeriodAnchor(
      {
        report_definition_code: "daily_price_country",
        report_family: "daily",
        recipient_type: "chat",
        app_user_id: null,
        feishu_user_id: null,
        feishu_chat_id: "oc_123",
        scope_type: "global",
        scope_id: null,
        send_time_local: "08:30:00",
        send_weekday: null,
        send_day_of_month: null,
        timezone: "Asia/Jakarta",
        enabled: true,
      },
      "2026-07-03T01:30:00.000Z",
    ),
    "2026-07-02",
  );

  assert.equal(
    subscriptionsModule.resolveSubscriptionPeriodAnchor(
      {
        report_definition_code: "weekly_price_management",
        report_family: "weekly",
        recipient_type: "chat",
        app_user_id: null,
        feishu_user_id: null,
        feishu_chat_id: "oc_123",
        scope_type: "global",
        scope_id: null,
        send_time_local: "09:00:00",
        send_weekday: 1,
        send_day_of_month: null,
        timezone: "Asia/Jakarta",
        enabled: true,
      },
      "2026-07-06T02:00:00.000Z",
    ),
    "2026-06-29",
  );

  assert.equal(
    subscriptionsModule.resolveSubscriptionPeriodAnchor(
      {
        report_definition_code: "monthly_price_country_summary",
        report_family: "monthly",
        recipient_type: "chat",
        app_user_id: null,
        feishu_user_id: null,
        feishu_chat_id: "oc_123",
        scope_type: "global",
        scope_id: null,
        send_time_local: "10:00:00",
        send_weekday: null,
        send_day_of_month: 1,
        timezone: "Asia/Jakarta",
        enabled: true,
      },
      "2026-07-01T03:00:00.000Z",
    ),
    "2026-06-01",
  );
});

test("vercel cron configuration runs report subscriptions automatically every day at 08:30 Jakarta", () => {
  assert.equal(existsSync("vercel.json"), true);
  assert.match(vercelConfigFile, /"path"\s*:\s*"\/api\/internal\/agent-reports\/run-subscriptions"/);
  assert.match(vercelConfigFile, /"schedule"\s*:\s*"30 1 \* \* \*"/);
});

test("report image delivery keeps playwright as a runtime dependency and traces its assets for server routes", () => {
  assert.match(packageJsonFile, /"dependencies"\s*:\s*\{[\s\S]*"playwright-core"\s*:/);
  assert.match(packageJsonFile, /"dependencies"\s*:\s*\{[\s\S]*"@sparticuz\/chromium(?:-min)?"\s*:/);
  assert.match(nextConfigFile, /outputFileTracingIncludes/);
  assert.match(nextConfigFile, /node_modules\/@sparticuz\/chromium(?:-min)?\/\*\*\/*/);
  assert.match(nextConfigFile, /node_modules\/playwright-core\/\*\*\/*/);
  assert.match(nextConfigFile, /\/api\/internal\/agent-reports\/run-subscriptions/);
  assert.match(nextConfigFile, /dispatch-preview-image/);
});

test("report PNG renderer uses serverless chromium on Vercel instead of requiring playwright-managed browser installs", () => {
  const reportTemplateRenderFile = readIfExists("src/lib/report-template-render.ts");

  assert.match(reportTemplateRenderFile, /process\.env\.VERCEL|AWS_LAMBDA_FUNCTION_VERSION|NODE_ENV/);
  assert.match(reportTemplateRenderFile, /@sparticuz\/chromium/);
  assert.match(reportTemplateRenderFile, /playwright-core/);
  assert.match(reportTemplateRenderFile, /executablePath/);
  assert.match(reportTemplateRenderFile, /if \(isServerlessRuntime\(\)\)/);
  assert.match(reportTemplateRenderFile, /await import\("playwright"\)/);
});

test("report image template now uses English-only copy for consistent cross-environment rendering", () => {
  const reportTemplateRenderFile = readIfExists("src/lib/report-template-render.ts");
  const reportTemplatePreviewFile = readIfExists("src/components/report-template-preview.tsx");

  assert.match(reportTemplateRenderFile, /SFA Execution Daily Report \(HQ\)/);
  assert.match(reportTemplateRenderFile, /Prior-day store visit and price capture summary grouped by Google Maps province/);
  assert.match(reportTemplateRenderFile, /Visited Stores/);
  assert.doesNotMatch(reportTemplateRenderFile, /执行日报|拜访门店数|口径|范围/);

  assert.match(reportTemplatePreviewFile, /SFA Execution Daily Report \(HQ\)/);
  assert.match(reportTemplatePreviewFile, /Prior-day store visit and price capture summary grouped by Google Maps province/);
  assert.doesNotMatch(reportTemplatePreviewFile, /执行日报|拜访门店数|口径|范围/);
});



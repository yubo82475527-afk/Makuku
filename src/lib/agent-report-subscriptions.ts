import { createSupabaseServiceClient, hasSupabaseServiceConfig } from "./supabase.ts";
import {
  definitionSupportsScope,
  getAgentReportDefinition,
  legacyReportTypeToDefinitionCode,
} from "./agent-report-definitions.ts";
import { resolveLatestPeriodAnchor } from "./agent-report-periods.ts";
import { generateAgentReport } from "./agent-reports.ts";
import type {
  AgentReport,
  AgentReportDeliverySummary,
  AgentReportFamily,
  AgentReportRecipient,
  AgentReportRecipientType,
  AgentReportScopeType,
  AgentReportSubscription,
  AgentReportType,
} from "./types.ts";

type QueryResult<T> = {
  data: T;
  error: string | null;
  isDemo: boolean;
};

type SubscriptionFilters = {
  reportDefinitionCode?: string;
  reportFamily?: AgentReportFamily;
  reportType?: AgentReportType;
  recipientType?: AgentReportRecipientType;
  enabled?: boolean;
  scopeType?: AgentReportScopeType;
  limit?: number;
};

type RawSubscriptionInput = Record<string, unknown>;

type NormalizedSubscriptionInput = {
  report_definition_code: string;
  report_family: AgentReportFamily;
  recipient_type: AgentReportRecipientType;
  app_user_id: string | null;
  feishu_user_id: string | null;
  feishu_chat_id: string | null;
  scope_type: AgentReportScopeType;
  scope_id: string | null;
  send_time_local: string;
  send_weekday: number | null;
  send_day_of_month: number | null;
  timezone: "Asia/Jakarta";
  enabled: boolean;
};

type ReplayInput = {
  subscriptionId: string;
  periodAnchor: string;
  force?: boolean;
};

type RedeliverInput = {
  report: AgentReport;
};

type RetryFailedInput = {
  report: AgentReport;
};

type DispatchDueSubscriptionsInput = {
  runAt?: string | Date;
  force?: boolean;
};

const JAKARTA_TIMEZONE = "Asia/Jakarta";
const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function cleanNullable(value: unknown) {
  const text = clean(value);
  return text || null;
}

function readBoolean(value: unknown, fallback = true) {
  if (typeof value === "boolean") return value;
  const text = clean(value).toLowerCase();
  if (!text) return fallback;
  return text === "true" || text === "1" || text === "yes";
}

function readRecipientType(value: unknown): AgentReportRecipientType | null {
  const recipientType = clean(value);
  return recipientType === "user" || recipientType === "chat" ? recipientType : null;
}

function readScopeType(value: unknown): AgentReportScopeType | null {
  const scopeType = clean(value);
  return scopeType === "global" || scopeType === "organization" || scopeType === "user" ? scopeType : null;
}

function readInteger(value: unknown) {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  const text = clean(value);
  if (!text) return null;
  const parsed = Number(text);
  return Number.isInteger(parsed) ? parsed : null;
}

function normalizeTime(value: unknown) {
  const text = clean(value);
  if (!text) throw new Error("Missing send_time_local");
  if (!/^\d{2}:\d{2}(:\d{2})?$/.test(text)) throw new Error("Invalid send_time_local");
  return text.length === 5 ? `${text}:00` : text;
}

function resolveDefinitionCode(input: RawSubscriptionInput) {
  const direct = cleanNullable(input.report_definition_code);
  if (direct) return direct;
  const legacyType = cleanNullable(input.report_type) as AgentReportType | null;
  const scopeType = readScopeType(input.scope_type);
  if (!legacyType || !scopeType) throw new Error("Missing valid report_definition_code");
  return legacyReportTypeToDefinitionCode(legacyType, scopeType);
}

function jakartaClockParts(input: string | Date) {
  const date = input instanceof Date ? input : new Date(input);
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: JAKARTA_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const read = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  const weekday = read("weekday");
  const weekdayIndex = WEEKDAY_LABELS.indexOf(weekday as typeof WEEKDAY_LABELS[number]) + 1;
  return {
    dateKey: `${read("year")}-${read("month")}-${read("day")}`,
    timeKey: `${read("hour")}:${read("minute")}`,
    dayOfMonth: Number(read("day")),
    weekday: weekdayIndex > 0 ? weekdayIndex : 1,
  };
}

export function normalizeSubscriptionInput(input: RawSubscriptionInput): NormalizedSubscriptionInput {
  const reportDefinitionCode = resolveDefinitionCode(input);
  const definition = getAgentReportDefinition(reportDefinitionCode);
  const recipientType = readRecipientType(input.recipient_type);
  const scopeType = readScopeType(input.scope_type);
  const appUserId = cleanNullable(input.app_user_id);
  const feishuUserId = cleanNullable(input.feishu_user_id);
  const feishuChatId = cleanNullable(input.feishu_chat_id);
  const rawScopeId = cleanNullable(input.scope_id);
  const sendTimeLocal = normalizeTime(input.send_time_local);
  const sendWeekday = readInteger(input.send_weekday);
  const sendDayOfMonth = readInteger(input.send_day_of_month);
  const timezone = clean(input.timezone || JAKARTA_TIMEZONE) || JAKARTA_TIMEZONE;
  const enabled = readBoolean(input.enabled, true);

  if (!recipientType) throw new Error("Missing valid recipient_type");
  if (!scopeType) throw new Error("Missing valid scope_type");
  if (timezone !== JAKARTA_TIMEZONE) throw new Error("timezone must be Asia/Jakarta");
  if (!definitionSupportsScope(definition, scopeType)) throw new Error(`scope_type ${scopeType} is not supported by ${definition.code}`);

  if (recipientType === "user") {
    if (!feishuUserId) throw new Error("feishu_user_id is required for user subscriptions");
    if (feishuChatId) throw new Error("feishu_chat_id must be empty for user subscriptions");
  }
  if (recipientType === "chat") {
    if (!feishuChatId) throw new Error("feishu_chat_id is required for chat subscriptions");
    if (feishuUserId) throw new Error("feishu_user_id must be empty for chat subscriptions");
    if (appUserId) throw new Error("app_user_id must be empty for chat subscriptions");
  }

  if (scopeType === "global" && rawScopeId) throw new Error("scope_id must be empty for global scope");
  if (scopeType !== "global" && !rawScopeId) throw new Error("scope_id is required for organization and user scope");

  if (definition.family === "daily") {
    if (sendWeekday !== null) throw new Error("send_weekday must be empty for daily subscriptions");
    if (sendDayOfMonth !== null) throw new Error("send_day_of_month must be empty for daily subscriptions");
  }
  if (definition.family === "weekly") {
    if (sendWeekday === null || sendWeekday < 1 || sendWeekday > 7) throw new Error("send_weekday must be 1-7 for weekly subscriptions");
    if (sendDayOfMonth !== null) throw new Error("send_day_of_month must be empty for weekly subscriptions");
  }
  if (definition.family === "monthly") {
    if (sendDayOfMonth === null || sendDayOfMonth < 1 || sendDayOfMonth > 28) throw new Error("send_day_of_month must be 1-28 for monthly subscriptions");
    if (sendWeekday !== null) throw new Error("send_weekday must be empty for monthly subscriptions");
  }

  return {
    report_definition_code: definition.code,
    report_family: definition.family,
    recipient_type: recipientType,
    app_user_id: appUserId,
    feishu_user_id: feishuUserId,
    feishu_chat_id: feishuChatId,
    scope_type: scopeType,
    scope_id: scopeType === "global" ? null : rawScopeId,
    send_time_local: sendTimeLocal,
    send_weekday: definition.family === "weekly" ? sendWeekday : null,
    send_day_of_month: definition.family === "monthly" ? sendDayOfMonth : null,
    timezone: JAKARTA_TIMEZONE,
    enabled,
  };
}

export function formatSubscriptionSchedule(input: {
  report_family: AgentReportFamily;
  send_time_local: string;
  send_weekday?: number | null;
  send_day_of_month?: number | null;
}) {
  const time = input.send_time_local.slice(0, 5);
  if (input.report_family === "daily") return `Daily ${time}`;
  if (input.report_family === "weekly") {
    const weekday = input.send_weekday ? WEEKDAY_LABELS[input.send_weekday - 1] : "Mon";
    return `Weekly ${weekday} ${time}`;
  }
  return `Monthly Day ${input.send_day_of_month ?? 1} ${time}`;
}

export function buildRecipientPayload(input: {
  subscription: AgentReportSubscription;
  reportId: string;
}) {
  return {
    report_id: input.reportId,
    app_user_id: input.subscription.app_user_id ?? null,
    feishu_user_id: input.subscription.feishu_user_id ?? null,
    feishu_chat_id: input.subscription.feishu_chat_id ?? null,
    delivery_channel: input.subscription.recipient_type,
    send_status: "pending" as const,
  };
}

export function summarizeRecipients(recipients: Array<Pick<AgentReportRecipient, "send_status">>) {
  const summary: AgentReportDeliverySummary = {
    recipient_count: recipients.length,
    pending_count: 0,
    sent_count: 0,
    failed_count: 0,
  };
  for (const recipient of recipients) {
    if (recipient.send_status === "pending") summary.pending_count += 1;
    if (recipient.send_status === "sent") summary.sent_count += 1;
    if (recipient.send_status === "failed") summary.failed_count += 1;
  }
  return summary;
}

export function subscriptionMatchesReport(
  report: Pick<AgentReport, "report_definition_code" | "scope_type" | "scope_id">,
  subscription: Pick<AgentReportSubscription, "report_definition_code" | "scope_type" | "scope_id" | "enabled">,
) {
  if (!subscription.enabled) return false;
  if (subscription.report_definition_code !== report.report_definition_code) return false;
  if (subscription.scope_type !== report.scope_type) return false;
  return (subscription.scope_id ?? null) === (report.scope_id ?? null);
}

export function resolveSubscriptionPeriodAnchor(
  subscription: Pick<AgentReportSubscription, "report_definition_code" | "report_family">,
  runAt: string | Date,
) {
  return resolveLatestPeriodAnchor(subscription.report_definition_code, runAt);
}

export function subscriptionIsDueAt(
  subscription: Pick<AgentReportSubscription, "report_family" | "send_time_local" | "send_weekday" | "send_day_of_month" | "enabled">,
  runAt: string | Date,
) {
  if (!subscription.enabled) return false;
  const clock = jakartaClockParts(runAt);
  if (clock.timeKey !== subscription.send_time_local.slice(0, 5)) return false;
  if (subscription.report_family === "daily") return true;
  if (subscription.report_family === "weekly") return clock.weekday === (subscription.send_weekday ?? 1);
  return clock.dayOfMonth === (subscription.send_day_of_month ?? 1);
}

async function validateScopeReferences(input: NormalizedSubscriptionInput) {
  if (!hasSupabaseServiceConfig()) return;
  const supabase = createSupabaseServiceClient();

  if (input.scope_type === "organization") {
    const { data, error } = await supabase.from("organizations").select("id").eq("id", input.scope_id).maybeSingle();
    if (error || !data) throw new Error("Organization scope_id not found");
  }

  if (input.scope_type === "user") {
    const { data, error } = await supabase.from("app_users").select("id").eq("id", input.scope_id).maybeSingle();
    if (error || !data) throw new Error("User scope_id not found");
  }

  if (input.recipient_type === "user" && input.app_user_id) {
    const { data, error } = await supabase
      .from("app_users")
      .select("id,feishu_user_id")
      .eq("id", input.app_user_id)
      .maybeSingle();
    if (error || !data) throw new Error("app_user_id not found");
    if (!cleanNullable(data.feishu_user_id)) throw new Error("Selected app_user is missing feishu_user_id");
    if (cleanNullable(data.feishu_user_id) !== input.feishu_user_id) throw new Error("feishu_user_id does not match selected app_user");
  }
}

function normalizeSubscriptionRow(row: AgentReportSubscription | Record<string, unknown>) {
  const subscription = row as AgentReportSubscription & {
    report_definition_code?: string | null;
    report_family?: AgentReportFamily | null;
    report_type?: AgentReportType | null;
  };
  const definitionCode = cleanNullable(subscription.report_definition_code)
    ?? legacyReportTypeToDefinitionCode((subscription.report_type ?? "daily") as AgentReportType, subscription.scope_type);
  const definition = getAgentReportDefinition(definitionCode);
  return {
    ...subscription,
    report_type: subscription.report_type ?? definition.family,
    report_definition_code: definition.code,
    report_family: subscription.report_family ?? definition.family,
  } as AgentReportSubscription;
}

function subscriptionIdentityChanged(
  previous: AgentReportSubscription,
  next: NormalizedSubscriptionInput,
) {
  return previous.report_definition_code !== next.report_definition_code
    || previous.scope_type !== next.scope_type
    || (previous.scope_id ?? null) !== (next.scope_id ?? null)
    || previous.recipient_type !== next.recipient_type
    || (previous.app_user_id ?? null) !== (next.app_user_id ?? null)
    || (previous.feishu_user_id ?? null) !== (next.feishu_user_id ?? null)
    || (previous.feishu_chat_id ?? null) !== (next.feishu_chat_id ?? null);
}

async function cancelPendingRecipientsForSubscription(subscription: AgentReportSubscription): Promise<QueryResult<{ deletedCount: number }>> {
  if (!hasSupabaseServiceConfig()) return { data: { deletedCount: 0 }, error: null, isDemo: true };

  const supabase = createSupabaseServiceClient();
  let query = supabase
    .from("agent_report_recipients")
    .select("id, agent_reports!inner(report_definition_code, scope_type, scope_id)")
    .eq("delivery_channel", subscription.recipient_type)
    .eq("send_status", "pending")
    .eq("agent_reports.report_definition_code", subscription.report_definition_code)
    .eq("agent_reports.scope_type", subscription.scope_type);

  query = subscription.scope_id ? query.eq("agent_reports.scope_id", subscription.scope_id) : query.is("agent_reports.scope_id", null);
  query = subscription.app_user_id ? query.eq("app_user_id", subscription.app_user_id) : query.is("app_user_id", null);
  query = subscription.feishu_user_id ? query.eq("feishu_user_id", subscription.feishu_user_id) : query.is("feishu_user_id", null);
  query = subscription.feishu_chat_id ? query.eq("feishu_chat_id", subscription.feishu_chat_id) : query.is("feishu_chat_id", null);

  const { data, error } = await query;
  if (error) return { data: { deletedCount: 0 }, error: error.message, isDemo: false };

  const recipientIds = (data ?? []).map((row) => String((row as { id: string }).id)).filter(Boolean);
  if (recipientIds.length === 0) return { data: { deletedCount: 0 }, error: null, isDemo: false };

  const { error: deleteError } = await supabase.from("agent_report_recipients").delete().in("id", recipientIds);
  if (deleteError) return { data: { deletedCount: 0 }, error: deleteError.message, isDemo: false };

  return { data: { deletedCount: recipientIds.length }, error: null, isDemo: false };
}

async function syncPendingRecipientToLatestReportForSubscription(subscription: AgentReportSubscription): Promise<QueryResult<AgentReportRecipient | null>> {
  if (!hasSupabaseServiceConfig()) return { data: null, error: null, isDemo: true };

  const supabase = createSupabaseServiceClient();
  let query = supabase
    .from("agent_reports")
    .select("*")
    .eq("report_definition_code", subscription.report_definition_code)
    .eq("scope_type", subscription.scope_type)
    .order("period_end", { ascending: false })
    .order("generated_at", { ascending: false })
    .limit(1);

  query = subscription.scope_id ? query.eq("scope_id", subscription.scope_id) : query.is("scope_id", null);

  const { data, error } = await query.maybeSingle();
  if (error) return { data: null, error: error.message, isDemo: false };
  if (!data) return { data: null, error: null, isDemo: false };

  return upsertReportRecipient({
    reportId: String((data as { id: string }).id),
    subscription,
  });
}

export async function listAgentReportSubscriptions(filters: SubscriptionFilters = {}): Promise<QueryResult<AgentReportSubscription[]>> {
  if (!hasSupabaseServiceConfig()) return { data: [], error: null, isDemo: true };
  const supabase = createSupabaseServiceClient();
  let query = supabase
    .from("agent_report_subscriptions")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(filters.limit ?? 100);

  if (filters.reportDefinitionCode) query = query.eq("report_definition_code", filters.reportDefinitionCode);
  if (filters.reportFamily) query = query.eq("report_family", filters.reportFamily);
  if (!filters.reportFamily && filters.reportType) query = query.eq("report_family", filters.reportType);
  if (filters.recipientType) query = query.eq("recipient_type", filters.recipientType);
  if (typeof filters.enabled === "boolean") query = query.eq("enabled", filters.enabled);
  if (filters.scopeType) query = query.eq("scope_type", filters.scopeType);

  const { data, error } = await query;
  if (error) return { data: [], error: error.message, isDemo: false };
  return { data: ((data ?? []) as AgentReportSubscription[]).map(normalizeSubscriptionRow), error: null, isDemo: false };
}

export async function getAgentReportSubscriptionById(id: string): Promise<QueryResult<AgentReportSubscription | null>> {
  if (!hasSupabaseServiceConfig()) return { data: null, error: null, isDemo: true };
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase.from("agent_report_subscriptions").select("*").eq("id", id).maybeSingle();
  if (error) return { data: null, error: error.message, isDemo: false };
  return { data: data ? normalizeSubscriptionRow(data) : null, error: null, isDemo: false };
}

export async function createAgentReportSubscription(input: RawSubscriptionInput): Promise<QueryResult<AgentReportSubscription>> {
  const normalized = normalizeSubscriptionInput(input);
  await validateScopeReferences(normalized);

  if (!hasSupabaseServiceConfig()) {
    const now = new Date().toISOString();
    return {
      data: normalizeSubscriptionRow({ id: `demo-${now}`, ...normalized, report_type: normalized.report_family, created_at: now, updated_at: now }),
      error: null,
      isDemo: true,
    };
  }

  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("agent_report_subscriptions")
    .insert({ ...normalized, report_type: normalized.report_family, updated_at: new Date().toISOString() })
    .select("*")
    .single();

  if (error) return { data: normalizeSubscriptionRow({ id: "", ...normalized, report_type: normalized.report_family, created_at: "", updated_at: "" }), error: error.message, isDemo: false };
  const subscription = normalizeSubscriptionRow(data);
  if (subscription.enabled) {
    const syncResult = await syncPendingRecipientToLatestReportForSubscription(subscription);
    if (syncResult.error) return { data: subscription, error: syncResult.error, isDemo: false };
  }
  return { data: subscription, error: null, isDemo: false };
}

export async function updateAgentReportSubscription(id: string, input: RawSubscriptionInput): Promise<QueryResult<AgentReportSubscription>> {
  const normalized = normalizeSubscriptionInput(input);
  await validateScopeReferences(normalized);

  if (!hasSupabaseServiceConfig()) {
    const now = new Date().toISOString();
    return {
      data: normalizeSubscriptionRow({ id, ...normalized, report_type: normalized.report_family, created_at: now, updated_at: now }),
      error: null,
      isDemo: true,
    };
  }

  const supabase = createSupabaseServiceClient();
  const existingResult = await getAgentReportSubscriptionById(id);
  if (existingResult.error) {
    return {
      data: normalizeSubscriptionRow({ id, ...normalized, report_type: normalized.report_family, created_at: "", updated_at: "" }),
      error: existingResult.error,
      isDemo: false,
    };
  }
  if (!existingResult.data) {
    return {
      data: normalizeSubscriptionRow({ id, ...normalized, report_type: normalized.report_family, created_at: "", updated_at: "" }),
      error: "Subscription not found",
      isDemo: false,
    };
  }

  const shouldCancelPending = existingResult.data.enabled
    && (!normalized.enabled || subscriptionIdentityChanged(existingResult.data, normalized));
  if (shouldCancelPending) {
    const cancelResult = await cancelPendingRecipientsForSubscription(existingResult.data);
    if (cancelResult.error) {
      return {
        data: normalizeSubscriptionRow({ id, ...normalized, report_type: normalized.report_family, created_at: "", updated_at: "" }),
        error: cancelResult.error,
        isDemo: false,
      };
    }
  }

  const { data, error } = await supabase
    .from("agent_report_subscriptions")
    .update({ ...normalized, report_type: normalized.report_family, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();

  if (error) return { data: normalizeSubscriptionRow({ id, ...normalized, report_type: normalized.report_family, created_at: "", updated_at: "" }), error: error.message, isDemo: false };
  const subscription = normalizeSubscriptionRow(data);
  if (subscription.enabled) {
    const syncResult = await syncPendingRecipientToLatestReportForSubscription(subscription);
    if (syncResult.error) return { data: subscription, error: syncResult.error, isDemo: false };
  }
  return { data: subscription, error: null, isDemo: false };
}

export async function deleteAgentReportSubscription(id: string): Promise<QueryResult<{ id: string }>> {
  if (!hasSupabaseServiceConfig()) return { data: { id }, error: null, isDemo: true };
  const existingResult = await getAgentReportSubscriptionById(id);
  if (existingResult.error) return { data: { id }, error: existingResult.error, isDemo: false };
  if (!existingResult.data) return { data: { id }, error: "Subscription not found", isDemo: false };

  const cancelResult = await cancelPendingRecipientsForSubscription(existingResult.data);
  if (cancelResult.error) return { data: { id }, error: cancelResult.error, isDemo: false };

  const supabase = createSupabaseServiceClient();
  const { error } = await supabase.from("agent_report_subscriptions").delete().eq("id", id);
  if (error) return { data: { id }, error: error.message, isDemo: false };
  return { data: { id }, error: null, isDemo: false };
}

async function createReportRecipient(input: {
  reportId: string;
  subscription: AgentReportSubscription;
}): Promise<QueryResult<AgentReportRecipient>> {
  const payload = buildRecipientPayload(input);
  if (!hasSupabaseServiceConfig()) {
    const now = new Date().toISOString();
    return {
      data: {
        id: `demo-recipient-${input.subscription.id}`,
        ...payload,
        feishu_message_id: null,
        sent_at: null,
        error_message: null,
        created_at: now,
        updated_at: now,
      },
      error: null,
      isDemo: true,
    };
  }

  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("agent_report_recipients")
    .insert(payload)
    .select("*")
    .single();
  if (error) {
    return {
      data: {
        id: "",
        ...payload,
        feishu_message_id: null,
        sent_at: null,
        error_message: error.message,
        created_at: "",
        updated_at: "",
      },
      error: error.message,
      isDemo: false,
    };
  }
  return { data: data as AgentReportRecipient, error: null, isDemo: false };
}

async function listMatchingSubscriptions(report: AgentReport): Promise<QueryResult<AgentReportSubscription[]>> {
  if (!hasSupabaseServiceConfig()) return { data: [], error: null, isDemo: true };
  const supabase = createSupabaseServiceClient();
  let query = supabase
    .from("agent_report_subscriptions")
    .select("*")
    .eq("report_definition_code", report.report_definition_code)
    .eq("scope_type", report.scope_type)
    .eq("enabled", true);

  query = report.scope_id ? query.eq("scope_id", report.scope_id) : query.is("scope_id", null);

  const { data, error } = await query;
  if (error) return { data: [], error: error.message, isDemo: false };
  return {
    data: ((data ?? []) as AgentReportSubscription[]).map(normalizeSubscriptionRow).filter((subscription) => subscriptionMatchesReport(report, subscription)),
    error: null,
    isDemo: false,
  };
}

async function upsertReportRecipient(input: {
  reportId: string;
  subscription: AgentReportSubscription;
}): Promise<QueryResult<AgentReportRecipient>> {
  if (!hasSupabaseServiceConfig()) {
    return createReportRecipient(input);
  }

  const supabase = createSupabaseServiceClient();
  let query = supabase
    .from("agent_report_recipients")
    .select("*")
    .eq("report_id", input.reportId)
    .eq("delivery_channel", input.subscription.recipient_type);

  if (input.subscription.app_user_id) {
    query = query.eq("app_user_id", input.subscription.app_user_id);
  } else {
    query = query.is("app_user_id", null);
  }
  if (input.subscription.feishu_user_id) {
    query = query.eq("feishu_user_id", input.subscription.feishu_user_id);
  } else {
    query = query.is("feishu_user_id", null);
  }
  if (input.subscription.feishu_chat_id) {
    query = query.eq("feishu_chat_id", input.subscription.feishu_chat_id);
  } else {
    query = query.is("feishu_chat_id", null);
  }

  const existing = await query.maybeSingle();
  if (existing.error) return { data: null as never, error: existing.error.message, isDemo: false };

  const payload = {
    ...buildRecipientPayload(input),
    feishu_message_id: null,
    sent_at: null,
    error_message: null,
    updated_at: new Date().toISOString(),
  };

  if (existing.data) {
    const { data, error } = await supabase
      .from("agent_report_recipients")
      .update(payload)
      .eq("id", existing.data.id)
      .select("*")
      .single();
    if (error) return { data: null as never, error: error.message, isDemo: false };
    return { data: data as AgentReportRecipient, error: null, isDemo: false };
  }

  return createReportRecipient(input);
}

async function pruneStaleRecipientsForReport(input: {
  reportId: string;
  subscriptions: AgentReportSubscription[];
}): Promise<QueryResult<{ deletedCount: number }>> {
  if (!hasSupabaseServiceConfig()) return { data: { deletedCount: 0 }, error: null, isDemo: true };

  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("agent_report_recipients")
    .select("*")
    .eq("report_id", input.reportId)
    .in("send_status", ["pending", "failed"]);

  if (error) return { data: { deletedCount: 0 }, error: error.message, isDemo: false };

  const staleRecipientIds = ((data ?? []) as AgentReportRecipient[])
    .filter((recipient) => !input.subscriptions.some((subscription) =>
      subscription.recipient_type === recipient.delivery_channel
      && (subscription.app_user_id ?? null) === (recipient.app_user_id ?? null)
      && (subscription.feishu_user_id ?? null) === (recipient.feishu_user_id ?? null)
      && (subscription.feishu_chat_id ?? null) === (recipient.feishu_chat_id ?? null),
    ))
    .map((recipient) => recipient.id);

  if (staleRecipientIds.length === 0) return { data: { deletedCount: 0 }, error: null, isDemo: false };

  const { error: deleteError } = await supabase
    .from("agent_report_recipients")
    .delete()
    .in("id", staleRecipientIds);

  if (deleteError) return { data: { deletedCount: 0 }, error: deleteError.message, isDemo: false };
  return { data: { deletedCount: staleRecipientIds.length }, error: null, isDemo: false };
}

export async function generateReportFromSubscription(input: ReplayInput): Promise<QueryResult<{ report: AgentReport | null; recipient: AgentReportRecipient | null }>> {
  const subscriptionResult = await getAgentReportSubscriptionById(input.subscriptionId);
  if (subscriptionResult.error) return { data: { report: null, recipient: null }, error: subscriptionResult.error, isDemo: subscriptionResult.isDemo };
  if (!subscriptionResult.data) return { data: { report: null, recipient: null }, error: "Subscription not found", isDemo: subscriptionResult.isDemo };

  const subscription = subscriptionResult.data;
  const reportResult = await generateAgentReport({
    reportDefinitionCode: subscription.report_definition_code,
    periodAnchor: input.periodAnchor,
    scopeType: subscription.scope_type,
    scopeId: subscription.scope_id ?? null,
    force: input.force,
  });
  if (reportResult.error || !reportResult.data) {
    return { data: { report: reportResult.data ?? null, recipient: null }, error: reportResult.error ?? "Failed to generate report", isDemo: reportResult.isDemo };
  }

  const recipientResult = await upsertReportRecipient({
    reportId: reportResult.data.id,
    subscription,
  });

  return {
    data: {
      report: reportResult.data,
      recipient: recipientResult.data,
    },
    error: recipientResult.error,
    isDemo: reportResult.isDemo || recipientResult.isDemo,
  };
}

export async function redeliverAgentReport(input: RedeliverInput): Promise<QueryResult<AgentReportRecipient[]>> {
  const subscriptionsResult = await listMatchingSubscriptions(input.report);
  if (subscriptionsResult.error) return { data: [], error: subscriptionsResult.error, isDemo: subscriptionsResult.isDemo };

  const pruneResult = await pruneStaleRecipientsForReport({
    reportId: input.report.id,
    subscriptions: subscriptionsResult.data,
  });
  if (pruneResult.error) return { data: [], error: pruneResult.error, isDemo: pruneResult.isDemo };

  const recipients: AgentReportRecipient[] = [];
  let firstError: string | null = null;
  for (const subscription of subscriptionsResult.data) {
    const recipientResult = await upsertReportRecipient({
      reportId: input.report.id,
      subscription,
    });
    if (recipientResult.error && !firstError) firstError = recipientResult.error;
    if (recipientResult.data) recipients.push(recipientResult.data);
  }
  return { data: recipients, error: firstError, isDemo: subscriptionsResult.isDemo };
}

export async function retryFailedAgentReport(input: RetryFailedInput): Promise<QueryResult<AgentReportRecipient[]>> {
  if (!hasSupabaseServiceConfig()) return { data: [], error: null, isDemo: true };

  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("agent_report_recipients")
    .select("*")
    .eq("report_id", input.report.id)
    .eq("send_status", "failed");

  if (error) return { data: [], error: error.message, isDemo: false };

  const failedRecipients = (data ?? []) as AgentReportRecipient[];
  const retried: AgentReportRecipient[] = [];
  let firstError: string | null = null;

  for (const recipient of failedRecipients) {
    const { data: updated, error: updateError } = await supabase
      .from("agent_report_recipients")
      .update({
        send_status: "pending",
        feishu_message_id: null,
        sent_at: null,
        error_message: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", recipient.id)
      .select("*")
      .single();

    if (updateError) {
      if (!firstError) firstError = updateError.message;
      continue;
    }
    retried.push(updated as AgentReportRecipient);
  }

  return { data: retried, error: firstError, isDemo: false };
}

export async function dispatchDueAgentReports(input: DispatchDueSubscriptionsInput = {}): Promise<QueryResult<Array<{
  subscription_id: string;
  period_anchor: string;
  report_id: string | null;
  recipient_id: string | null;
  error: string | null;
}>>> {
  const runAt = input.runAt ?? new Date();
  const subscriptionsResult = await listAgentReportSubscriptions({ enabled: true, limit: 500 });
  if (subscriptionsResult.error) return { data: [], error: subscriptionsResult.error, isDemo: subscriptionsResult.isDemo };

  const dueSubscriptions = subscriptionsResult.data.filter((subscription) => subscriptionIsDueAt(subscription, runAt));
  const jobs: Array<{
    subscription_id: string;
    period_anchor: string;
    report_id: string | null;
    recipient_id: string | null;
    error: string | null;
  }> = [];
  let firstError: string | null = null;

  for (const subscription of dueSubscriptions) {
    const periodAnchor = resolveSubscriptionPeriodAnchor(subscription, runAt);
    const result = await generateReportFromSubscription({
      subscriptionId: subscription.id,
      periodAnchor,
      force: input.force,
    });
    if (result.error && !firstError) firstError = result.error;
    jobs.push({
      subscription_id: subscription.id,
      period_anchor: periodAnchor,
      report_id: result.data.report?.id ?? null,
      recipient_id: result.data.recipient?.id ?? null,
      error: result.error,
    });
  }

  return { data: jobs, error: firstError, isDemo: subscriptionsResult.isDemo };
}

export { JAKARTA_TIMEZONE };

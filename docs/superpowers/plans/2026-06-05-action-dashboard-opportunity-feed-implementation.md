# Action Dashboard Opportunity Feed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the dashboard as a boss-facing "Today Priority Actions" view and rebuild the opportunity feed as an operating queue.

**Architecture:** Add a derived `OpportunityAction` layer from existing promo feed, dashboard matrix, and AI price candidate data. The dashboard consumes the top 3 actions plus summary modules; the opportunity feed consumes the full action queue with status tabs, filters, impact-first sorting, and task cards. No database migration is required in this iteration.

**Tech Stack:** Next.js App Router 16.2.6, React Server Components, TypeScript, Tailwind CSS, Node test runner smoke tests, existing Supabase/demo-data fallback layer.

---

## File Structure

- Modify `src/lib/types.ts`
  - Add `OpportunityActionType`, `OpportunityActionStatus`, and `OpportunityAction`.

- Modify `src/lib/data.ts`
  - Add `getOpportunityActions(locale?: string)`.
  - Add pure helpers near dashboard/feed helpers:
    - `buildOpportunityActions`
    - `scoreOpportunityAction`
    - `dedupeOpportunityActions`
    - `actionSeverityRank`
  - Keep this as a derived layer; do not add a DB migration.

- Modify `src/components/ui.tsx`
  - Keep existing primitives.
  - Add only tiny primitives if needed, such as a `ProgressBar`, after a failing test or concrete UI need.

- Create `src/components/opportunity-actions.tsx`
  - Shared display components:
    - `PriorityActionCard`
    - `OpportunityTaskCard`
    - `OpportunityQueueTabs`
    - `ActionMeta`
    - label helpers for action type/status/CTA.

- Modify `src/app/[locale]/dashboard/page.tsx`
  - Fetch `getOpportunityActions(locale)`.
  - Add "今日优先动作 / Today Priority Actions" first.
  - Replace broad KPI spread with 4 operating KPIs.
  - Add capture-to-action funnel and battle summary before matrices.
  - Move matrices and diagnostics below the action story.

- Modify `src/app/[locale]/promo-events/page.tsx`
  - Replace raw event-card list with action queue task cards.
  - Keep city/channel/category/brand/severity filters.
  - Add `status` filter and queue tabs.
  - Sort by `priorityScore` descending by default.

- Modify `tests/demo-scope.test.mjs`
  - Keep existing demo/nav tests.
  - Add smoke coverage for action dashboard and operating queue shape.

---

### Task 1: Add Product-Shape Smoke Tests

**Files:**
- Modify: `tests/demo-scope.test.mjs`

- [ ] **Step 1: Write failing tests for action dashboard and operating queue**

Append these tests to `tests/demo-scope.test.mjs`:

```js
const typesFile = readFileSync("src/lib/types.ts", "utf8");
const dataFile = readFileSync("src/lib/data.ts", "utf8");
const promoEventsPage = readFileSync("src/app/[locale]/promo-events/page.tsx", "utf8");

test("dashboard is shaped around today priority actions", () => {
  assert.match(dashboardPage, /今日优先动作|Today Priority Actions/);
  assert.match(dashboardPage, /PriorityActionCard/);
  assert.match(dashboardPage, /CaptureActionFunnel/);
  assert.match(dashboardPage, /BattleSummary/);

  const actionIndex = dashboardPage.search(/今日优先动作|Today Priority Actions/);
  const matrixIndex = dashboardPage.search(/Category x Offline Channel Promo Matrix|品类 x 线下渠道促销矩阵/);
  assert.ok(actionIndex >= 0, "priority action section should exist");
  assert.ok(matrixIndex < 0 || actionIndex < matrixIndex, "priority actions should appear before matrix diagnostics");
});

test("opportunity feed is shaped as an operating queue", () => {
  assert.match(typesFile, /export type OpportunityAction/);
  assert.match(dataFile, /export async function getOpportunityActions/);
  assert.match(promoEventsPage, /OpportunityQueueTabs/);
  assert.match(promoEventsPage, /OpportunityTaskCard/);
  assert.match(promoEventsPage, /pending_review|capture_needed|completed/);
});
```

- [ ] **Step 2: Run the smoke test and verify it fails for the new behavior**

Run:

```powershell
node --test tests/demo-scope.test.mjs
```

Expected: `mobile screens keep access to the board navigation` still passes, and the new tests fail because `OpportunityAction`, `getOpportunityActions`, `PriorityActionCard`, `OpportunityQueueTabs`, and the new section labels do not exist yet.

- [ ] **Step 3: Commit only if this task is implemented in isolation**

If committing per task, run:

```powershell
git add tests/demo-scope.test.mjs
git commit -m "test: lock action dashboard product shape"
```

Expected: commit contains only `tests/demo-scope.test.mjs`.

---

### Task 2: Add Derived Opportunity Action Data Layer

**Files:**
- Modify: `src/lib/types.ts`
- Modify: `src/lib/data.ts`
- Test: `tests/demo-scope.test.mjs`

- [ ] **Step 1: Add action types**

In `src/lib/types.ts`, after `DashboardCategoryChannelMatrix`, add:

```ts
export type OpportunityActionType =
  | "review_price"
  | "capture_evidence"
  | "inspect_promo"
  | "defend_city"
  | "expand_channel";

export type OpportunityActionStatus =
  | "open"
  | "pending_review"
  | "capture_needed"
  | "completed";

export type OpportunityAction = {
  id: string;
  type: OpportunityActionType;
  status: OpportunityActionStatus;
  title: string;
  reason: string;
  evidence: string;
  priorityScore: number;
  severity: Severity | null;
  city: string | null;
  channelCode: string | null;
  category: string | null;
  brandName: string | null;
  productName: string | null;
  href: string;
  sourceIds: string[];
};
```

- [ ] **Step 2: Import the new type in data layer**

In the `src/lib/data.ts` type import block, add:

```ts
  OpportunityAction,
```

- [ ] **Step 3: Add `getOpportunityActions`**

In `src/lib/data.ts`, after `getDashboardCategoryChannelMatrix`, add:

```ts
export async function getOpportunityActions(locale = "zh"): Promise<QueryResult<OpportunityAction[]>> {
  const [matrixResult, feedResult, candidatesResult] = await Promise.all([
    getDashboardCategoryChannelMatrix(locale),
    getPromoEventFeed(),
    getAiPriceCandidates({ limit: 5000 }),
  ]);

  const actions = buildOpportunityActions({
    locale,
    matrix: matrixResult.data,
    feed: feedResult.data,
    candidates: candidatesResult.data,
  });

  return {
    data: actions,
    error: matrixResult.error ?? feedResult.error ?? candidatesResult.error,
    isDemo: matrixResult.isDemo || feedResult.isDemo || candidatesResult.isDemo,
  };
}
```

- [ ] **Step 4: Add the action builder helpers**

In `src/lib/data.ts`, after `candidatePriceAccuracy`, add:

```ts
function buildOpportunityActions(input: {
  locale: string;
  matrix: DashboardCategoryChannelMatrix;
  feed: PromoEventFeedItem[];
  candidates: AiPriceCandidate[];
}): OpportunityAction[] {
  const isZh = input.locale === "zh";
  const actions: OpportunityAction[] = [];
  const pendingCandidates = input.candidates.filter((candidate) => candidate.status === "pending");

  if (pendingCandidates.length > 0) {
    actions.push({
      id: "action-review-pending-prices",
      type: "review_price",
      status: "pending_review",
      title: isZh ? `复核 ${pendingCandidates.length} 条 AI 价格候选` : `Review ${pendingCandidates.length} AI price candidates`,
      reason: isZh ? "价格候选未审批会阻断价格真值沉淀和后续机会判断。" : "Unreviewed price candidates block the truth source for later opportunity decisions.",
      evidence: isZh
        ? `${input.matrix.collection.aiCandidateCount} 条候选，${input.matrix.collection.approvedCandidateCount} 条已审批`
        : `${input.matrix.collection.aiCandidateCount} candidates, ${input.matrix.collection.approvedCandidateCount} approved`,
      priorityScore: 0,
      severity: pendingCandidates.length >= 100 ? "high" : "medium",
      city: null,
      channelCode: null,
      category: null,
      brandName: null,
      productName: null,
      href: `/${input.locale}/offline-price-candidates?status=pending`,
      sourceIds: pendingCandidates.slice(0, 20).map((candidate) => candidate.id),
    });
  }

  for (const city of input.matrix.battleMapCities) {
    if (city.shareSampleCount === 0 && city.storeCount > 0) {
      actions.push({
        id: `action-capture-${slugKey(city.city)}`,
        type: "capture_evidence",
        status: "capture_needed",
        title: isZh ? `补采 ${city.city} 货架证据` : `Capture shelf evidence in ${city.city}`,
        reason: isZh ? "已有门店覆盖但缺少 Makuku 货架份额样本，无法判断是否占领。" : "Stores are covered but Makuku shelf share evidence is missing.",
        evidence: isZh ? `${city.storeCount} 家门店，${city.promoCount} 条促销信号` : `${city.storeCount} stores, ${city.promoCount} promo signals`,
        priorityScore: 0,
        severity: city.maxSeverity ?? (city.promoCount > 0 ? "medium" : "low"),
        city: city.city,
        channelCode: null,
        category: null,
        brandName: null,
        productName: null,
        href: city.href,
        sourceIds: [`city:${city.city}`],
      });
    }

    if (!city.captured && city.promoCount > 0) {
      actions.push({
        id: `action-defend-${slugKey(city.city)}`,
        type: "defend_city",
        status: "open",
        title: isZh ? `防守 ${city.city} 竞品促销压力` : `Defend ${city.city} promo pressure`,
        reason: isZh ? "竞品促销已经出现，但 Makuku 尚未达到占领阈值。" : "Competitor promos are active before Makuku reaches the captured threshold.",
        evidence: isZh
          ? `${city.promoCount} 条促销，最高折扣 ${city.maxDiscountRate?.toFixed(1) ?? "-"}%`
          : `${city.promoCount} promos, max discount ${city.maxDiscountRate?.toFixed(1) ?? "-"}%`,
        priorityScore: 0,
        severity: city.maxSeverity ?? (city.promoCount >= 3 ? "high" : "medium"),
        city: city.city,
        channelCode: null,
        category: null,
        brandName: null,
        productName: null,
        href: city.href,
        sourceIds: [`city:${city.city}`],
      });
    }
  }

  const highImpactEvents = input.feed
    .filter((event) => event.severity === "critical" || event.severity === "high" || (event.discountRate ?? 0) >= 25)
    .slice(0, 8);

  for (const event of highImpactEvents) {
    actions.push({
      id: `action-event-${event.id}`,
      type: "inspect_promo",
      status: event.status === "pending_review" ? "pending_review" : "open",
      title: isZh ? `复核 ${event.city ?? "未知城市"} ${event.brandName ?? "竞品"} 促销` : `Inspect ${event.brandName ?? "competitor"} promo in ${event.city ?? "unknown city"}`,
      reason: isZh ? "高风险或高折扣促销会直接影响终端价格判断。" : "High-risk or high-discount promos can change terminal price decisions.",
      evidence: [event.storeName, event.category, event.discountLabel].filter(Boolean).join(" / "),
      priorityScore: 0,
      severity: event.severity ?? "medium",
      city: event.city,
      channelCode: event.channelCode,
      category: event.category,
      brandName: event.brandName,
      productName: event.productName,
      href: event.detailHref ? `/${input.locale}${event.detailHref}` : `/${input.locale}/promo-events?city=${encodeURIComponent(event.city ?? "")}`,
      sourceIds: [event.id],
    });
  }

  const expandCells = input.matrix.rows
    .flatMap((row) => row.cells
      .filter((cell) => cell.signalType === "opportunity")
      .map((cell) => ({ row, cell })))
    .slice(0, 6);

  for (const { row, cell } of expandCells) {
    actions.push({
      id: `action-expand-${slugKey(row.category)}-${slugKey(cell.channelCode)}`,
      type: "expand_channel",
      status: "open",
      title: isZh ? `${row.category} 可扩展到 ${cell.channelCode}` : `${row.category} can expand into ${cell.channelCode}`,
      reason: isZh ? "该品类已有促销信号，但这个渠道仍是空白机会。" : "This category has promo signals, while this channel remains whitespace.",
      evidence: isZh ? `品类总促销 ${row.totalPromoCount} 条` : `${row.totalPromoCount} category promo signals`,
      priorityScore: 0,
      severity: "low",
      city: null,
      channelCode: cell.channelCode,
      category: row.category,
      brandName: null,
      productName: null,
      href: cell.href,
      sourceIds: [`category:${row.category}`, `channel:${cell.channelCode}`],
    });
  }

  return dedupeOpportunityActions(actions)
    .map((action) => ({ ...action, priorityScore: scoreOpportunityAction(action) }))
    .sort((a, b) => b.priorityScore - a.priorityScore)
    .slice(0, 40);
}

function scoreOpportunityAction(action: OpportunityAction) {
  const severityScore = actionSeverityRank(action.severity) * 20;
  const typeScore: Record<OpportunityActionType, number> = {
    defend_city: 35,
    review_price: 30,
    inspect_promo: 25,
    capture_evidence: 22,
    expand_channel: 12,
  };
  const statusScore: Record<OpportunityActionStatus, number> = {
    pending_review: 20,
    capture_needed: 18,
    open: 10,
    completed: -100,
  };
  return severityScore + typeScore[action.type] + statusScore[action.status];
}

function actionSeverityRank(severity: Severity | null) {
  if (severity === "critical") return 4;
  if (severity === "high") return 3;
  if (severity === "medium") return 2;
  if (severity === "low") return 1;
  return 0;
}

function dedupeOpportunityActions(actions: OpportunityAction[]) {
  const seen = new Set<string>();
  return actions.filter((action) => {
    if (seen.has(action.id)) return false;
    seen.add(action.id);
    return true;
  });
}

function slugKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "unknown";
}
```

- [ ] **Step 5: Run the smoke test**

Run:

```powershell
node --test tests/demo-scope.test.mjs
```

Expected: action type/data assertions pass, dashboard and promo page assertions still fail until UI tasks are done.

- [ ] **Step 6: Run TypeScript build check**

Run:

```powershell
npm run build
```

Expected: TypeScript compiles. If `OpportunityActionType` is needed at runtime, change the import to a normal type import in `data.ts`.

- [ ] **Step 7: Commit only if this task is implemented in isolation**

```powershell
git add src/lib/types.ts src/lib/data.ts tests/demo-scope.test.mjs
git commit -m "feat: derive opportunity actions"
```

Expected: commit contains only the action data layer and related test updates.

---

### Task 3: Add Shared Action Components

**Files:**
- Create: `src/components/opportunity-actions.tsx`
- Modify: `tests/demo-scope.test.mjs`

- [ ] **Step 1: Create shared components**

Create `src/components/opportunity-actions.tsx`:

```tsx
import Link from "next/link";
import { ArrowRight, CheckCircle2, ClipboardCheck, Crosshair, Search, ShieldAlert, Store } from "lucide-react";
import { Badge, Card } from "@/components/ui";
import type { OpportunityAction, OpportunityActionStatus, OpportunityActionType } from "@/lib/types";

const typeIcons = {
  review_price: ClipboardCheck,
  capture_evidence: Store,
  inspect_promo: Search,
  defend_city: ShieldAlert,
  expand_channel: Crosshair,
} satisfies Record<OpportunityActionType, typeof ArrowRight>;

export function PriorityActionCard({ action, locale }: { action: OpportunityAction; locale: string }) {
  const Icon = typeIcons[action.type];
  return (
    <Link href={action.href} className="block">
      <Card className="h-full border-slate-300 hover:border-slate-500">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-slate-950 text-white">
              <Icon className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={action.severity ?? "neutral"}>{action.severity ?? actionStatusLabel(action.status, locale)}</Badge>
                <span className="text-xs font-medium text-slate-500">{actionTypeLabel(action.type, locale)}</span>
              </div>
              <h2 className="mt-2 text-base font-semibold leading-6 text-slate-950">{action.title}</h2>
            </div>
          </div>
          <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-slate-400" />
        </div>
        <p className="mt-3 text-sm leading-5 text-slate-600">{action.reason}</p>
        <div className="mt-3 rounded-md bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600">{action.evidence}</div>
        <div className="mt-3 text-sm font-medium text-slate-900">{actionCtaLabel(action.type, locale)}</div>
      </Card>
    </Link>
  );
}

export function OpportunityTaskCard({ action, locale }: { action: OpportunityAction; locale: string }) {
  const Icon = typeIcons[action.type];
  return (
    <Link href={action.href} className="block">
      <Card className="hover:border-slate-300">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px] lg:items-start">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={action.severity ?? "neutral"}>{action.severity ?? actionStatusLabel(action.status, locale)}</Badge>
              <Badge>{actionStatusLabel(action.status, locale)}</Badge>
              <span className="text-xs font-medium text-slate-500">{actionTypeLabel(action.type, locale)}</span>
            </div>
            <div className="mt-3 flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-700">
                <Icon className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <h2 className="break-words font-semibold text-slate-950">{action.title}</h2>
                <p className="mt-2 text-sm leading-5 text-slate-600">{action.reason}</p>
              </div>
            </div>
            <div className="mt-3 rounded-md bg-slate-50 px-3 py-2 text-sm leading-5 text-slate-600">
              <span className="font-medium text-slate-900">{locale === "zh" ? "证据：" : "Evidence: "}</span>
              {action.evidence}
            </div>
          </div>
          <div className="rounded-md border border-slate-200 px-3 py-3 text-sm">
            <ActionMeta label={locale === "zh" ? "城市" : "City"} value={action.city ?? "-"} />
            <ActionMeta label={locale === "zh" ? "渠道" : "Channel"} value={action.channelCode ?? "-"} />
            <ActionMeta label={locale === "zh" ? "品类" : "Category"} value={action.category ?? "-"} />
            <ActionMeta label={locale === "zh" ? "优先分" : "Priority"} value={String(action.priorityScore)} />
            <div className="mt-3 flex items-center justify-center rounded-md bg-slate-950 px-3 py-2 text-sm font-medium text-white">
              {actionCtaLabel(action.type, locale)}
            </div>
          </div>
        </div>
      </Card>
    </Link>
  );
}

export function OpportunityQueueTabs({
  locale,
  currentStatus,
  baseHref,
  counts,
}: {
  locale: string;
  currentStatus: string;
  baseHref: string;
  counts: Record<"all" | OpportunityActionStatus, number>;
}) {
  const tabs: Array<{ value: "all" | OpportunityActionStatus; label: string }> = [
    { value: "all", label: locale === "zh" ? "全部" : "All" },
    { value: "open", label: locale === "zh" ? "高风险" : "High risk" },
    { value: "pending_review", label: locale === "zh" ? "待复核" : "Pending review" },
    { value: "capture_needed", label: locale === "zh" ? "补采" : "Capture gaps" },
    { value: "completed", label: locale === "zh" ? "已完成" : "Completed" },
  ];

  return (
    <div className="mb-4 flex gap-2 overflow-x-auto">
      {tabs.map((tab) => {
        const active = currentStatus === tab.value || (!currentStatus && tab.value === "all");
        const href = tab.value === "all" ? baseHref : `${baseHref}?status=${tab.value}`;
        return (
          <Link
            key={tab.value}
            href={href}
            className={active
              ? "whitespace-nowrap rounded-md bg-slate-950 px-3 py-2 text-sm font-medium text-white"
              : "whitespace-nowrap rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"}
          >
            {tab.label} <span className="ml-1 opacity-75">{counts[tab.value]}</span>
          </Link>
        );
      })}
    </div>
  );
}

function ActionMeta({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-100 py-1.5 last:border-b-0">
      <span className="text-slate-500">{label}</span>
      <span className="truncate font-medium text-slate-900">{value}</span>
    </div>
  );
}

function actionTypeLabel(type: OpportunityActionType, locale: string) {
  const labels: Record<OpportunityActionType, { zh: string; en: string }> = {
    review_price: { zh: "价格复核", en: "Price review" },
    capture_evidence: { zh: "补采证据", en: "Capture evidence" },
    inspect_promo: { zh: "促销复核", en: "Promo review" },
    defend_city: { zh: "城市防守", en: "City defense" },
    expand_channel: { zh: "渠道扩展", en: "Channel expansion" },
  };
  return labels[type][locale === "zh" ? "zh" : "en"];
}

function actionStatusLabel(status: OpportunityActionStatus, locale: string) {
  const labels: Record<OpportunityActionStatus, { zh: string; en: string }> = {
    open: { zh: "待处理", en: "Open" },
    pending_review: { zh: "待复核", en: "Pending review" },
    capture_needed: { zh: "待补采", en: "Capture needed" },
    completed: { zh: "已完成", en: "Completed" },
  };
  return labels[status][locale === "zh" ? "zh" : "en"];
}

function actionCtaLabel(type: OpportunityActionType, locale: string) {
  const labels: Record<OpportunityActionType, { zh: string; en: string }> = {
    review_price: { zh: "去复核价格", en: "Review prices" },
    capture_evidence: { zh: "去补采证据", en: "Capture evidence" },
    inspect_promo: { zh: "查看促销证据", en: "Inspect promo" },
    defend_city: { zh: "查看城市机会", en: "View city actions" },
    expand_channel: { zh: "查看渠道机会", en: "View channel gap" },
  };
  return labels[type][locale === "zh" ? "zh" : "en"];
}
```

- [ ] **Step 2: Run lint to catch component import/type issues**

Run:

```powershell
npm run lint
```

Expected: lint passes. If `satisfies Record<OpportunityActionType, typeof ArrowRight>` is too strict for lucide icon types, replace it with:

```ts
const typeIcons: Record<OpportunityActionType, React.ComponentType<{ className?: string }>> = {
  review_price: ClipboardCheck,
  capture_evidence: Store,
  inspect_promo: Search,
  defend_city: ShieldAlert,
  expand_channel: Crosshair,
};
```

- [ ] **Step 3: Commit only if this task is implemented in isolation**

```powershell
git add src/components/opportunity-actions.tsx
git commit -m "feat: add opportunity action cards"
```

Expected: commit contains only the shared action components.

---

### Task 4: Rebuild Dashboard Module Order

**Files:**
- Modify: `src/app/[locale]/dashboard/page.tsx`
- Test: `tests/demo-scope.test.mjs`

- [ ] **Step 1: Import actions and shared cards**

In `src/app/[locale]/dashboard/page.tsx`, update imports:

```ts
import { PriorityActionCard } from "@/components/opportunity-actions";
import { getDashboardCategoryChannelMatrix, getOpportunityActions } from "@/lib/data";
import type { OpportunityAction } from "@/lib/types";
```

Keep existing type imports and include `OpportunityAction` if using helper props.

- [ ] **Step 2: Fetch action data with the dashboard matrix**

Inside `DashboardPage`, replace:

```ts
const matrixResult = await getDashboardCategoryChannelMatrix(locale);
```

with:

```ts
const [matrixResult, actionsResult] = await Promise.all([
  getDashboardCategoryChannelMatrix(locale),
  getOpportunityActions(locale),
]);
```

Pass combined errors into `DataNotice`:

```tsx
<DataNotice dict={dict} error={matrixResult.error ?? actionsResult.error} />
```

- [ ] **Step 3: Add Today Priority Actions first**

After `DataNotice`, render:

```tsx
<section className="mb-5">
  <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
    <div>
      <div className="text-xs font-medium uppercase tracking-normal text-emerald-700">
        {isZh ? "7天样板目标" : "7-day pilot objective"}
      </div>
      <h2 className="mt-1 text-2xl font-semibold tracking-normal text-slate-950">
        {isZh ? "今日优先动作" : "Today Priority Actions"}
      </h2>
      <p className="mt-1 text-sm leading-6 text-slate-600">
        {isZh
          ? "先处理最影响终端增长闭环的 3 件事：价格真值、补采证据、竞品促销压力。"
          : "Start with the 3 actions that most affect the terminal growth loop: price truth, evidence capture, and competitor promo pressure."}
      </p>
    </div>
    <Link href={`/${locale}/promo-events`} className="text-sm font-medium text-slate-700 hover:underline">
      {isZh ? "进入机会处理台" : "Open operating queue"}
    </Link>
  </div>
  {actionsResult.data.length === 0 ? (
    <Card>
      <div className="text-sm text-slate-500">
        {isZh ? "暂无优先动作，先完成门店采集或价格复核。" : "No priority actions yet. Complete store capture or price review first."}
      </div>
    </Card>
  ) : (
    <div className="grid gap-4 lg:grid-cols-3">
      {actionsResult.data.slice(0, 3).map((action) => (
        <PriorityActionCard key={action.id} action={action} locale={locale} />
      ))}
    </div>
  )}
</section>
```

- [ ] **Step 4: Replace KPI spread with four operating KPIs**

Replace the current 4+3 metric cards with:

```tsx
<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
  <MetricCard label={isZh ? "高风险动作" : "High-risk Actions"} value={actionsResult.data.filter((action) => action.severity === "critical" || action.severity === "high").length} hint={isZh ? "按影响优先排序" : "Sorted by impact"} />
  <MetricCard label={isZh ? "待复核价格" : "Pending Prices"} value={matrix.collection.pendingCandidateCount} hint={isZh ? `${matrix.collection.aiCandidateCount} 条 AI 候选` : `${matrix.collection.aiCandidateCount} AI candidates`} />
  <MetricCard label={isZh ? "补采缺口" : "Capture Gaps"} value={actionsResult.data.filter((action) => action.status === "capture_needed").length} hint={isZh ? "缺少证据的门店/城市" : "Missing store or city evidence"} />
  <MetricCard label={isZh ? "AI 价格准确率" : "AI Price Accuracy"} value={formatPercent(matrix.collection.approvedAccuracy)} hint={isZh ? `${matrix.collection.approvedCandidateCount} 条已审批` : `${matrix.collection.approvedCandidateCount} approved`} />
</div>
```

- [ ] **Step 5: Add capture funnel and battle summary before diagnostics**

Add helper components at the bottom of `dashboard/page.tsx`:

```tsx
function CaptureActionFunnel({ matrix, actionCount, isZh }: { matrix: Awaited<ReturnType<typeof getDashboardCategoryChannelMatrix>>["data"]; actionCount: number; isZh: boolean }) {
  const steps = [
    { label: isZh ? "门店照片" : "Store photos", value: matrix.collection.weekVisitCount },
    { label: isZh ? "AI 候选价" : "AI candidates", value: matrix.collection.aiCandidateCount },
    { label: isZh ? "人工复核" : "Reviewed", value: matrix.collection.approvedCandidateCount },
    { label: isZh ? "优先动作" : "Priority actions", value: actionCount },
  ];
  return (
    <Card className="mt-4">
      <div className="mb-4">
        <h2 className="font-semibold">{isZh ? "采集到行动漏斗" : "Capture-to-Action Funnel"}</h2>
        <p className="mt-1 text-sm text-slate-500">{isZh ? "确认门店照片是否真的变成价格真值和机会动作。" : "Check whether store photos are turning into price truth and actions."}</p>
      </div>
      <div className="grid gap-3 md:grid-cols-4">
        {steps.map((step, index) => (
          <div key={step.label} className="rounded-md border border-slate-200 px-3 py-3">
            <div className="text-xs font-medium text-slate-500">{index + 1}. {step.label}</div>
            <div className="mt-2 text-2xl font-semibold text-slate-950">{step.value}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function BattleSummary({ actions, cities, isZh }: { actions: OpportunityAction[]; cities: DashboardBattleMapCity[]; isZh: boolean }) {
  const topCities = cities.slice(0, 3);
  return (
    <Card className="mt-4">
      <div className="mb-4">
        <h2 className="font-semibold">{isZh ? "战区摘要" : "Battle Summary"}</h2>
        <p className="mt-1 text-sm text-slate-500">{isZh ? "只展示需要老板关注的城市和动作，完整矩阵放到下方诊断区。" : "Show only the cities and actions that need attention; full diagnostics stay below."}</p>
      </div>
      <div className="grid gap-3 lg:grid-cols-3">
        {topCities.map((city) => (
          <Link key={city.city} href={city.href} className="rounded-md border border-slate-200 px-3 py-3 hover:bg-slate-50">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-slate-950">{city.city}</span>
              <Badge tone={city.maxSeverity ?? "neutral"}>{city.captured ? (isZh ? "已占领" : "Captured") : city.competitionLevel}</Badge>
            </div>
            <div className="mt-2 text-sm leading-5 text-slate-600">
              {isZh ? "促销" : "Promos"} {city.promoCount} / {isZh ? "门店" : "Stores"} {city.storeCount} / {isZh ? "份额" : "Share"} {formatShare(city.makukuShareAvg)}
            </div>
          </Link>
        ))}
      </div>
      <div className="mt-3 text-xs text-slate-500">
        {isZh ? `当前共 ${actions.length} 条派生动作` : `${actions.length} derived actions available`}
      </div>
    </Card>
  );
}
```

Render them after KPI cards:

```tsx
<CaptureActionFunnel matrix={matrix} actionCount={actionsResult.data.length} isZh={isZh} />
<BattleSummary actions={actionsResult.data} cities={matrix.battleMapCities} isZh={isZh} />
```

- [ ] **Step 6: Move old matrices into diagnostics**

Wrap the existing `IndonesiaBattleMap`, category matrix, city matrix, `LowAccuracyPanel`, and `AI Insight` sections below a heading:

```tsx
<div className="mt-6">
  <div className="mb-3">
    <h2 className="text-lg font-semibold">{isZh ? "诊断下钻" : "Diagnostics"}</h2>
    <p className="mt-1 text-sm text-slate-500">{isZh ? "用于解释优先动作的来源，不作为首屏主线。" : "Use these views to explain where priority actions come from."}</p>
  </div>
  ...
</div>
```

Keep existing matrix components intact inside this diagnostics area.

- [ ] **Step 7: Run tests**

Run:

```powershell
node --test tests/demo-scope.test.mjs
```

Expected: dashboard action-shape assertions pass; opportunity feed assertions still fail until Task 5.

- [ ] **Step 8: Run lint and build**

Run:

```powershell
npm run lint
npm run build
```

Expected: both pass.

- [ ] **Step 9: Commit only if this task is implemented in isolation**

```powershell
git add src/app/[locale]/dashboard/page.tsx tests/demo-scope.test.mjs
git commit -m "feat: make dashboard action first"
```

Expected: commit contains dashboard UI and test updates only.

---

### Task 5: Rebuild Opportunity Feed As Operating Queue

**Files:**
- Modify: `src/app/[locale]/promo-events/page.tsx`
- Test: `tests/demo-scope.test.mjs`

- [ ] **Step 1: Update imports and search param type**

In `src/app/[locale]/promo-events/page.tsx`, update imports:

```ts
import { OpportunityQueueTabs, OpportunityTaskCard } from "@/components/opportunity-actions";
import { getBrands, getChannels, getOpportunityActions } from "@/lib/data";
import type { OpportunityAction, OpportunityActionStatus } from "@/lib/types";
```

Update `searchParams` type:

```ts
searchParams: Promise<{ severity?: string; channel?: string; brand?: string; city?: string; category?: string; status?: string }>;
```

- [ ] **Step 2: Fetch actions instead of raw feed for the primary list**

Replace the data load:

```ts
const [feedResult, brandsResult, channelsResult] = await Promise.all([getPromoEventFeed(), getBrands(), getChannels()]);
```

with:

```ts
const [actionsResult, brandsResult, channelsResult] = await Promise.all([getOpportunityActions(locale), getBrands(), getChannels()]);
```

Build categories from actions:

```ts
const categories = Array.from(new Set(actionsResult.data.map((action) => action.category).filter(Boolean) as string[])).sort();
const selectedBrand = params.brand ? brandsResult.data.find((brand) => brand.id === params.brand) : null;
```

- [ ] **Step 3: Filter action queue**

Replace `events` filtering with:

```ts
const actions = actionsResult.data.filter((action) => {
  if (params.status && params.status !== "all" && action.status !== params.status) return false;
  if (params.severity && action.severity !== params.severity) return false;
  if (params.channel && action.channelCode !== params.channel) return false;
  if (selectedBrand && action.brandName !== selectedBrand.name) return false;
  if (params.city && action.city !== params.city) return false;
  if (params.category && action.category !== params.category) return false;
  return true;
});
```

- [ ] **Step 4: Add queue counts**

Below filtering, add:

```ts
const counts: Record<"all" | OpportunityActionStatus, number> = {
  all: actionsResult.data.length,
  open: actionsResult.data.filter((action) => action.status === "open").length,
  pending_review: actionsResult.data.filter((action) => action.status === "pending_review").length,
  capture_needed: actionsResult.data.filter((action) => action.status === "capture_needed").length,
  completed: actionsResult.data.filter((action) => action.status === "completed").length,
};
```

- [ ] **Step 5: Render queue tabs and task cards**

Replace the current list area with:

```tsx
<DataNotice dict={dict} error={actionsResult.error ?? brandsResult.error ?? channelsResult.error} />

<OpportunityQueueTabs
  locale={locale}
  currentStatus={params.status ?? "all"}
  baseHref={`/${locale}/promo-events`}
  counts={counts}
/>

<Card className="mb-4">
  <form className="grid gap-3 md:grid-cols-6">
    <SelectInput name="severity" defaultValue={params.severity ?? ""}>
      <option value="">{dict.common.allSeverity}</option>
      <option value="critical">{translateEnum(dict, "severity", "critical")}</option>
      <option value="high">{translateEnum(dict, "severity", "high")}</option>
      <option value="medium">{translateEnum(dict, "severity", "medium")}</option>
      <option value="low">{translateEnum(dict, "severity", "low")}</option>
    </SelectInput>
    <SelectInput name="channel" defaultValue={params.channel ?? ""}>
      <option value="">{dict.common.allChannels}</option>
      {channelsResult.data.filter((channel) => channel.active).map((channel) => (
        <option key={channel.id} value={channel.code}>{channel.name}</option>
      ))}
    </SelectInput>
    <SelectInput name="category" defaultValue={params.category ?? ""}>
      <option value="">{locale === "zh" ? "全部品类" : "All categories"}</option>
      {categories.map((category) => <option key={category} value={category}>{category}</option>)}
    </SelectInput>
    <SelectInput name="brand" defaultValue={params.brand ?? ""}>
      <option value="">{dict.common.allBrands}</option>
      {brandsResult.data.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}
    </SelectInput>
    <TextInput name="city" placeholder={dict.common.city} defaultValue={params.city ?? ""} />
    <Button type="submit">{dict.common.filter}</Button>
  </form>
</Card>

<div className="mb-3 flex items-center justify-between gap-3">
  <div>
    <h2 className="font-semibold">{locale === "zh" ? "机会处理台" : "Operating Queue"}</h2>
    <p className="mt-1 text-sm text-slate-500">
      {locale === "zh" ? "按影响优先排序，每张卡都给出原因、证据和下一步。" : "Sorted by impact, with reason, evidence, and next step on every card."}
    </p>
  </div>
  <div className="text-sm text-slate-500">{actions.length} / {actionsResult.data.length}</div>
</div>

<div className="space-y-3">
  {actions.length === 0 ? <EmptyState text={locale === "zh" ? "暂无优先动作，先完成门店采集或价格复核。" : "No priority actions yet. Complete store capture or price review first."} /> : null}
  {actions.map((action) => <OpportunityTaskCard key={action.id} action={action} locale={locale} />)}
</div>
```

- [ ] **Step 6: Remove unused raw feed card helpers**

Delete from `promo-events/page.tsx` if no longer used:

```ts
import Link from "next/link";
import { getPromoEventFeed } from "@/lib/data";
import type { PromoEventFeedItem } from "@/lib/types";
function PromoFeedCard(...)
function Field(...)
function formatFeedDate(...)
```

- [ ] **Step 7: Run tests**

Run:

```powershell
node --test tests/demo-scope.test.mjs
```

Expected: all smoke tests pass.

- [ ] **Step 8: Run lint and build**

Run:

```powershell
npm run lint
npm run build
```

Expected: both pass.

- [ ] **Step 9: Commit only if this task is implemented in isolation**

```powershell
git add src/app/[locale]/promo-events/page.tsx src/components/opportunity-actions.tsx tests/demo-scope.test.mjs
git commit -m "feat: turn opportunity feed into operating queue"
```

Expected: commit contains opportunity feed UI and shared component updates only.

---

### Task 6: Browser Verification And Production Restart

**Files:**
- No new source files unless verification reveals a bug.

- [ ] **Step 1: Run full verification**

Run:

```powershell
node --test tests/demo-scope.test.mjs
npm run lint
npm run build
```

Expected:

- Node test output shows all tests passing.
- ESLint exits 0.
- Next build exits 0 and lists `/[locale]/dashboard` and `/[locale]/promo-events`.

- [ ] **Step 2: Restart local production service on port 3002**

Run:

```powershell
$listener = (netstat -ano | Select-String ':3002' | Select-String 'LISTENING' | ForEach-Object { ($_ -split '\s+')[-1] } | Select-Object -First 1)
if ($listener) { Stop-Process -Id ([int]$listener) -Force }
Start-Sleep -Seconds 1
Start-Process -FilePath 'npm.cmd' -ArgumentList @('run','start','--','--port','3002') -WorkingDirectory 'C:\Users\29014\Documents\Makuku_new' -WindowStyle Hidden -PassThru
```

Expected: a new `cmd` process starts.

- [ ] **Step 3: Verify HTTP responses**

Run:

```powershell
Invoke-WebRequest -Uri 'http://localhost:3002/zh/dashboard' -UseBasicParsing -TimeoutSec 30 | Select-Object StatusCode,StatusDescription
Invoke-WebRequest -Uri 'http://localhost:3002/zh/promo-events' -UseBasicParsing -TimeoutSec 30 | Select-Object StatusCode,StatusDescription
```

Expected: both return `200 OK`.

- [ ] **Step 4: Verify mobile navigation and priority action visibility**

Run a Playwright smoke check:

```powershell
@'
const { chromium } = require('@playwright/test');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto('http://127.0.0.1:3002/en/dashboard', { waitUntil: 'commit', timeout: 30000 });
  await page.waitForSelector('summary[aria-label="Menu"]', { state: 'visible', timeout: 15000 });
  await page.getByText('Today Priority Actions').waitFor({ state: 'visible', timeout: 15000 });
  await browser.close();
  console.log(JSON.stringify({ ok: true }));
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
'@ | node -
```

Expected: prints `{"ok":true}`.

- [ ] **Step 5: Verify opportunity queue cards render**

Run:

```powershell
@'
const { chromium } = require('@playwright/test');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto('http://127.0.0.1:3002/en/promo-events', { waitUntil: 'commit', timeout: 30000 });
  await page.getByText('Operating Queue').waitFor({ state: 'visible', timeout: 15000 });
  await page.getByText('Evidence:', { exact: false }).waitFor({ state: 'visible', timeout: 15000 });
  await browser.close();
  console.log(JSON.stringify({ ok: true }));
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
'@ | node -
```

Expected: prints `{"ok":true}`.

- [ ] **Step 6: Commit final verified implementation if not already committed by task**

If implementation was done in one batch, run:

```powershell
git add tests/demo-scope.test.mjs src/lib/types.ts src/lib/data.ts src/components/opportunity-actions.tsx src/app/[locale]/dashboard/page.tsx src/app/[locale]/promo-events/page.tsx
git commit -m "feat: add action dashboard operating queue"
```

Expected: commit contains only files related to this redesign. Do not stage unrelated existing modifications unless they are required for this feature and were intentionally touched during execution.

---

## Self-Review

- Spec coverage:
  - Today Priority Actions: Task 4.
  - Four operating KPIs: Task 4.
  - Capture-to-action funnel: Task 4.
  - Battle summary and diagnostics demotion: Task 4.
  - Derived action data model: Task 2.
  - Operating queue tabs, impact sort, task cards, filters: Task 5.
  - Testing and browser verification: Tasks 1 and 6.

- Placeholder scan:
  - No task uses TBD, TODO, "implement later", or vague "add appropriate handling" language.

- Type consistency:
  - `OpportunityAction`, `OpportunityActionType`, and `OpportunityActionStatus` are defined in Task 2 and reused consistently in Tasks 3-5.
  - `getOpportunityActions(locale)` is defined in Task 2 and consumed by dashboard and promo events pages in Tasks 4-5.

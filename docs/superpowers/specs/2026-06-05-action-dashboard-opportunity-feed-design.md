# Action Dashboard and Opportunity Feed Redesign

Date: 2026-06-05

## Context

The project direction is now clear: build a 7-day pilot that proves an AI terminal growth loop for Makuku. The current dashboard and opportunity feed already connect store capture, AI price extraction, review, promo signals, city/channel matrices, and insight generation. However, the product experience still feels too much like a data warehouse view:

- The dashboard spreads many modules across one page: capture metrics, price review metrics, battle map, two large matrices, low-accuracy samples, and AI insights.
- The opportunity feed is mostly a filtered event list sorted by recency.
- The pages do not yet form a strong loop of "today's judgment -> evidence -> next action -> completion".

The approved direction is **B: Boss Action Dashboard**. The dashboard should tell the boss what to do today, and the opportunity feed should become the operating queue that gets those actions handled.

## Goals

1. Make the dashboard answer one question in the first 30 seconds: **What are the top actions today?**
2. Turn the opportunity feed from a raw event stream into a task-like queue with priority, evidence, and next steps.
3. Keep the scope shippable in one week by reusing existing data sources and deriving action items from current feed/matrix/candidate data.
4. Preserve the current 7-day pilot story: priority store photos become AI extraction, human review, opportunity visibility, and action suggestions.

## Non-Goals

- Do not build a full workflow management system with persistent assignees, comments, SLA timers, or complex database tables in this iteration.
- Do not make the dashboard a general BI tool.
- Do not expand the navigation surface again.
- Do not depend on external map assets or a precise GIS layer for this one-week version.

## Design Summary

### Dashboard: Boss Action Dashboard

The dashboard first screen becomes an action-first executive view.

Recommended module order:

1. **Today Priority Actions**
   - The hero section contains 3 action cards.
   - Each card has a short action title, reason, evidence summary, impact/risk label, and a primary link into the opportunity feed.
   - Examples:
     - "Review Greater Jakarta high-discount competitor events"
     - "Capture missing Surabaya Baby Store shelf evidence"
     - "Clear 249 pending AI price candidates"

2. **Four Operating KPIs**
   - High-risk actions
   - Pending price reviews
   - Capture gaps
   - AI price accuracy
   - These replace the current broader KPI spread.

3. **Capture-to-Action Funnel**
   - Show the loop in operational terms:
     - store visits/photos
     - AI candidates
     - approved/rejected reviews
     - generated opportunities
   - This gives the boss confidence that field data is turning into decisions.

4. **Battle Summary**
   - Show top cities, top categories, or top channels only.
   - Keep the city map and matrices as diagnostic drilldowns instead of default primary content.

5. **Diagnostics**
   - Category x channel matrix
   - City x channel matrix
   - low accuracy samples
   - These remain useful, but they move below the action story.

### Opportunity Feed: Operating Queue

The opportunity feed becomes the page where the actions are handled.

Recommended structure:

1. **Queue Tabs**
   - All
   - High risk
   - Pending review
   - Capture gaps
   - Completed

2. **Impact-First Sorting**
   - Default sort should be action priority, not only event date.
   - Priority score is derived from severity, recent activity, discount depth, missing evidence, pending review status, and city/channel importance.

3. **Task Cards**
   - Each card should show:
     - action title
     - why it matters
     - evidence summary
     - city, channel, category, brand, SKU/product
     - status
     - next-step button
   - Example next steps:
     - review price
     - capture evidence
     - inspect event
     - mark completed

4. **Existing Filters**
   - Keep city, channel, category, brand, and severity filters.
   - Add status filtering using derived status values.

## Data Model

Use a derived action model for the first iteration. Avoid a database migration unless implementation later proves it necessary.

Proposed type:

```ts
type OpportunityActionType =
  | "review_price"
  | "capture_evidence"
  | "inspect_promo"
  | "defend_city"
  | "expand_channel";

type OpportunityActionStatus =
  | "open"
  | "pending_review"
  | "capture_needed"
  | "completed";

type OpportunityAction = {
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

Data sources:

- `getPromoEventFeed()`
- `getDashboardCategoryChannelMatrix()`
- `getAiPriceCandidates()`
- existing city/channel/category rollups

Priority scoring should be deterministic and explainable:

- high or critical severity adds priority
- recent 24h signal adds priority
- large discount depth adds priority
- missing shelf share or missing evidence adds priority
- pending AI price review adds priority
- more stores or events in a city/channel adds priority

## Component Plan

Keep components small and reusable:

- `PriorityActionCard`
  - Used on dashboard hero.
  - Displays the top 3 derived actions.

- `OperatingKpiStrip`
  - Replaces broad metric card spread.

- `CaptureActionFunnel`
  - Summarizes capture-to-review-to-action progress.

- `BattleSummary`
  - Shows top city/category/channel summaries.

- `OpportunityTaskCard`
  - Replaces the current promo feed card layout.

- `OpportunityQueueTabs`
  - Provides status-oriented navigation.

## Error Handling

- If Supabase data is unavailable, continue using pilot sample data and show the existing data notice.
- If derived actions are empty, show a focused empty state:
  - Chinese: "暂无优先动作，先完成门店采集或价格复核。"
  - English: "No priority actions yet. Complete store capture or price review first."
- If a derived action has partial metadata, still render the action using available city/channel/source evidence.

## Testing

Add focused smoke tests for the new product shape:

- dashboard contains "今日优先动作" / "Today Priority Actions"
- dashboard no longer defaults to the large matrices before the action section
- opportunity feed contains queue status tabs
- opportunity feed task cards include reason/evidence/next-step language
- hidden demo/mock wording remains absent

Manual/browser verification:

- desktop dashboard first viewport shows priority actions
- mobile dashboard still exposes the nav menu and priority actions
- opportunity feed cards remain readable on narrow screens
- links from priority actions land in filtered opportunity feed views

## Implementation Scope For One Week

Day 1-2:

- Add derived action builder in `src/lib/data.ts`.
- Add types in `src/lib/types.ts`.
- Add smoke tests for page structure and action labels.

Day 3-4:

- Rebuild dashboard module order.
- Add priority action cards, KPI strip, capture funnel, and battle summary.
- Move matrices and low-accuracy samples below the main action story.

Day 5-6:

- Rebuild opportunity feed as an operating queue.
- Add status tabs, impact-first sorting, and task card layout.

Day 7:

- Responsive polish, browser verification, copy cleanup, and final build/lint/test pass.

## Approved Product Choice

The approved default is:

- Dashboard first section title: **今日优先动作 / Today Priority Actions**
- First section contains exactly 3 primary action cards.
- Opportunity feed becomes the handling surface for those actions.

If the pilot later needs more operational depth, persistent action assignment can be added as a second iteration.

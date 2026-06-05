# Demo Scope Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove distracting demo-only modules and mock-looking labels from the board-facing Makuku AI terminal growth sample.

**Architecture:** Keep all underlying routes and APIs intact for operators, but narrow the main sidebar and board-facing copy to the 7-day growth-loop sample. Demo fallback data remains available, but visible store names and labels should read like a pilot dataset instead of throwaway mock data.

**Tech Stack:** Next.js 16 App Router, React Server Components, TypeScript, Tailwind CSS, Node.js built-in test runner for smoke checks.

---

### Task 1: Add Board-Facing Smoke Test

**Files:**
- Create: `tests/demo-scope.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const appShell = readFileSync("src/components/app-shell.tsx", "utf8");
const demoData = readFileSync("src/lib/demo-data.ts", "utf8");

test("board navigation only exposes the 7-day sample workflow", () => {
  assert.match(appShell, /老板看板|Executive Board/);
  assert.match(appShell, /H5 巡店|Field Capture/);
  assert.match(appShell, /AI 价格复核|AI Price Review/);
  assert.match(appShell, /机会流|Opportunity Feed/);

  assert.doesNotMatch(appShell, /AI Debug/);
  assert.doesNotMatch(appShell, /TikTok Phase 2|tiktokPhase2/);
  assert.doesNotMatch(appShell, /SKU Master|skuMaster/);
  assert.doesNotMatch(appShell, /Channels|渠道列表/);
  assert.doesNotMatch(appShell, /Competitors|competitors/);
  assert.doesNotMatch(appShell, /Alerts|alerts/);
});

test("visible sample data does not look like throwaway mock data", () => {
  assert.doesNotMatch(demoData, /name: "Demo/);
  assert.doesNotMatch(demoData, /address: "Demo address"/);
  assert.doesNotMatch(demoData, /source: "demo"/);
  assert.match(demoData, /source: "pilot-sample"/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/demo-scope.test.mjs`

Expected: FAIL because `app-shell.tsx` still exposes debug/master-data/TikTok entries and `demo-data.ts` still contains visible `Demo` labels.

### Task 2: Narrow Sidebar to the One-Week Sample

**Files:**
- Modify: `src/components/app-shell.tsx`
- Test: `tests/demo-scope.test.mjs`

- [ ] **Step 1: Replace sidebar entries**

Keep four main routes visible:

```ts
const navItems = [
  { href: "/dashboard", label: { zh: "老板看板", en: "Executive Board" }, icon: Gauge },
  { href: "/mobile/offline-capture", label: { zh: "H5 巡店", en: "Field Capture" }, icon: ImageUp },
  { href: "/offline-price-candidates", label: { zh: "AI 价格复核", en: "AI Price Review" }, icon: ClipboardCheck },
  { href: "/promo-events", label: { zh: "机会流", en: "Opportunity Feed" }, icon: BarChart3 },
] as const;
```

Remove unused icon imports after changing the list.

- [ ] **Step 2: Update shell sample badge copy**

Use board-facing copy instead of raw demo terminology:

```ts
const appSubtitle = locale === "zh" ? "AI 终端增长闭环样板" : "AI Terminal Growth Loop";
const sampleBadge = locale === "zh" ? "7天样板数据" : "7-day pilot data";
```

- [ ] **Step 3: Run smoke test**

Run: `node --test tests/demo-scope.test.mjs`

Expected: the navigation assertions pass, sample-data assertions still fail until Task 3.

### Task 3: Rename Visible Sample Data

**Files:**
- Modify: `src/lib/demo-data.ts`
- Test: `tests/demo-scope.test.mjs`

- [ ] **Step 1: Replace visible demo store names and source label**

Change:

```ts
name: "Demo Jakarta Baby Store"
address: "Demo address"
source: "demo"
```

to realistic pilot-facing values:

```ts
name: "Jakarta Baby Care - Kelapa Gading"
address: "Kelapa Gading, Jakarta"
source: "pilot-sample"
```

Apply the same treatment to the Surabaya store.

- [ ] **Step 2: Run smoke test**

Run: `node --test tests/demo-scope.test.mjs`

Expected: PASS.

### Task 4: Add Board Context to Dashboard

**Files:**
- Modify: `src/app/[locale]/dashboard/page.tsx`

- [ ] **Step 1: Add a compact board-facing context band**

Add a non-card full-width band before KPI cards:

```tsx
<section className="mb-5 border-l-4 border-emerald-500 bg-emerald-50 px-4 py-3 text-sm text-emerald-950">
  <div className="font-semibold">{isZh ? "7天样板目标" : "7-day pilot objective"}</div>
  <p className="mt-1">
    {isZh
      ? "用重点门店照片跑通采集、AI识别、人工复核、机会看板和行动建议。"
      : "Turn priority store photos into capture, AI extraction, review, opportunity visibility, and action suggestions."}
  </p>
</section>
```

- [ ] **Step 2: Run lint and build**

Run: `npm run lint`

Expected: exit 0.

Run: `npm run build`

Expected: exit 0.

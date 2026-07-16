# Price Review One Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make price anomaly review usable in one screen by showing the source image and all review facts side by side.

**Architecture:** Keep the existing route, API, and approval/rejection workflow. Extend the operator review view model with the visit code, then replace the current narrow drawer layout with a wide comparison dialog that keeps correction controls inline.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind CSS, node:test.

---

### Task 1: Add One-Screen Review Coverage

**Files:**
- Modify: `tests/operator-price-review-one-screen.test.mjs`

- [ ] **Step 1: Write the failing structural test**

Create a node:test file that reads `src/components/operator-price-review-drawer.tsx`, `src/lib/operator-price-review.ts`, and `src/lib/types.ts`. Assert that the review detail exposes `visit_code`, that the dialog uses a wide two-column desktop layout, and that the source info labels are rendered in the review surface.

- [ ] **Step 2: Run the test and confirm RED**

Run: `node --test tests/operator-price-review-one-screen.test.mjs`

Expected: FAIL because `visit_code` and the new layout markers do not exist yet.

### Task 2: Extend Review Detail View Model

**Files:**
- Modify: `src/lib/types.ts`
- Modify: `src/lib/operator-price-review.ts`

- [ ] **Step 1: Add `visit_code` to `OperatorPriceReviewDetail`**

Add `visit_code: string | null;` so the UI can display the Visit ID without parsing URLs.

- [ ] **Step 2: Populate `visit_code` in `getOperatorPriceReviewDetail`**

Use `candidate.offline_store_visits?.visit_code ?? null` when building the detail response.

- [ ] **Step 3: Run the focused test**

Run: `node --test tests/operator-price-review-one-screen.test.mjs`

Expected: still FAIL until the UI layout is updated.

### Task 3: Replace Drawer Layout With Wide Comparison Dialog

**Files:**
- Modify: `src/components/operator-price-review-drawer.tsx`

- [ ] **Step 1: Keep data loading and submit logic unchanged**

Do not change the `fetch`, `openMatchEditor`, `submit`, or API payload behavior except for rendering `detail.visit_code`.

- [ ] **Step 2: Change the shell to a centered wide dialog**

Use a `section` with `max-w-6xl`, `max-h-[92vh]`, and desktop `grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)]`.

- [ ] **Step 3: Put image on the left**

Render the original image in a sticky desktop panel with `object-contain`, falling back to the existing unavailable evidence state.

- [ ] **Step 4: Put reason, source IDs, evidence, match, and actions on the right**

Render the reason block first, then a compact source block with Visit ID and image ID, then evidence fields, match correction, and existing action buttons.

- [ ] **Step 5: Run the focused test**

Run: `node --test tests/operator-price-review-one-screen.test.mjs`

Expected: PASS.

### Task 4: Verify Frontend Safety

**Files:**
- Verify only

- [ ] **Step 1: Run targeted lint**

Run: `npx eslint src/components/operator-price-review-drawer.tsx src/components/operator-price-review-workbench.tsx src/lib/operator-price-review.ts src/lib/types.ts`

Expected: PASS or only unrelated warnings already present in the repository.

- [ ] **Step 2: Build if lint passes**

Run: `npm run build`

Expected: PASS. If baseline build fails for unrelated schema/env reasons, record the exact failure.

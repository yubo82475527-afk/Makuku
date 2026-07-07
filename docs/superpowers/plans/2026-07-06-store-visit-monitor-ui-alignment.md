# Store Visit Monitor UI Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align the `Visit analysis list` filter bar and pagination placement in Store Visit Monitor with the existing Photo Price Review interaction pattern without changing data behavior.

**Architecture:** Keep all query parsing and server-side fetch logic in the existing page component. Replace the current generic filter grid with compact labeled inputs styled like Photo Price Review, and move the page size selector into the bottom pagination row so the list interaction pattern matches.

**Tech Stack:** Next.js App Router, React server components, Tailwind CSS

---

### Task 1: Reshape the filter bar UI

**Files:**
- Modify: `src/app/[locale]/store-visit-monitor/page.tsx`

- [ ] **Step 1: Inspect the existing page and reference UI**

Read:

```text
src/app/[locale]/store-visit-monitor/page.tsx
src/app/[locale]/offline-price-candidates/page.tsx
```

Confirm the target pattern is the compact labeled filter row used by Photo Price Review, not the generic `TextInput` and `SelectInput` controls.

- [ ] **Step 2: Replace the filter form markup with compact labeled controls**

Update the filter form in `src/app/[locale]/store-visit-monitor/page.tsx` so it uses inline-label wrappers for:

```tsx
Visit code
Store name
Promoter
Analysis status
Visit date range
Filter / Reset actions
```

Keep the same query parameter names:

```text
visit_code
store_name
promoter
analysis_status
date_from
date_to
```

- [ ] **Step 3: Keep behavior unchanged while removing page size from the filter row**

Delete the filter-row `page_size` field, but continue reading and preserving `page_size` from search params and pagination links so data loading behavior stays unchanged.

### Task 2: Align the pagination row with Photo Price Review

**Files:**
- Modify: `src/app/[locale]/store-visit-monitor/page.tsx`

- [ ] **Step 1: Move page size control into the bottom list footer**

Add the page size selector to the same bottom row that shows range and previous/next navigation, preserving the current values:

```text
25 / page
50 / page
100 / page
```

- [ ] **Step 2: Keep page links and state consistent**

Ensure previous and next links still use:

```text
page
page_size
visit_code
store_name
promoter
analysis_status
date_from
date_to
```

and that changing page size resets pagination to page 1 through a normal GET form submit.

- [ ] **Step 3: Match footer information density**

Render the footer as one aligned row with:

```text
from-to / total
page size selector
previous button
page x / y
next button
```

### Task 3: Verify the page still works

**Files:**
- Modify: `src/app/[locale]/store-visit-monitor/page.tsx`

- [ ] **Step 1: Run lint on the changed file scope**

Run:

```bash
npx eslint src/app/[locale]/store-visit-monitor/page.tsx
```

Expected: no errors

- [ ] **Step 2: Sanity-check the diff**

Run:

```bash
git diff -- src/app/[locale]/store-visit-monitor/page.tsx
```

Expected: only UI structure and class changes for the filter bar and pagination row, with query logic unchanged.

# Candidate Product Confirmation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an operator accept a low-confidence AI product candidate together with its price in one manual confirmation, while keeping explicit product correction for missing or incorrect candidates.

**Architecture:** The detail API already defaults an omitted product payload to the current candidate and the database RPC atomically validates SKU ownership and creates the Price Snapshot. Adjust only the operator view: expose the suggested-product state clearly, allow confirmation when a current candidate exists, and reserve the product selector for an operator correction.

**Tech Stack:** Next.js App Router, React, TypeScript, Node.js built-in test runner.

---

### Task 1: Lock the operator confirmation behavior

**Files:**
- Modify: `tests/operator-price-review.test.mjs`
- Test: `tests/operator-price-review.test.mjs`

- [x] **Step 1: Write a failing regression test**

Add static assertions that require the drawer to accept `current_match_id` as a valid manual confirmation, label the acceptance action as `确认商品与价格正确`, and label uncertain list rows as `AI 建议商品` rather than an existing SKU association.

- [x] **Step 2: Run the focused test and verify RED**

Run: `node --test tests/operator-price-review.test.mjs`

Expected: FAIL because the current drawer requires `selectedMatch` whenever product correction is required and the list presents the candidate as `商品 / SKU`.

### Task 2: Allow confirmation of the proposed product and clarify its status

**Files:**
- Modify: `src/components/operator-price-review-drawer.tsx`
- Modify: `src/components/operator-price-review-workbench.tsx`
- Test: `tests/operator-price-review.test.mjs`

- [x] **Step 1: Implement the smallest UI change**

Use an existing `current_match_id` as a valid confirmation target regardless of `requires_product_correction`. In the product panel, identify the current candidate as an AI suggestion and make `修正商品` an optional override. Rename the confirmation command to `确认商品与价格正确` when the product needs manual confirmation. In the list, replace the low-confidence SKU display with `AI 建议商品，待确认` while retaining the extracted product name.

- [x] **Step 2: Run focused verification**

Run: `node --test tests/operator-price-review.test.mjs tests/offline-price-candidates-ui.test.mjs`

Expected: PASS.

- [x] **Step 3: Run component lint**

Run: `npx eslint src/components/operator-price-review-drawer.tsx src/components/operator-price-review-workbench.tsx`

Expected: PASS with no warnings.

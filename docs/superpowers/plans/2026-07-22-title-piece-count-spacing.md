# Title Piece-Count Spacing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve package counts from trusted diaper titles that put a space between the size and count.

**Architecture:** Keep the existing `resolveTrustedPieceCount` trust boundary. Update only `parsePieceCountFromProductTitle` so its size-plus-count pattern accepts zero or more whitespace characters after the optional hyphen. The resolver will then persist a derived count and calculate the per-piece value through the existing candidate pipeline.

**Tech Stack:** TypeScript, Node.js built-in test runner, existing `src/lib/piece-count.ts` helper.

---

### Task 1: Extend trusted title parsing

**Files:**
- Modify: `src/lib/piece-count.ts:34-40`
- Modify: `tests/piece-count.test.mjs`

- [ ] **Step 1: Write the failing test**

Add these assertions to the trusted-title test block in `tests/piece-count.test.mjs`:

```js
assert.equal(parsePieceCountFromProductTitle("Merries Pants Good Skin XL 26"), 26);
assert.equal(parsePieceCountFromProductTitle("Merries Pants Good Skin XXL 18"), 18);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/piece-count.test.mjs`

Expected: FAIL because both spaced-title expressions currently return `null`.

- [ ] **Step 3: Write minimal implementation**

In `parsePieceCountFromProductTitle`, change the size-count expression from:

```ts
/\b(?:nb-s|nb|s|m|l|xl|xxl|xxxl|xxxxl)-?(\d{1,3})(?:\s*\+\s*(\d{1,3}))?\b/i
```

to:

```ts
/\b(?:nb-s|nb|s|m|l|xl|xxl|xxxl|xxxxl)-?\s*(\d{1,3})(?:\s*\+\s*(\d{1,3}))?\b/i
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/piece-count.test.mjs`

Expected: PASS, including compact, hyphenated, and new spaced-title cases.

- [ ] **Step 5: Run the candidate integration test**

Run: `node --test tests/price-amount-scale-guard.test.mjs`

Expected: PASS, confirming trusted-title-derived counts remain accepted by price candidate handling.

- [ ] **Step 6: Commit**

```bash
git add src/lib/piece-count.ts tests/piece-count.test.mjs
git commit -m "fix: parse spaced title piece counts"
```

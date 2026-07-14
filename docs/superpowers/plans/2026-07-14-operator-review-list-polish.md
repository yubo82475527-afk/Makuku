# Operator Review List Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let operators read the full matched SKU label and inspect the exact source image without slowing initial list rendering.

**Architecture:** Keep list rows backed by signed thumbnail URLs. A list image click mounts a focused client dialog which fetches the existing authenticated candidate-detail endpoint once, then loads only that candidate's signed original image. Table-only CSS allocates a larger fixed product column and removes text truncation from the matched SKU label on both desktop and mobile.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind CSS, Node test runner.

---

### Task 1: Lock down list layout and lazy-preview behavior

**Files:**
- Modify: `tests/operator-price-review.test.mjs`

- [x] **Step 1: Write the failing static behavior test**

Add one test asserting that the workbench reserves `w-[32%]` for the product column, renders the SKU label without the `truncate` class, tracks a preview candidate ID, and mounts `OperatorPriceSourceImageDialog`. Add assertions that the dialog fetches the existing candidate-detail endpoint from an effect and has no image URL until that request completes.

- [x] **Step 2: Run the focused test to verify it fails**

Run `node --test --test-name-pattern="operator list displays full matched SKU labels and lazily previews the source image" tests/operator-price-review.test.mjs`.

Expected: FAIL because neither the preview dialog nor the wider, wrapping product layout exists.

### Task 2: Implement the table layout and source-image preview

**Files:**
- Create: `src/components/operator-price-source-image-dialog.tsx`
- Modify: `src/components/operator-price-review-workbench.tsx`

- [x] **Step 1: Add the focused preview dialog**

Create `OperatorPriceSourceImageDialog` with `candidateId`, `locale`, and `onClose` props. Its `useEffect` fetches the existing candidate-detail endpoint only after the dialog mounts, reads `source_image_url`, and presents loading, unavailable, and error states. Close on Escape, backdrop click, or the close button. Render the signed original URL with `object-contain` so the whole image is visible.

- [x] **Step 2: Wire thumbnail clicks without preloading originals**

Store `previewCandidateId` in `OperatorPriceReviewWorkbench`. Pass an `onPreview` callback to the desktop and mobile `SourceThumbnail` instances, render the dialog only while an ID is selected, and make each available thumbnail a labelled button. Keep missing-image cells non-interactive.

- [x] **Step 3: Make matched SKU labels complete and readable**

Change the desktop product header to `w-[32%]`. Replace the SKU label's `truncate` classes with `whitespace-normal break-words` in both desktop and mobile layouts; preserve all existing product labels and review actions.

- [x] **Step 4: Run focused verification**

Run `node --test tests/operator-price-review.test.mjs`, `npx tsc --noEmit`, and `git diff --check`.

Expected: all focused tests pass, TypeScript emits no errors, and the diff has no whitespace errors.

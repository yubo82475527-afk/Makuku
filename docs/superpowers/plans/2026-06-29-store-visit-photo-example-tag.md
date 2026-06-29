# Store Visit Photo Example Tag Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the old per-card text-only photo example affordance with a compact red `Photo Example` tag beside `Visit Photos`, opening a richer H5 sheet that shows 3 correct and 3 wrong sample photos.

**Architecture:** Keep this change inside the existing H5 create-visit surface in `src/components/store-visit-h5.tsx`. Reuse static assets from `public/store-visit-photo-examples/`, keep the modal driven by local component state, and update the static tests so they assert stable source signals instead of brittle rendered text literals.

**Tech Stack:** Next.js app, React/TSX, Tailwind utility classes, Node built-in test runner, ESLint.

---

## File Map

- Modify: `src/components/store-visit-h5.tsx`
  - Finish the `uiCopy(locale)` additions for both locales.
  - Keep the global `Photo Example` tag beside `Visit Photos`.
  - Keep the example sheet image grid and remove old per-card example entry points.
- Modify: `tests/store-visit-photo-quality-gate.test.mjs`
  - Update source-level assertions to match current implementation signals.
- Verify only: `public/store-visit-photo-examples/correct-1.jpeg`
- Verify only: `public/store-visit-photo-examples/correct-2.jpg`
- Verify only: `public/store-visit-photo-examples/correct-3.jpg`
- Verify only: `public/store-visit-photo-examples/wrong-1.jpg`
- Verify only: `public/store-visit-photo-examples/wrong-2.jpeg`
- Verify only: `public/store-visit-photo-examples/wrong-3.jpeg`

### Task 1: Stabilize the failing static tests around the new Photo Example design

**Files:**
- Modify: `tests/store-visit-photo-quality-gate.test.mjs`
- Verify against: `src/components/store-visit-h5.tsx`

- [ ] **Step 1: Write the failing assertions against stable source markers**

Replace the two H5 photo-example tests so they check the current code shape instead of the literal `Visit Photos` string:

```js
test("H5 capture page exposes photo examples for price-tag sections", () => {
  assert.match(storeVisitH5, /photoExampleImages = \{/);
  assert.match(storeVisitH5, /photoExampleCorrectTitle/);
  assert.match(storeVisitH5, /photoExampleWrongTitle/);
  assert.match(storeVisitH5, /photoExampleCorrectCaptions/);
  assert.match(storeVisitH5, /photoExampleWrongCaptions/);
  assert.match(storeVisitH5, /store-visit-photo-examples\/correct-1\.jpeg/);
  assert.match(storeVisitH5, /store-visit-photo-examples\/correct-2\.jpg/);
  assert.match(storeVisitH5, /store-visit-photo-examples\/correct-3\.jpg/);
  assert.match(storeVisitH5, /store-visit-photo-examples\/wrong-1\.jpg/);
  assert.match(storeVisitH5, /store-visit-photo-examples\/wrong-2\.jpeg/);
  assert.match(storeVisitH5, /store-visit-photo-examples\/wrong-3\.jpeg/);
  assert.doesNotMatch(storeVisitH5, /photoExampleLabel\?: string \| null/);
  assert.doesNotMatch(storeVisitH5, /onOpenPhotoExample\?: \(\) => void/);
});

test("H5 capture page shows a compact red Photo Example tag beside Visit Photos instead of per-card pills", () => {
  assert.match(storeVisitH5, /copy\.shelfPhotos/);
  assert.match(storeVisitH5, /setPhotoExampleSheet\("makuku_shelf"\)/);
  assert.match(storeVisitH5, /bg-red-50/);
  assert.match(storeVisitH5, /text-red-700/);
  assert.doesNotMatch(storeVisitH5, /inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0\.5 text-\[11px\] font-semibold text-slate-600/);
});
```

- [ ] **Step 2: Run the targeted static test and verify it fails for the right reason**

Run:

```bash
node --test tests/store-visit-photo-quality-gate.test.mjs
```

Expected before implementation is finished:
- The updated tests should fail only because `src/components/store-visit-h5.tsx` is still missing part of the localized copy or has inconsistent source markers.
- They should no longer fail because the test is searching for the literal `Visit Photos`.

- [ ] **Step 3: Commit the test-only change**

```bash
git add tests/store-visit-photo-quality-gate.test.mjs
git commit -m "test: align photo example gate checks with new h5 design"
```

### Task 2: Finish the H5 copy model and remove the last half-migrated state

**Files:**
- Modify: `src/components/store-visit-h5.tsx`

- [ ] **Step 1: Complete both locale branches in `uiCopy(locale)`**

Add the missing Chinese fields and keep the English fields aligned:

```ts
photoExampleCorrectTitle: "合格示例",
photoExampleWrongTitle: "不合格示例",
photoExampleCorrectCaptions: ["正对拍", "数字清晰", "一张一小区域"],
photoExampleWrongCaptions: ["斜拍过强", "拍得太远", "价格被遮挡"],
```

And keep the English branch as:

```ts
photoExampleCorrectTitle: "Correct Examples",
photoExampleWrongTitle: "Wrong Examples",
photoExampleCorrectCaptions: ["Front-facing", "Clear digits", "One shelf section"],
photoExampleWrongCaptions: ["Too angled", "Too far", "Blocked price"],
```

- [ ] **Step 2: Keep the tag global to the `Visit Photos` header**

The header block should keep this shape:

```tsx
<div className="flex items-center justify-between gap-3">
  <div className="flex min-w-0 items-center gap-2">
    <h2 className="font-semibold">{copy.shelfPhotos}</h2>
    <button
      type="button"
      onClick={() => setPhotoExampleSheet("makuku_shelf")}
      className="inline-flex h-6 items-center rounded-full border border-red-200 bg-red-50 px-2.5 text-[11px] font-semibold text-red-700"
    >
      {labels.photoExample}
    </button>
  </div>
  <div>
    <p className="mt-1 text-xs text-slate-500">{totalImageCount}/{maxImages} {copy.uploaded}</p>
  </div>
</div>
```

- [ ] **Step 3: Ensure `ImageUploadSection` no longer exposes the old per-card photo example props**

The function signature should not contain:

```ts
photoExampleLabel?: string | null;
onOpenPhotoExample?: () => void;
```

And the section usage should not pass those props in any `ImageUploadSection` call.

- [ ] **Step 4: Keep the example sheet image-first and data-driven**

The modal body should render the two datasets directly from `photoExampleImages`:

```tsx
{photoExampleImages.correct.map((src, index) => (
  <div key={src} className="overflow-hidden rounded-xl border border-emerald-200 bg-emerald-50">
    <img src={src} alt={`${labels.photoExampleCorrectTitle} ${index + 1}`} className="aspect-[4/3] w-full object-cover" />
    <div className="px-2.5 py-2 text-center text-[11px] font-semibold text-emerald-800">
      {labels.photoExampleCorrectCaptions[index] ?? labels.photoExampleCorrectTitle}
    </div>
  </div>
))}
```

```tsx
{photoExampleImages.wrong.map((src, index) => (
  <div key={src} className="overflow-hidden rounded-xl border border-amber-200 bg-amber-50">
    <img src={src} alt={`${labels.photoExampleWrongTitle} ${index + 1}`} className="aspect-[4/3] w-full object-cover" />
    <div className="px-2.5 py-2 text-center text-[11px] font-semibold text-amber-800">
      {labels.photoExampleWrongCaptions[index] ?? labels.photoExampleWrongTitle}
    </div>
  </div>
))}
```

- [ ] **Step 5: Run the targeted static test and verify it passes**

Run:

```bash
node --test tests/store-visit-photo-quality-gate.test.mjs
```

Expected:
- PASS for both new photo-example tests.
- No regression in the existing prompt/type/detail/list assertions inside the same file.

- [ ] **Step 6: Commit the H5 component change**

```bash
git add src/components/store-visit-h5.tsx
git commit -m "feat: add image-based photo example tag for h5 visits"
```

### Task 3: Run focused regression and lint after the UI change

**Files:**
- Verify: `tests/store-visit-auto-analyze.test.mjs`
- Verify: `tests/store-visit-store-selection.test.mjs`
- Verify: `tests/store-visit-photo-quality-gate.test.mjs`

- [ ] **Step 1: Run the focused store-visit regression suite**

Run:

```bash
node --test tests/store-visit-auto-analyze.test.mjs tests/store-visit-store-selection.test.mjs tests/store-visit-photo-quality-gate.test.mjs
```

Expected:
- All targeted tests pass.
- Any failure must be inspected before moving on, especially if it touches `store-visit-h5.tsx`.

- [ ] **Step 2: Run lint**

Run:

```bash
npm run lint
```

Expected:
- No new lint errors from `src/components/store-visit-h5.tsx`.
- If the repo has pre-existing warnings elsewhere, record them explicitly and avoid unrelated cleanup.

- [ ] **Step 3: Verify the sample assets are present and correctly named**

Run:

```bash
Get-ChildItem public/store-visit-photo-examples | Select-Object Name
```

Expected output set:

```text
correct-1.jpeg
correct-2.jpg
correct-3.jpg
wrong-1.jpg
wrong-2.jpeg
wrong-3.jpeg
```

- [ ] **Step 4: Commit verification-safe follow-up if needed**

If tests or lint required a small follow-up fix:

```bash
git add src/components/store-visit-h5.tsx tests/store-visit-photo-quality-gate.test.mjs
git commit -m "fix: polish photo example h5 coverage"
```

If no follow-up fix was needed, skip this commit.

## Notes

- Keep scope limited to the create-visit H5 page. Do not expand into detail page, list page, or AI prompt changes.
- Do not move these example images into a remote CMS or database for this task; static assets in `public/` are enough.
- Do not refactor `photoExampleSheet` state type unless it materially blocks the implementation. A minimal change is preferred here.
- The current Chinese strings in the file should be normalized as part of this work if they are visibly garbled in source.

## Self-Review

- Spec coverage: this plan covers the red tag placement, the modal image content, the localized captions, the removal of old per-card example entry points, and verification of the copied assets.
- Placeholder scan: no `TODO` or unresolved code markers remain in the plan.
- Type consistency: the plan consistently uses `photoExampleImages`, `photoExampleSheet`, `photoExampleCorrectTitle`, `photoExampleWrongTitle`, `photoExampleCorrectCaptions`, and `photoExampleWrongCaptions`, matching the current component direction.

Plan complete and saved to `docs/superpowers/plans/2026-06-29-store-visit-photo-example-tag.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?

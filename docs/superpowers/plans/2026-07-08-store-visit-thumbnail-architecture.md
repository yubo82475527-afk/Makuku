# Store Visit Thumbnail Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standard thumbnail architecture for store-visit images so pages render thumbnails by default, originals load only on click, and historical images can be backfilled safely.

**Architecture:** Generate and persist a thumbnail for every newly uploaded store-visit image, expose thumbnail URLs in visit detail APIs, and fetch original signed URLs lazily per image. Legacy `image_urls` rows keep their original paths but gain parallel thumbnail paths so the same thumbnail-first behavior works across both legacy and current image models.

**Tech Stack:** Next.js 16 route handlers, Supabase Storage, Supabase Postgres migrations, TypeScript, Node.js scripts, `sharp`, Node test runner

---

### Task 1: Add schema for persisted thumbnail paths

**Files:**
- Create: `supabase/migrations/202607080001_store_visit_image_thumbnails.sql`
- Modify: `src/lib/types.ts`
- Test: `tests/store-visit-thumbnail-architecture.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const migration = readFileSync("supabase/migrations/202607080001_store_visit_image_thumbnails.sql", "utf8");
const typesFile = readFileSync("src/lib/types.ts", "utf8");

test("thumbnail migration persists paths for current and legacy store visit images", () => {
  assert.match(migration, /alter table public\.offline_visit_images add column if not exists thumbnail_path text/i);
  assert.match(migration, /alter table public\.offline_store_visits add column if not exists image_thumbnail_paths text\[\]/i);
  assert.match(typesFile, /thumbnail_path\?: string \| null;/);
  assert.match(typesFile, /image_thumbnail_paths\?: string\[\] \| null;/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/store-visit-thumbnail-architecture.test.mjs`
Expected: FAIL because the migration file and new type fields do not exist yet.

- [ ] **Step 3: Write minimal implementation**

```sql
alter table public.offline_visit_images
  add column if not exists thumbnail_path text;

alter table public.offline_store_visits
  add column if not exists image_thumbnail_paths text[];
```

```ts
export type OfflineVisitImage = {
  // ...
  thumbnail_path?: string | null;
};

export type OfflineStoreVisit = {
  // ...
  image_thumbnail_paths?: string[] | null;
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/store-visit-thumbnail-architecture.test.mjs`
Expected: PASS for the migration and type assertions.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/202607080001_store_visit_image_thumbnails.sql src/lib/types.ts tests/store-visit-thumbnail-architecture.test.mjs
git commit -m "feat: add store visit thumbnail schema"
```

### Task 2: Add shared thumbnail helper and upload-time generation

**Files:**
- Create: `src/lib/store-visit-image-variants.ts`
- Modify: `src/app/api/store-visit/[id]/images/route.ts`
- Modify: `src/app/api/offline-store-visits/[id]/images/route.ts`
- Modify: `src/app/api/store-visit/route.ts`
- Modify: `package.json`
- Test: `tests/store-visit-thumbnail-architecture.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
const storeVisitImageRoute = readFileSync("src/app/api/store-visit/[id]/images/route.ts", "utf8");
const offlineVisitImageRoute = readFileSync("src/app/api/offline-store-visits/[id]/images/route.ts", "utf8");
const createVisitRoute = readFileSync("src/app/api/store-visit/route.ts", "utf8");
const helperFile = readFileSync("src/lib/store-visit-image-variants.ts", "utf8");
const packageFile = readFileSync("package.json", "utf8");

test("upload routes generate and persist thumbnails for new images", () => {
  assert.match(packageFile, /"sharp":/);
  assert.match(helperFile, /export async function createStoreVisitThumbnail/);
  assert.match(helperFile, /export function buildStoreVisitThumbnailPath/);
  assert.match(storeVisitImageRoute, /thumbnail_path:/);
  assert.match(offlineVisitImageRoute, /thumbnail_path:/);
  assert.match(createVisitRoute, /image_thumbnail_paths:/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/store-visit-thumbnail-architecture.test.mjs`
Expected: FAIL because there is no thumbnail helper, no `sharp`, and no routes persist thumbnail paths.

- [ ] **Step 3: Write minimal implementation**

```ts
import sharp from "sharp";

export function buildStoreVisitThumbnailPath(originalPath: string) {
  const slash = originalPath.lastIndexOf("/");
  const dir = slash >= 0 ? originalPath.slice(0, slash) : "";
  const file = slash >= 0 ? originalPath.slice(slash + 1) : originalPath;
  const base = file.replace(/\.[^.]+$/, "");
  return `${dir}/thumbnails/${base}.webp`;
}

export async function createStoreVisitThumbnail(input: { bytes: Buffer }) {
  const image = sharp(input.bytes).rotate();
  const metadata = await image.metadata();
  const thumbnail = await image.resize(512, 512, { fit: "inside", withoutEnlargement: true }).webp({ quality: 72 }).toBuffer();
  return {
    buffer: thumbnail,
    contentType: "image/webp",
    width: metadata.width ?? null,
    height: metadata.height ?? null,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/store-visit-thumbnail-architecture.test.mjs`
Expected: PASS for the new helper and route-level persistence markers.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/lib/store-visit-image-variants.ts src/app/api/store-visit/[id]/images/route.ts src/app/api/offline-store-visits/[id]/images/route.ts src/app/api/store-visit/route.ts tests/store-visit-thumbnail-architecture.test.mjs
git commit -m "feat: generate thumbnails for store visit uploads"
```

### Task 3: Return thumbnails by default and lazy-load originals per image

**Files:**
- Modify: `src/app/api/store-visit/[id]/route.ts`
- Modify: `src/app/api/offline-store-visits/[id]/route.ts`
- Modify: `src/lib/data.ts`
- Create: `src/app/api/store-visit/[id]/image-url/route.ts`
- Create: `src/app/api/offline-store-visits/[id]/image-url/route.ts`
- Modify: `src/lib/types.ts`
- Test: `tests/store-visit-thumbnail-architecture.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
const storeVisitDetailRoute = readFileSync("src/app/api/store-visit/[id]/route.ts", "utf8");
const offlineVisitDetailRoute = readFileSync("src/app/api/offline-store-visits/[id]/route.ts", "utf8");
const storeVisitOriginalRoute = readFileSync("src/app/api/store-visit/[id]/image-url/route.ts", "utf8");
const offlineVisitOriginalRoute = readFileSync("src/app/api/offline-store-visits/[id]/image-url/route.ts", "utf8");

test("detail routes sign thumbnails first and expose per-image original URL endpoints", () => {
  assert.match(storeVisitDetailRoute, /thumbnail_path/);
  assert.match(storeVisitDetailRoute, /createSignedUrl\\(thumbnailPath/);
  assert.match(offlineVisitDetailRoute, /thumbnail_path/);
  assert.match(storeVisitOriginalRoute, /searchParams\.get\("image_id"\)/);
  assert.match(offlineVisitOriginalRoute, /searchParams\.get\("image_id"\)/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/store-visit-thumbnail-architecture.test.mjs`
Expected: FAIL because the current detail routes sign originals eagerly and no original-image endpoint exists.

- [ ] **Step 3: Write minimal implementation**

```ts
const thumbnailPath = image.thumbnail_path ?? image.image_path;
const { data } = await supabase.storage.from("offline-visit-images").createSignedUrl(thumbnailPath, 60 * 60);
return {
  id: image.id,
  path: image.image_path,
  url: data?.signedUrl ?? null,
  category,
};
```

```ts
export async function GET(request: Request, ctx: RouteContext) {
  const imageId = new URL(request.url).searchParams.get("image_id")?.trim() || "";
  // load image row, sign original image_path only for the requested image
  return Response.json({ url: signed?.signedUrl ?? null });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/store-visit-thumbnail-architecture.test.mjs`
Expected: PASS with detail routes signing thumbnails and dedicated endpoints present.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/store-visit/[id]/route.ts src/app/api/offline-store-visits/[id]/route.ts src/app/api/store-visit/[id]/image-url/route.ts src/app/api/offline-store-visits/[id]/image-url/route.ts src/lib/data.ts src/lib/types.ts tests/store-visit-thumbnail-architecture.test.mjs
git commit -m "feat: serve thumbnails and lazy-load original store visit images"
```

### Task 4: Update image UIs to use thumbnails and click-to-open originals

**Files:**
- Modify: `src/components/store-visit-detail-h5.tsx`
- Modify: `src/components/mobile-offline-app.tsx`
- Modify: `src/app/[locale]/offline-uploads/[id]/page.tsx`
- Test: `tests/store-visit-thumbnail-architecture.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
const detailH5 = readFileSync("src/components/store-visit-detail-h5.tsx", "utf8");
const mobileOfflineApp = readFileSync("src/components/mobile-offline-app.tsx", "utf8");
const offlineUploadsPage = readFileSync("src/app/[locale]/offline-uploads/[id]/page.tsx", "utf8");

test("thumbnail UIs lazy-load originals only when the user opens a preview", () => {
  assert.match(detailH5, /fetchOriginalImageUrl/);
  assert.match(detailH5, /setActiveImage\\(\\{ status: "loading"/);
  assert.match(mobileOfflineApp, /fetchOriginalImageUrl/);
  assert.match(offlineUploadsPage, /fetchOriginalImageUrl/);
  assert.doesNotMatch(offlineUploadsPage, /<img src=\\{image\\.url\\} alt=\\{`\\$\\{visit\\.store_name\\}/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/store-visit-thumbnail-architecture.test.mjs`
Expected: FAIL because the pages still render original image URLs directly.

- [ ] **Step 3: Write minimal implementation**

```ts
async function fetchOriginalImageUrl(imageId: string) {
  const response = await fetch(`/api/store-visit/${id}/image-url?image_id=${encodeURIComponent(imageId)}`);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || typeof payload.url !== "string" || !payload.url) {
    throw new Error(text.loadVisitFailed);
  }
  return payload.url;
}
```

```tsx
<button
  type="button"
  onClick={() => void openOriginalImage(item)}
  className="aspect-square overflow-hidden rounded-xl bg-slate-100"
>
  <img src={item.signedImage.url} alt={`${text.photoPrefix}${index + 1}`} className="h-full w-full object-cover" />
</button>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/store-visit-thumbnail-architecture.test.mjs`
Expected: PASS with source markers showing click-triggered original fetches.

- [ ] **Step 5: Commit**

```bash
git add src/components/store-visit-detail-h5.tsx src/components/mobile-offline-app.tsx src/app/[locale]/offline-uploads/[id]/page.tsx tests/store-visit-thumbnail-architecture.test.mjs
git commit -m "feat: preview originals lazily from store visit thumbnails"
```

### Task 5: Reduce polling payloads and add historical thumbnail backfill

**Files:**
- Modify: `src/app/api/offline-store-visits/[id]/route.ts`
- Create: `scripts/backfill-store-visit-thumbnails.mjs`
- Test: `tests/store-visit-thumbnail-architecture.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
const offlineVisitDetailRoute = readFileSync("src/app/api/offline-store-visits/[id]/route.ts", "utf8");
const backfillScript = readFileSync("scripts/backfill-store-visit-thumbnails.mjs", "utf8");

test("waiting-screen polling stays lightweight and a backfill script exists for history", () => {
  assert.match(offlineVisitDetailRoute, /if \(mode === "status"\)/);
  assert.match(backfillScript, /offline_visit_images/);
  assert.match(backfillScript, /image_thumbnail_paths/);
  assert.match(backfillScript, /createStoreVisitThumbnail/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/store-visit-thumbnail-architecture.test.mjs`
Expected: FAIL because the status polling route is still full-detail and no backfill script exists.

- [ ] **Step 3: Write minimal implementation**

```ts
const mode = new URL(request.url).searchParams.get("mode");
if (mode === "status") {
  return Response.json({
    visit: {
      id: data.id,
      visit_status: data.visit_status,
      analysis_status: data.analysis_status,
      offline_visit_images: (data.offline_visit_images ?? []).map((image) => ({
        id: image.id,
        analysis_status: image.analysis_status,
        image_type: image.image_type,
      })),
    },
  });
}
```

```js
// Query rows missing thumbnail_path or image_thumbnail_paths, download originals,
// generate thumbnails, upload them, and persist the paths back in Supabase.
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/store-visit-thumbnail-architecture.test.mjs`
Expected: PASS with lightweight polling branch and a concrete backfill script file.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/offline-store-visits/[id]/route.ts scripts/backfill-store-visit-thumbnails.mjs tests/store-visit-thumbnail-architecture.test.mjs
git commit -m "feat: backfill historical store visit thumbnails"
```

### Task 6: Verify end-to-end behavior

**Files:**
- Test: `tests/store-visit-thumbnail-architecture.test.mjs`

- [ ] **Step 1: Run targeted structural tests**

Run: `node --test tests/store-visit-thumbnail-architecture.test.mjs tests/store-visit-image-errors.test.mjs tests/store-visit-photo-quality-gate.test.mjs`
Expected: PASS with the new thumbnail architecture markers and no regressions in nearby image behavior tests.

- [ ] **Step 2: Run lint for touched files**

Run: `npm run lint`
Expected: PASS or only pre-existing unrelated lint issues.

- [ ] **Step 3: Dry-run the backfill script help output**

Run: `node scripts/backfill-store-visit-thumbnails.mjs --help`
Expected: prints usage for backfilling missing thumbnails without mutating data.

- [ ] **Step 4: Document operational follow-up**

```text
Apply migration, deploy code, run the thumbnail backfill script with Supabase service credentials, then monitor Storage egress for thumbnail-heavy routes.
```

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/plans/2026-07-08-store-visit-thumbnail-architecture.md
git commit -m "docs: add store visit thumbnail rollout plan"
```

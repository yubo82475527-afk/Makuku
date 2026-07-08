import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

const THUMBNAIL_CONTENT_TYPE = "image/webp";
const THUMBNAIL_MAX_SIDE = 512;
const THUMBNAIL_QUALITY = 72;
const PAGE_SIZE = 100;

function printHelp() {
  console.log(`Usage: node scripts/backfill-store-visit-thumbnails.mjs [--apply] [--limit=N]

Environment:
  NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY

Behavior:
  Without --apply, prints a dry-run summary only.
  With --apply, backfills missing thumbnail_path and image_thumbnail_paths.`);
}

function buildStoreVisitThumbnailPath(originalPath) {
  const slashIndex = originalPath.lastIndexOf("/");
  const directory = slashIndex >= 0 ? originalPath.slice(0, slashIndex) : "";
  const fileName = slashIndex >= 0 ? originalPath.slice(slashIndex + 1) : originalPath;
  const baseName = fileName.replace(/\.[^.]+$/, "");
  return `${directory}/thumbnails/${baseName}.webp`;
}

async function createStoreVisitThumbnail(bytes) {
  const thumbnail = sharp(bytes, { failOn: "none" })
    .rotate()
    .resize(THUMBNAIL_MAX_SIDE, THUMBNAIL_MAX_SIDE, {
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: THUMBNAIL_QUALITY });
  return thumbnail.toBuffer();
}

async function downloadBytes(supabase, bucket, path) {
  const result = await supabase.storage.from(bucket).download(path);
  if (result.error || !result.data) {
    throw new Error(result.error?.message ?? `Unable to download ${bucket}:${path}`);
  }
  return Buffer.from(await result.data.arrayBuffer());
}

async function uploadThumbnail(supabase, bucket, originalPath) {
  const thumbnailPath = buildStoreVisitThumbnailPath(originalPath);
  const bytes = await downloadBytes(supabase, bucket, originalPath);
  const thumbnailBuffer = await createStoreVisitThumbnail(bytes);
  const uploadResult = await supabase.storage.from(bucket).upload(thumbnailPath, thumbnailBuffer, {
    contentType: THUMBNAIL_CONTENT_TYPE,
    upsert: true,
  });
  if (uploadResult.error) {
    throw new Error(uploadResult.error.message);
  }
  return thumbnailPath;
}

async function backfillOfflineVisitImages({ supabase, apply, remainingLimit }) {
  let processed = 0;

  while (remainingLimit.value > 0) {
    const { data, error } = await supabase
      .from("offline_visit_images")
      .select("id,image_path,thumbnail_path")
      .or("thumbnail_path.is.null,thumbnail_path.eq.")
      .order("created_at", { ascending: true })
      .range(0, PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    if (!data?.length) break;

    for (const image of data) {
      if (remainingLimit.value <= 0) break;
      processed += 1;
      remainingLimit.value -= 1;
      if (!apply) continue;
      const thumbnailPath = await uploadThumbnail(supabase, "offline-visit-images", image.image_path);
      const { error: updateError } = await supabase
        .from("offline_visit_images")
        .update({ thumbnail_path: thumbnailPath })
        .eq("id", image.id);
      if (updateError) throw new Error(updateError.message);
    }

    if (data.length < PAGE_SIZE) break;
  }

  return processed;
}

async function backfillLegacyVisitImages({ supabase, apply, remainingLimit }) {
  let processed = 0;

  while (remainingLimit.value > 0) {
    const { data, error } = await supabase
      .from("offline_store_visits")
      .select("id,image_urls,image_thumbnail_paths")
      .not("image_urls", "is", null)
      .order("created_at", { ascending: true })
      .range(0, PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    if (!data?.length) break;

    for (const visit of data) {
      const imageUrls = Array.isArray(visit.image_urls) ? visit.image_urls : [];
      if (imageUrls.length === 0) continue;
      const thumbnailPaths = Array.isArray(visit.image_thumbnail_paths) ? [...visit.image_thumbnail_paths] : [];
      let changed = false;

      for (let index = 0; index < imageUrls.length; index += 1) {
        if (remainingLimit.value <= 0) break;
        if (thumbnailPaths[index]) continue;
        processed += 1;
        remainingLimit.value -= 1;
        changed = true;
        if (apply) {
          thumbnailPaths[index] = await uploadThumbnail(supabase, "store-visits", imageUrls[index]);
        } else {
          thumbnailPaths[index] = buildStoreVisitThumbnailPath(imageUrls[index]);
        }
      }

      if (apply && changed) {
        const { error: updateError } = await supabase
          .from("offline_store_visits")
          .update({ image_thumbnail_paths: thumbnailPaths })
          .eq("id", visit.id);
        if (updateError) throw new Error(updateError.message);
      }

      if (remainingLimit.value <= 0) break;
    }

    if (data.length < PAGE_SIZE) break;
  }

  return processed;
}

async function main() {
  if (process.argv.includes("--help")) {
    printHelp();
    return;
  }

  const apply = process.argv.includes("--apply");
  const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
  const limit = limitArg ? Number(limitArg.slice("--limit=".length)) : Number.POSITIVE_INFINITY;
  const remainingLimit = { value: Number.isFinite(limit) && limit > 0 ? limit : Number.POSITIVE_INFINITY };
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error("Missing Supabase credentials. Set NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY.");
  }

  const supabase = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const offlineVisitImages = await backfillOfflineVisitImages({ supabase, apply, remainingLimit });
  const legacyVisitImages = await backfillLegacyVisitImages({ supabase, apply, remainingLimit });

  console.log(JSON.stringify({
    apply,
    offline_visit_images: offlineVisitImages,
    image_thumbnail_paths: legacyVisitImages,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

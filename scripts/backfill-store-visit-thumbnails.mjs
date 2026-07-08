import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

const THUMBNAIL_CONTENT_TYPE = "image/jpeg";
const THUMBNAIL_MAX_SIDE = 512;
const THUMBNAIL_QUALITY = 72;
const PAGE_SIZE = 100;
const CONCURRENCY = 5;

function logProgress(label, processed, remainingLimit) {
  if (processed > 0 && processed % 50 === 0) {
    console.error(`[${label}] processed ${processed}, remaining limit ${Number.isFinite(remainingLimit.value) ? remainingLimit.value : "unlimited"}`);
  }
}

async function mapWithConcurrency(items, concurrency, worker) {
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const item = items[nextIndex];
      nextIndex += 1;
      await worker(item);
    }
  });
  await Promise.all(workers);
}

function printHelp() {
  console.log(`Usage: node scripts/backfill-store-visit-thumbnails.mjs [--apply] [--replace-webp] [--replace-corrupt] [--limit=N] [--visit-code=CODE] [--visit-id=UUID]

Environment:
  NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY

Behavior:
  Without --apply, prints a dry-run summary only.
  With --apply, backfills missing thumbnail_path and image_thumbnail_paths.
  With --replace-webp, also regenerates existing .webp thumbnails as .jpg.
  With --replace-corrupt, also regenerates existing thumbnails that are not valid JPEG files.
  With --visit-code or --visit-id, limits the run to one visit.`);
}

function buildStoreVisitThumbnailPath(originalPath) {
  const slashIndex = originalPath.lastIndexOf("/");
  const directory = slashIndex >= 0 ? originalPath.slice(0, slashIndex) : "";
  const fileName = slashIndex >= 0 ? originalPath.slice(slashIndex + 1) : originalPath;
  const baseName = fileName.replace(/\.[^.]+$/, "");
  return `${directory}/thumbnails/${baseName}.jpg`;
}

function shouldReplaceThumbnailPath(path, replaceWebp) {
  return !path || (replaceWebp && String(path).toLowerCase().endsWith(".webp"));
}

function isValidJpegBuffer(buffer) {
  return buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8;
}

function toStorageUploadBody(buffer, contentType) {
  return new Blob([new Uint8Array(buffer)], { type: contentType });
}

async function assertValidStoreVisitThumbnail(buffer) {
  if (!isValidJpegBuffer(buffer)) {
    throw new Error("Generated thumbnail is not a valid JPEG");
  }
  const metadata = await sharp(buffer, { failOn: "error" }).metadata();
  if (metadata.format !== "jpeg" || !metadata.width || !metadata.height) {
    throw new Error("Generated thumbnail metadata is invalid");
  }
}

async function createStoreVisitThumbnail(bytes) {
  const thumbnail = sharp(bytes, { failOn: "none" })
    .rotate()
    .resize(THUMBNAIL_MAX_SIDE, THUMBNAIL_MAX_SIDE, {
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: THUMBNAIL_QUALITY, mozjpeg: true });
  const buffer = await thumbnail.toBuffer();
  await assertValidStoreVisitThumbnail(buffer);
  return buffer;
}

async function downloadBytes(supabase, bucket, path) {
  const result = await supabase.storage.from(bucket).download(path);
  if (result.error || !result.data) {
    throw new Error(result.error?.message ?? `Unable to download ${bucket}:${path}`);
  }
  return Buffer.from(await result.data.arrayBuffer());
}

async function createThumbnailFromPath(supabase, bucket, path) {
  const bytes = await downloadBytes(supabase, bucket, path);
  return createStoreVisitThumbnail(bytes);
}

async function uploadThumbnail(supabase, bucket, originalPath, existingThumbnailPath = null) {
  const thumbnailPath = buildStoreVisitThumbnailPath(originalPath);
  let thumbnailBuffer;
  try {
    thumbnailBuffer = await createThumbnailFromPath(supabase, bucket, originalPath);
  } catch (error) {
    if (!existingThumbnailPath || !String(existingThumbnailPath).toLowerCase().endsWith(".webp")) {
      throw error;
    }
    thumbnailBuffer = await createThumbnailFromPath(supabase, bucket, existingThumbnailPath);
  }
  const uploadResult = await supabase.storage.from(bucket).upload(thumbnailPath, toStorageUploadBody(thumbnailBuffer, THUMBNAIL_CONTENT_TYPE), {
    contentType: THUMBNAIL_CONTENT_TYPE,
    upsert: true,
  });
  if (uploadResult.error) {
    throw new Error(uploadResult.error.message);
  }
  return thumbnailPath;
}

async function shouldRepairThumbnail({ supabase, bucket, thumbnailPath, replaceWebp, replaceCorrupt }) {
  if (shouldReplaceThumbnailPath(thumbnailPath, replaceWebp)) return true;
  if (!replaceCorrupt || !thumbnailPath) return false;
  try {
    const bytes = await downloadBytes(supabase, bucket, thumbnailPath);
    return !isValidJpegBuffer(bytes);
  } catch {
    return true;
  }
}

async function resolveVisitId(supabase, visitCode, visitIdArg) {
  if (visitIdArg) return visitIdArg;
  if (!visitCode) return null;
  const { data, error } = await supabase
    .from("offline_store_visits")
    .select("id")
    .eq("visit_code", visitCode)
    .single();
  if (error || !data?.id) throw new Error(error?.message ?? `Visit ${visitCode} not found`);
  return data.id;
}

async function backfillOfflineVisitImages({ supabase, apply, replaceWebp, replaceCorrupt, remainingLimit, visitId, failures }) {
  let processed = 0;
  let from = 0;
  const failedIds = new Set();
  const filter = replaceWebp
    ? "thumbnail_path.is.null,thumbnail_path.eq.,thumbnail_path.like.%.webp"
    : "thumbnail_path.is.null,thumbnail_path.eq.";

  while (remainingLimit.value > 0) {
    const pageStart = apply && !replaceCorrupt ? 0 : from;
    let query = supabase
      .from("offline_visit_images")
      .select("id,image_path,thumbnail_path")
      .order("created_at", { ascending: true });
    if (!replaceCorrupt) query = query.or(filter);
    if (visitId) query = query.eq("visit_id", visitId);
    const { data: rawData, error } = await query.range(pageStart, pageStart + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const data = (rawData ?? []).filter((image) => !failedIds.has(image.id));
    if (!data?.length) break;

    await mapWithConcurrency(data, CONCURRENCY, async (image) => {
      if (remainingLimit.value <= 0) return;
      try {
        const needsRepair = await shouldRepairThumbnail({
          supabase,
          bucket: "offline-visit-images",
          thumbnailPath: image.thumbnail_path,
          replaceWebp,
          replaceCorrupt,
        });
        if (!needsRepair) return;
        if (remainingLimit.value <= 0) return;
        processed += 1;
        remainingLimit.value -= 1;
        if (!apply) return;
        logProgress("offline_visit_images", processed, remainingLimit);
        const thumbnailPath = await uploadThumbnail(supabase, "offline-visit-images", image.image_path, image.thumbnail_path);
        const { error: updateError } = await supabase
          .from("offline_visit_images")
          .update({ thumbnail_path: thumbnailPath })
          .eq("id", image.id);
        if (updateError) throw new Error(updateError.message);
      } catch (error) {
        failedIds.add(image.id);
        failures.push({
          scope: "offline_visit_images",
          id: image.id,
          path: image.image_path,
          error: error instanceof Error ? error.message : String(error),
        });
        console.error(`[offline_visit_images] skipped ${image.id}: ${error instanceof Error ? error.message : String(error)}`);
      }
    });

    if ((rawData ?? []).length < PAGE_SIZE) break;
    if (replaceCorrupt || !apply) from += PAGE_SIZE;
  }

  return processed;
}

async function backfillLegacyVisitImages({ supabase, apply, replaceWebp, replaceCorrupt, remainingLimit, visitId, failures }) {
  let processed = 0;
  let from = 0;

  while (remainingLimit.value > 0) {
    let query = supabase
      .from("offline_store_visits")
      .select("id,image_urls,image_thumbnail_paths")
      .not("image_urls", "is", null)
      .order("created_at", { ascending: true });
    if (visitId) query = query.eq("id", visitId);
    const { data, error } = await query.range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    if (!data?.length) break;

    for (const visit of data) {
      const imageUrls = Array.isArray(visit.image_urls) ? visit.image_urls : [];
      if (imageUrls.length === 0) continue;
      const thumbnailPaths = Array.isArray(visit.image_thumbnail_paths) ? [...visit.image_thumbnail_paths] : [];
      let changed = false;

      for (let index = 0; index < imageUrls.length; index += 1) {
        if (remainingLimit.value <= 0) break;
        const needsRepair = await shouldRepairThumbnail({
          supabase,
          bucket: "store-visits",
          thumbnailPath: thumbnailPaths[index],
          replaceWebp,
          replaceCorrupt,
        });
        if (!needsRepair) continue;
        processed += 1;
        remainingLimit.value -= 1;
        if (apply) logProgress("image_thumbnail_paths", processed, remainingLimit);
        if (apply) {
          try {
            thumbnailPaths[index] = await uploadThumbnail(supabase, "store-visits", imageUrls[index], thumbnailPaths[index]);
            changed = true;
          } catch (error) {
            failures.push({
              scope: "image_thumbnail_paths",
              id: visit.id,
              path: imageUrls[index],
              error: error instanceof Error ? error.message : String(error),
            });
            console.error(`[image_thumbnail_paths] skipped ${visit.id}:${index}: ${error instanceof Error ? error.message : String(error)}`);
          }
        } else {
          thumbnailPaths[index] = buildStoreVisitThumbnailPath(imageUrls[index]);
          changed = true;
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
    from += PAGE_SIZE;
  }

  return processed;
}

async function main() {
  if (process.argv.includes("--help")) {
    printHelp();
    return;
  }

  const apply = process.argv.includes("--apply");
  const replaceWebp = process.argv.includes("--replace-webp");
  const replaceCorrupt = process.argv.includes("--replace-corrupt");
  const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
  const visitCodeArg = process.argv.find((arg) => arg.startsWith("--visit-code="));
  const visitIdArg = process.argv.find((arg) => arg.startsWith("--visit-id="));
  const visitCode = visitCodeArg ? visitCodeArg.slice("--visit-code=".length).trim() : null;
  const visitIdInput = visitIdArg ? visitIdArg.slice("--visit-id=".length).trim() : null;
  const limit = limitArg ? Number(limitArg.slice("--limit=".length)) : Number.POSITIVE_INFINITY;
  const remainingLimit = { value: Number.isFinite(limit) && limit > 0 ? limit : Number.POSITIVE_INFINITY };
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error("Missing Supabase credentials. Set NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY.");
  }

  const supabase = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const visitId = await resolveVisitId(supabase, visitCode, visitIdInput);
  const failures = [];
  const offlineVisitImages = await backfillOfflineVisitImages({ supabase, apply, replaceWebp, replaceCorrupt, remainingLimit, visitId, failures });
  const legacyVisitImages = await backfillLegacyVisitImages({ supabase, apply, replaceWebp, replaceCorrupt, remainingLimit, visitId, failures });

  console.log(JSON.stringify({
    apply,
    replace_webp: replaceWebp,
    replace_corrupt: replaceCorrupt,
    visit_code: visitCode,
    visit_id: visitId,
    offline_visit_images: offlineVisitImages,
    image_thumbnail_paths: legacyVisitImages,
    failures,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

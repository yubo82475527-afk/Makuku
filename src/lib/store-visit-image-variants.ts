import sharp from "sharp";

const thumbnailMaxSide = 512;
const thumbnailQuality = 72;

export const storeVisitThumbnailContentType = "image/jpeg";

export function buildStoreVisitThumbnailPath(originalPath: string) {
  const slashIndex = originalPath.lastIndexOf("/");
  const directory = slashIndex >= 0 ? originalPath.slice(0, slashIndex) : "";
  const fileName = slashIndex >= 0 ? originalPath.slice(slashIndex + 1) : originalPath;
  const baseName = fileName.replace(/\.[^.]+$/, "");
  return `${directory}/thumbnails/${baseName}.jpg`;
}

export async function createStoreVisitThumbnail(input: { bytes: Buffer }) {
  const normalized = sharp(input.bytes, { failOn: "none" }).rotate();
  const thumbnail = normalized
    .resize(thumbnailMaxSide, thumbnailMaxSide, {
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: thumbnailQuality, mozjpeg: true });
  const metadata = await thumbnail.metadata();

  return {
    buffer: await thumbnail.toBuffer(),
    contentType: storeVisitThumbnailContentType,
    width: metadata.width ?? null,
    height: metadata.height ?? null,
  };
}

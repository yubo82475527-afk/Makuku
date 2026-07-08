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

export function isValidJpegBuffer(buffer: Buffer) {
  return buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8;
}

export function toStorageUploadBody(buffer: Buffer, contentType: string) {
  return new Blob([new Uint8Array(buffer)], { type: contentType });
}

export async function assertValidStoreVisitThumbnail(buffer: Buffer) {
  if (!isValidJpegBuffer(buffer)) {
    throw new Error("Generated thumbnail is not a valid JPEG");
  }
  const metadata = await sharp(buffer, { failOn: "error" }).metadata();
  if (metadata.format !== "jpeg" || !metadata.width || !metadata.height) {
    throw new Error("Generated thumbnail metadata is invalid");
  }
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
  const buffer = await thumbnail.toBuffer();
  await assertValidStoreVisitThumbnail(buffer);

  return {
    buffer,
    contentType: storeVisitThumbnailContentType,
    width: metadata.width ?? null,
    height: metadata.height ?? null,
  };
}

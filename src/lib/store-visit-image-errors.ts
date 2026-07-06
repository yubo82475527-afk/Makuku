const supportedStoreVisitImageMimeTypes = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
] as const;

const supportedStoreVisitImageExtensions = [".jpg", ".jpeg", ".png", ".gif", ".webp"] as const;

const supportedStoreVisitImageFormatLabel = "JPG/PNG/WebP/GIF";

function normalizeText(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase();
}

function getFileExtension(fileName: string | null | undefined) {
  const normalized = String(fileName ?? "").trim().toLowerCase();
  const match = normalized.match(/\.[a-z0-9]+$/i);
  return match?.[0] ?? "";
}

export function isSupportedStoreVisitImageFile(input: {
  contentType?: string | null;
  fileName?: string | null;
}) {
  const contentType = normalizeText(input.contentType);
  const extension = getFileExtension(input.fileName);
  if (supportedStoreVisitImageMimeTypes.includes(contentType as (typeof supportedStoreVisitImageMimeTypes)[number])) {
    return true;
  }
  return supportedStoreVisitImageExtensions.includes(extension as (typeof supportedStoreVisitImageExtensions)[number]);
}

export function unsupportedStoreVisitImageFormatMessage(fileName?: string | null) {
  const extension = getFileExtension(fileName);
  if (extension === ".heic") {
    return `Unsupported image format: HEIC. Please upload ${supportedStoreVisitImageFormatLabel}.`;
  }
  return `Unsupported image format. Please upload ${supportedStoreVisitImageFormatLabel}.`;
}

export function summarizeStoreVisitImageError(input: {
  error?: string | null;
  contentType?: string | null;
  fileName?: string | null;
}) {
  const rawError = String(input.error ?? "").trim();
  if (!rawError) return "";
  if (!isSupportedStoreVisitImageFile({ contentType: input.contentType, fileName: input.fileName })) {
    return unsupportedStoreVisitImageFormatMessage(input.fileName);
  }

  const normalizedError = rawError.toLowerCase();
  if (
    normalizedError.includes("supported image formats")
    || normalizedError.includes("does not represent a valid image")
    || normalizedError.includes("invalid_request_error")
    || normalizedError.includes("invalid_value")
  ) {
    return unsupportedStoreVisitImageFormatMessage(input.fileName);
  }

  return rawError;
}

export {
  supportedStoreVisitImageFormatLabel,
  supportedStoreVisitImageMimeTypes,
};

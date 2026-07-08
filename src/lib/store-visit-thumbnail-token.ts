import crypto from "crypto";

const thumbnailTokenMaxAgeSeconds = 60 * 60;

type ThumbnailTokenPayload = {
  visitId: string;
  imageId: string;
  thumbnailPath: string;
  exp: number;
};

function tokenSecret() {
  if (process.env.APP_SESSION_SECRET) return process.env.APP_SESSION_SECRET;
  if (process.env.NODE_ENV === "production") throw new Error("Missing APP_SESSION_SECRET");
  return "makuku-local-dev-session-secret";
}

function base64url(input: Buffer | string) {
  return Buffer.from(input).toString("base64url");
}

function sign(payload: string) {
  return crypto.createHmac("sha256", tokenSecret()).update(payload).digest("base64url");
}

export function createStoreVisitThumbnailToken(input: {
  visitId: string;
  imageId: string;
  thumbnailPath: string;
}) {
  const payload: ThumbnailTokenPayload = {
    ...input,
    exp: Math.floor(Date.now() / 1000) + thumbnailTokenMaxAgeSeconds,
  };
  const encoded = base64url(JSON.stringify(payload));
  return `${encoded}.${sign(encoded)}`;
}

export function readStoreVisitThumbnailToken(token: string | null | undefined): ThumbnailTokenPayload | null {
  if (!token) return null;
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature || sign(encoded) !== signature) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as ThumbnailTokenPayload;
    if (!payload.visitId || !payload.imageId || !payload.thumbnailPath || !payload.exp) return null;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

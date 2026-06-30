const defaultBaseUrl = "http://42.192.63.2:8080/cloudhub";

function clean(value: string | null | undefined) {
  return typeof value === "string" ? value.trim() : "";
}

export function externalMdConfig() {
  const baseUrl = clean(process.env.EXTERNAL_MD_API_BASE_URL) || defaultBaseUrl;
  const accessKey = clean(process.env.EXTERNAL_MD_ACCESS_KEY);
  const accessSecret = clean(process.env.EXTERNAL_MD_ACCESS_SECRET);
  const tenantId = clean(process.env.EXTERNAL_MD_TENANT_ID);

  if (!accessKey || !accessSecret || !tenantId) {
    throw new Error("External MD API is not configured");
  }

  return { baseUrl, accessKey, accessSecret, tenantId };
}

export function buildExternalMdHeaders() {
  const config = externalMdConfig();
  return {
    AccessKey: config.accessKey,
    AccessSecret: config.accessSecret,
    tenantId: config.tenantId,
  };
}

export function cleanPageNumber(value: string | null, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.floor(parsed));
}

export function cleanPageSize(value: string | null, fallback = 10) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(50, Math.floor(parsed)));
}

export async function proxyExternalMdJson(pathname: string, params: URLSearchParams) {
  const { baseUrl } = externalMdConfig();
  const url = new URL(pathname, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
  url.search = params.toString();

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: buildExternalMdHeaders(),
    cache: "no-store",
  });
  const data = (await response.json().catch(() => ({}))) as {
    isSuccess?: boolean;
    code?: number;
    message?: string;
    data?: unknown;
  };

  if (!response.ok || data.code !== 200 || data.isSuccess === false) {
    const message = typeof data.message === "string" && data.message.trim() ? data.message.trim() : "External MD API request failed";
    throw new Error(message);
  }

  return data.data;
}

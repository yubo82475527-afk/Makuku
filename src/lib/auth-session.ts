import crypto from "crypto";
import { createSupabaseServiceClient } from "@/lib/supabase";

export const appSessionCookieName = "app_session";
const sessionMaxAgeSeconds = 60 * 60 * 24 * 7;
const allowedAdminRoles = new Set(["manager", "admin"]);

export type AppSession = {
  id: string;
  username?: string;
  displayName: string;
  role: string;
  exp: number;
};

type AuthResult = { session: AppSession; response: null } | { session: null; response: Response };

export function isAllowedAdminRole(role: string | null | undefined) {
  return allowedAdminRoles.has(String(role ?? ""));
}

function sessionSecret() {
  if (process.env.APP_SESSION_SECRET) return process.env.APP_SESSION_SECRET;
  if (process.env.NODE_ENV === "production") throw new Error("Missing APP_SESSION_SECRET");
  return "makuku-local-dev-session-secret";
}

function base64url(input: Buffer | string) {
  return Buffer.from(input).toString("base64url");
}

function sign(payload: string) {
  return crypto.createHmac("sha256", sessionSecret()).update(payload).digest("base64url");
}

function cookieBaseOptions() {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `Path=/; HttpOnly; SameSite=Lax${secure}`;
}

export function createSessionToken(input: Omit<AppSession, "exp">) {
  const payload: AppSession = {
    ...input,
    exp: Math.floor(Date.now() / 1000) + sessionMaxAgeSeconds,
  };
  const encoded = base64url(JSON.stringify(payload));
  return `${encoded}.${sign(encoded)}`;
}

export function createSessionCookie(input: Omit<AppSession, "exp">) {
  return `${appSessionCookieName}=${createSessionToken(input)}; Max-Age=${sessionMaxAgeSeconds}; ${cookieBaseOptions()}`;
}

export function clearSessionCookie() {
  return `${appSessionCookieName}=; Max-Age=0; ${cookieBaseOptions()}`;
}

export function parseCookieHeader(cookieHeader: string | null | undefined) {
  const cookies = new Map<string, string>();
  for (const part of String(cookieHeader ?? "").split(";")) {
    const [rawName, ...rawValue] = part.trim().split("=");
    if (!rawName) continue;
    cookies.set(rawName, rawValue.join("="));
  }
  return cookies;
}

export function readSessionToken(token: string | null | undefined): AppSession | null {
  if (!token) return null;
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature || sign(encoded) !== signature) return null;
  try {
    const session = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as AppSession;
    if (!session.id || !session.displayName || !session.role || !session.exp) return null;
    if (session.exp < Math.floor(Date.now() / 1000)) return null;
    return session;
  } catch {
    return null;
  }
}

export function readSessionFromRequest(request: Request) {
  const token = parseCookieHeader(request.headers.get("cookie")).get(appSessionCookieName);
  return readSessionToken(token);
}

export function authFailure(message: string, status = 401) {
  return Response.json({ error: message }, { status });
}

async function isEnabledAppUser(session: AppSession) {
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("app_users")
    .select("id,role,status")
    .eq("id", session.id)
    .single();
  if (error || !data) return false;
  return data.status !== "disabled" && data.role === session.role;
}

export async function requireAppSession(request: Request): Promise<AuthResult> {
  const session = readSessionFromRequest(request);
  if (!session) return { session: null, response: authFailure("Authentication required", 401) };
  if (!(await isEnabledAppUser(session))) return { session: null, response: authFailure("Session is no longer valid", 401) };
  return { session, response: null };
}

export async function requireAdminSession(request: Request): Promise<AuthResult> {
  const auth = await requireAppSession(request);
  if (auth.response) return auth;
  if (!isAllowedAdminRole(auth.session.role)) {
    return { session: null, response: authFailure("Manager or admin account required", 403) };
  }
  return auth;
}

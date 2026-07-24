import crypto from "crypto";
import { cookies } from "next/headers";
import type { PageKey } from "@/lib/page-permissions";
import { isSystemAdminRole } from "@/lib/page-permissions";
import { loadRoleAccess, roleCanAccessPc, roleHasPagePermission } from "@/lib/role-access";
import { createSupabaseServiceClient } from "@/lib/supabase";

export const appSessionCookieName = "app_session";
const sessionMaxAgeSeconds = 60 * 60 * 24 * 7;

/** Legacy sync check used by older call sites; prefer async roleCanAccessPc / roleHasPagePermission. */
const legacyPcRoles = new Set(["manager", "admin"]);

export type AppSession = {
  id: string;
  username?: string;
  displayName: string;
  role: string;
  exp: number;
};

type AuthResult = { session: AppSession; response: null } | { session: null; response: Response };

export function isAllowedAdminRole(role: string | null | undefined) {
  return legacyPcRoles.has(String(role ?? "")) || isSystemAdminRole(role);
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

export async function readSessionFromCookies() {
  const cookieStore = await cookies();
  return readSessionToken(cookieStore.get(appSessionCookieName)?.value);
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

/** PC console session: any role with at least one page permission. */
export async function requireAdminSession(request: Request): Promise<AuthResult> {
  const auth = await requireAppSession(request);
  if (auth.response) return auth;
  if (!(await roleCanAccessPc(auth.session.role))) {
    return { session: null, response: authFailure("PC console access required", 403) };
  }
  return auth;
}

export async function requirePagePermission(request: Request, pageKey: PageKey): Promise<AuthResult> {
  const auth = await requireAppSession(request);
  if (auth.response) return auth;
  if (!(await roleHasPagePermission(auth.session.role, pageKey))) {
    return { session: null, response: authFailure("Page permission required", 403) };
  }
  return auth;
}

export async function requireSystemAdminSession(request: Request): Promise<AuthResult> {
  const auth = await requireAppSession(request);
  if (auth.response) return auth;
  if (!isSystemAdminRole(auth.session.role)) {
    return { session: null, response: authFailure("Admin account required", 403) };
  }
  return auth;
}

export async function sessionPageKeys(session: AppSession | null | undefined): Promise<PageKey[]> {
  if (!session) return [];
  const access = await loadRoleAccess(session.role);
  return access?.pages ?? [];
}

import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const proxyFile = existsSync("proxy.ts") ? readFileSync("proxy.ts", "utf8") : "";
const authSession = existsSync("src/lib/auth-session.ts") ? readFileSync("src/lib/auth-session.ts", "utf8") : "";
const loginPage = existsSync("src/app/[locale]/login/page.tsx") ? readFileSync("src/app/[locale]/login/page.tsx", "utf8") : "";
const loginClient = existsSync("src/components/pc-login-form.tsx") ? readFileSync("src/components/pc-login-form.tsx", "utf8") : "";
const loginRoute = readFileSync("src/app/api/auth/login/route.ts", "utf8");
const logoutRoute = existsSync("src/app/api/auth/logout/route.ts") ? readFileSync("src/app/api/auth/logout/route.ts", "utf8") : "";
const appShell = readFileSync("src/components/app-shell.tsx", "utf8");

const protectedRoutes = [
  "src/app/api/price-snapshots/route.ts",
  "src/app/api/offline-stores/route.ts",
  "src/app/api/app-users/route.ts",
  "src/app/api/market-benchmarks/route.ts",
  "src/app/api/sku-matches/route.ts",
  "src/app/api/competitors/route.ts",
  "src/app/api/ai-price-candidates/bulk-review/route.ts",
  "src/app/api/ai-price-candidates/[id]/route.ts",
];

test("PC admin session helpers sign HttpOnly cookies and restrict admin roles", () => {
  assert.match(authSession, /app_session/);
  assert.match(authSession, /APP_SESSION_SECRET/);
  assert.match(authSession, /createSessionCookie/);
  assert.match(authSession, /clearSessionCookie/);
  assert.match(authSession, /readSessionFromRequest/);
  assert.match(authSession, /requireAdminSession/);
  assert.match(authSession, /requireAppSession/);
  assert.match(authSession, /manager/);
  assert.match(authSession, /admin/);
  assert.match(authSession, /HttpOnly/);
  assert.match(authSession, /SameSite=Lax/);
});

test("PC login page and auth APIs establish and clear server sessions", () => {
  assert.match(loginPage, /PcLoginForm/);
  assert.match(loginClient, /\/api\/auth\/login/);
  assert.match(loginClient, /next/);
  assert.match(loginRoute, /createSessionCookie/);
  assert.match(loginRoute, /Set-Cookie/);
  assert.match(loginRoute, /role: user\.role/);
  assert.match(logoutRoute, /clearSessionCookie/);
  assert.match(appShell, /\/api\/auth\/session/);
  assert.match(appShell, /\/api\/auth\/logout/);
});

test("proxy protects PC backend pages but leaves H5 capture public", () => {
  assert.match(proxyFile, /export async function proxy/);
  assert.match(proxyFile, /readSessionFromRequest/);
  assert.match(proxyFile, /\/login/);
  assert.match(proxyFile, /dashboard/);
  assert.match(proxyFile, /prices/);
  assert.match(proxyFile, /offline-price-candidates/);
  assert.match(proxyFile, /offline-stores/);
  assert.match(proxyFile, /market-benchmarks/);
  assert.match(proxyFile, /mobile\/offline-capture/);
  assert.match(proxyFile, /isPcProtectedPath/);
  assert.match(proxyFile, /isAllowedAdminRole/);
});

test("critical PC write APIs require manager or admin session", () => {
  for (const routePath of protectedRoutes) {
    const route = readFileSync(routePath, "utf8");
    assert.match(route, /requireAdminSession/, `${routePath} should require admin session`);
    assert.match(route, /auth\.response/, `${routePath} should return auth failure response`);
  }
});

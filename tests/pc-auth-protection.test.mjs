import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const proxyFile = existsSync("proxy.ts") ? readFileSync("proxy.ts", "utf8") : "";
const authSession = existsSync("src/lib/auth-session.ts") ? readFileSync("src/lib/auth-session.ts", "utf8") : "";
const loginPage = existsSync("src/app/[locale]/login/page.tsx") ? readFileSync("src/app/[locale]/login/page.tsx", "utf8") : "";
const loginClient = existsSync("src/components/pc-login-form.tsx") ? readFileSync("src/components/pc-login-form.tsx", "utf8") : "";
const mobileFeishuAutoLogin = existsSync("src/components/mobile-feishu-auto-login.tsx") ? readFileSync("src/components/mobile-feishu-auto-login.tsx", "utf8") : "";
const mobileCapturePage = existsSync("src/app/[locale]/mobile/offline-capture/page.tsx") ? readFileSync("src/app/[locale]/mobile/offline-capture/page.tsx", "utf8") : "";
const mobileCaptureListPage = existsSync("src/app/[locale]/mobile/offline-capture/list/page.tsx") ? readFileSync("src/app/[locale]/mobile/offline-capture/list/page.tsx", "utf8") : "";
const mobileCaptureNewPage = existsSync("src/app/[locale]/mobile/offline-capture/new/page.tsx") ? readFileSync("src/app/[locale]/mobile/offline-capture/new/page.tsx", "utf8") : "";
const asyncUiHelper = existsSync("src/lib/async-ui.ts") ? readFileSync("src/lib/async-ui.ts", "utf8") : "";
const loginRoute = readFileSync("src/app/api/auth/login/route.ts", "utf8");
const feishuLoginRoute = existsSync("src/app/api/auth/feishu-login/route.ts") ? readFileSync("src/app/api/auth/feishu-login/route.ts", "utf8") : "";
const logoutRoute = existsSync("src/app/api/auth/logout/route.ts") ? readFileSync("src/app/api/auth/logout/route.ts", "utf8") : "";
const appShell = readFileSync("src/components/app-shell.tsx", "utf8");

const protectedRoutes = [
  "src/app/api/price-snapshots/route.ts",
  "src/app/api/offline-stores/route.ts",
  "src/app/api/app-users/route.ts",
  "src/app/api/competitor-series-matches/route.ts",
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

test("PC login page supports Feishu in-app passwordless login", () => {
  assert.match(loginClient, /NEXT_PUBLIC_FEISHU_APP_ID/);
  assert.match(loginClient, /requestAccess/);
  assert.match(loginClient, /scopeList:\s*\[\]/);
  assert.match(loginClient, /appID:\s*feishuAppId/);
  assert.match(loginClient, /\/api\/auth\/feishu-login/);
  assert.match(loginClient, /startFeishuLogin/);
});

test("H5 capture entry auto-attempts Feishu login and still uses the shared session API", () => {
  assert.match(mobileFeishuAutoLogin, /NEXT_PUBLIC_FEISHU_APP_ID/);
  assert.match(mobileFeishuAutoLogin, /requestAccess/);
  assert.match(mobileFeishuAutoLogin, /scopeList:\s*\[\]/);
  assert.match(mobileFeishuAutoLogin, /\/api\/auth\/feishu-login/);
  assert.match(mobileFeishuAutoLogin, /mobile_h5/);
  assert.match(mobileFeishuAutoLogin, /makuku_app_user/);
  assert.match(mobileFeishuAutoLogin, /withMinimumDelay/);
  assert.match(asyncUiHelper, /withMinimumDelay/);
  assert.match(mobileFeishuAutoLogin, /LoadingOverlay/);
  assert.match(mobileFeishuAutoLogin, /payload\.error/);
  assert.match(mobileFeishuAutoLogin, /setError/);
  assert.match(mobileFeishuAutoLogin, /\/api\/auth\/session/);
  assert.match(mobileFeishuAutoLogin, /clearUser/);
  assert.match(mobileFeishuAutoLogin, /Connecting to Feishu|正在连接飞书/);
  assert.match(mobileFeishuAutoLogin, /Verifying your account|正在验证身份/);
  assert.match(mobileFeishuAutoLogin, /Entering the app|正在进入系统/);
  assert.match(mobileCapturePage, /MobileFeishuAutoLogin/);
  assert.match(mobileCaptureListPage, /MobileFeishuAutoLogin/);
  assert.match(mobileCaptureNewPage, /MobileFeishuAutoLogin/);
});

test("Feishu login API exchanges auth code for user info and creates app session", () => {
  assert.match(feishuLoginRoute, /authen\/v2\/oauth\/token/);
  assert.match(feishuLoginRoute, /authen\/v1\/user_info/);
  assert.match(feishuLoginRoute, /FEISHU_APP_ID/);
  assert.match(feishuLoginRoute, /FEISHU_APP_SECRET/);
  assert.match(feishuLoginRoute, /feishu_user_id/);
  assert.match(feishuLoginRoute, /open_id/);
  assert.match(feishuLoginRoute, /mobile_h5/);
  assert.match(feishuLoginRoute, /FEISHU_H5_AUTO_PROVISION_ENABLED/);
  assert.match(feishuLoginRoute, /password_login_enabled/);
  assert.match(feishuLoginRoute, /field_agent/);
  assert.match(feishuLoginRoute, /replace_user_organization_members/);
  assert.match(feishuLoginRoute, /from\("organizations"\)/);
  assert.match(feishuLoginRoute, /\.eq\("status", "active"\)/);
  assert.doesNotMatch(feishuLoginRoute, /\.insert\(\{\s*name,\s*status: "active"/s);
  assert.match(feishuLoginRoute, /Failed to read existing user/);
  assert.match(feishuLoginRoute, /findAppUserByEmail/);
  assert.match(feishuLoginRoute, /bindFeishuOpenIdToExistingUser/);
  assert.match(feishuLoginRoute, /updateFeishuOrgMismatch/);
  assert.match(feishuLoginRoute, /Multiple local users share this email/);
  assert.match(feishuLoginRoute, /status.*disabled|disabled.*status/s);
  assert.match(feishuLoginRoute, /createSessionCookie/);
  assert.match(feishuLoginRoute, /Set-Cookie/);
  assert.match(feishuLoginRoute, /password_hash/);
});

test("Feishu helper supports tenant directory and department lookup", () => {
  assert.match(readFileSync("src/lib/feishu.ts", "utf8"), /tenant_access_token\/internal/);
  assert.match(readFileSync("src/lib/feishu.ts", "utf8"), /contact\/v3\/users\/batch_get_id/);
  assert.match(readFileSync("src/lib/feishu.ts", "utf8"), /contact\/v3\/users\//);
  assert.match(readFileSync("src/lib/feishu.ts", "utf8"), /contact\/v3\/departments\/batch/);
});

test("proxy protects PC backend pages but leaves H5 capture public", () => {
  assert.match(proxyFile, /export async function proxy/);
  assert.match(proxyFile, /readSessionFromRequest/);
  assert.match(proxyFile, /\/login/);
  assert.match(proxyFile, /dashboard/);
  assert.match(proxyFile, /prices/);
  assert.match(proxyFile, /offline-price-candidates/);
  assert.match(proxyFile, /offline-stores/);
  assert.doesNotMatch(proxyFile, /market-benchmarks/);
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

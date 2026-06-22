import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const configFile = readFileSync("src/lib/i18n/config.ts", "utf8");
const appHome = readFileSync("src/app/page.tsx", "utf8");
const rootProxy = existsSync("proxy.ts") ? readFileSync("proxy.ts", "utf8") : "";
const srcProxy = existsSync("src/proxy.ts") ? readFileSync("src/proxy.ts", "utf8") : "";
const mobileLanguageSwitch = readFileSync("src/components/mobile-language-switch.tsx", "utf8");
const storeVisitsListH5 = readFileSync("src/components/store-visits-list-h5.tsx", "utf8");
const appShell = readFileSync("src/components/app-shell.tsx", "utf8");
const mobileFeishuAutoLogin = readFileSync("src/components/mobile-feishu-auto-login.tsx", "utf8");
const mobileCapturePage = readFileSync("src/app/[locale]/mobile/offline-capture/page.tsx", "utf8");
const mobileCaptureNewPage = readFileSync("src/app/[locale]/mobile/offline-capture/new/page.tsx", "utf8");
const localePreference = existsSync("src/lib/locale-preference.ts") ? readFileSync("src/lib/locale-preference.ts", "utf8") : "";

test("locale preference helper defines a shared makuku locale cookie with en default", () => {
  assert.match(localePreference, /makuku_locale/);
  assert.match(localePreference, /defaultLocale/);
  assert.match(localePreference, /readLocalePreference/);
  assert.match(localePreference, /writeLocalePreferenceCookie/);
  assert.match(localePreference, /resolvePreferredLocale/);
  assert.match(localePreference, /Max-Age=31536000/);
  assert.match(localePreference, /SameSite=Lax/);
  assert.match(configFile, /defaultLocale:\s*Locale = "en"/);
});

test("home and proxy locale routing prefer the locale cookie before defaulting to english", () => {
  assert.match(appHome, /readLocalePreference/);
  assert.match(appHome, /redirect\(`\/\$\{locale\}\/dashboard`\)/);

  assert.match(rootProxy, /readLocalePreference/);
  assert.match(srcProxy, /readLocalePreference/);
  assert.match(rootProxy, /mobile\/offline-capture/);
  assert.match(srcProxy, /mobile\/offline-capture/);
  assert.match(rootProxy, /defaultLocale/);
  assert.match(srcProxy, /defaultLocale/);
  assert.doesNotMatch(appHome, /detectLocaleFromAcceptLanguage/);
  assert.doesNotMatch(srcProxy, /detectLocaleFromAcceptLanguage/);
});

test("external H5 entry pages correct zh urls to the preferred locale", () => {
  assert.match(mobileCapturePage, /readLocalePreference/);
  assert.match(mobileCapturePage, /redirect/);
  assert.match(mobileCapturePage, /replacePathLocale/);
  assert.match(mobileCaptureNewPage, /readLocalePreference/);
  assert.match(mobileCaptureNewPage, /redirect/);
  assert.match(mobileCaptureNewPage, /replacePathLocale/);
});

test("language switches persist the chosen locale for both H5 and PC", () => {
  assert.match(mobileLanguageSwitch, /writeLocalePreferenceCookie/);
  assert.match(mobileLanguageSwitch, /onClick/);
  assert.match(storeVisitsListH5, /writeLocalePreferenceCookie/);
  assert.match(appShell, /writeLocalePreferenceCookie/);
  assert.match(appShell, /replacePathLocale/);
});

test("mobile Feishu auto login uses the corrected locale when building next", () => {
  assert.match(mobileFeishuAutoLogin, /readLocalePreference/);
  assert.match(mobileFeishuAutoLogin, /replacePathLocale/);
  assert.match(mobileFeishuAutoLogin, /next:\s*resolvedNextPath/);
});

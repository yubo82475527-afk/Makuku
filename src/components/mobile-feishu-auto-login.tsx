"use client";

import { Loader2, LogIn } from "lucide-react";
import Script from "next/script";
import { useCallback, useEffect, useRef, useState } from "react";
import { replacePathLocale, type Locale } from "@/lib/i18n/config";
import { withMinimumDelay } from "@/lib/async-ui";
import { LoadingOverlay } from "@/components/loading-overlay";
import { readLocalePreferenceFromCookieHeader } from "@/lib/locale-preference";

declare global {
  interface Window {
    h5sdk?: {
      ready?: (callback: () => void) => void;
      error?: (callback: (error: unknown) => void) => void;
    };
    tt?: {
      requestAccess?: (options: {
        scopeList: string[];
        appID: string;
        success: (result: { code?: string }) => void;
        fail: (error: unknown) => void;
      }) => void;
    };
  }
}

type AppUser = {
  id: string;
  username?: string;
  displayName: string;
  role?: string;
};

const storageKey = "makuku_app_user";

function loadUser() {
  try {
    const raw = window.localStorage.getItem(storageKey);
    return raw ? (JSON.parse(raw) as AppUser) : null;
  } catch {
    return null;
  }
}

function saveUser(user: AppUser) {
  window.localStorage.setItem(storageKey, JSON.stringify(user));
}

function clearUser() {
  window.localStorage.removeItem(storageKey);
}

function isFeishuUserAgent(userAgent: string) {
  return /feishu|lark|ttwebview/i.test(userAgent);
}

export function MobileFeishuAutoLogin({ locale }: { locale: Locale }) {
  const feishuAppId = process.env.NEXT_PUBLIC_FEISHU_APP_ID;
  const [isFeishuContainer] = useState(() => (
    typeof navigator === "undefined" ? false : isFeishuUserAgent(navigator.userAgent)
  ));
  const [feishuReady, setFeishuReady] = useState(false);
  const [feishuSdkLoaded, setFeishuSdkLoaded] = useState(false);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [status, setStatus] = useState<"idle" | "requesting" | "signing_in" | "redirecting">("idle");
  const [error, setError] = useState<string | null>(null);
  const attemptedRef = useRef(false);
  const isZh = locale === "zh";

  const copy = {
    sdkInitFailed: isZh ? "飞书环境初始化失败，请重试。" : "Feishu environment failed to initialize. Please retry.",
    missingCode: isZh ? "未获取到飞书授权码。" : "Did not receive a Feishu authorization code.",
    loginFailed: isZh ? "飞书登录失败，请联系管理员。" : "Feishu sign-in failed. Please contact an administrator.",
    networkFailed: isZh ? "网络异常，飞书登录未完成。" : "Network error. Feishu sign-in did not complete.",
    authFailed: isZh ? "飞书授权失败，请重试。" : "Feishu authorization failed. Please try again.",
    buttonIdle: isZh ? "使用飞书登录" : "Sign in with Feishu",
    buttonLoading: isZh ? "飞书登录中..." : "Signing in with Feishu...",
    overlayConnecting: isZh ? "正在连接飞书..." : "Connecting to Feishu...",
    overlayVerifying: isZh ? "正在验证身份..." : "Verifying your account...",
    overlayEntering: isZh ? "登录成功，正在进入系统..." : "Signed in. Entering the app...",
    overlayHint: isZh ? "请稍候，不要重复点击。" : "Please wait and avoid tapping repeatedly.",
  };

  useEffect(() => {
    if (!isFeishuContainer) return;
    let cancelled = false;

    async function validateExistingSession() {
      try {
        const stored = loadUser();
        if (!stored?.id) {
          if (!cancelled) setSessionChecked(true);
          return;
        }

        const response = await fetch("/api/auth/session", { cache: "no-store" });
        const payload = await response.json().catch(() => ({}));
        if (!cancelled) {
          if (!payload.user?.id) clearUser();
          setSessionChecked(true);
        }
      } catch {
        if (!cancelled) {
          clearUser();
          setSessionChecked(true);
        }
      }
    }

    void validateExistingSession();
    return () => {
      cancelled = true;
    };
  }, [isFeishuContainer]);

  useEffect(() => {
    if (!isFeishuContainer) return;
    if (!feishuSdkLoaded || feishuReady) return;
    if (!window.h5sdk?.ready) {
      const timer = window.setTimeout(() => setFeishuReady(true), 0);
      return () => window.clearTimeout(timer);
    }

    let cancelled = false;
    window.h5sdk.ready(() => {
      if (!cancelled) setFeishuReady(true);
    });
    window.h5sdk.error?.(() => {
      if (!cancelled) setError(copy.sdkInitFailed);
    });

    return () => {
      cancelled = true;
    };
  }, [copy.sdkInitFailed, feishuReady, feishuSdkLoaded, isFeishuContainer]);

  const startFeishuLogin = useCallback(() => {
    if (status !== "idle") return;
    if (!feishuAppId || !window.tt?.requestAccess) {
      setError(copy.sdkInitFailed);
      return;
    }

    setStatus("requesting");
    setError(null);

    window.tt.requestAccess({
      scopeList: [],
      appID: feishuAppId,
      success: async (result) => {
        const code = String(result.code ?? "").trim();
        if (!code) {
          setStatus("idle");
          setError(copy.missingCode);
          return;
        }

        try {
          setStatus("signing_in");
          const preferredLocale = readLocalePreferenceFromCookieHeader(document.cookie);
          const resolvedNextPath = replacePathLocale(`/${locale}/mobile/offline-capture`, preferredLocale ?? locale);
          const response = await withMinimumDelay(fetch("/api/auth/feishu-login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              code,
              next: resolvedNextPath,
              purpose: "mobile_h5",
            }),
          }));
          const payload = await response.json().catch(() => ({}));
          if (!response.ok || !payload.user?.id) {
            setStatus("idle");
            setError(typeof payload.error === "string" && payload.error.trim() ? payload.error : copy.loginFailed);
            return;
          }

          saveUser(payload.user as AppUser);
          setStatus("redirecting");
          window.location.reload();
        } catch {
          setStatus("idle");
          setError(copy.networkFailed);
        }
      },
      fail: () => {
        setStatus("idle");
        setError(copy.authFailed);
      },
    });
  }, [copy.authFailed, copy.loginFailed, copy.missingCode, copy.networkFailed, copy.sdkInitFailed, feishuAppId, locale, status]);

  useEffect(() => {
    if (!isFeishuContainer) return;
    if (!sessionChecked || !feishuReady || attemptedRef.current || !feishuAppId || !window.tt?.requestAccess) return;
    if (loadUser()?.id) return;

    attemptedRef.current = true;
    const timer = window.setTimeout(() => {
      void startFeishuLogin();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [feishuAppId, feishuReady, isFeishuContainer, sessionChecked, startFeishuLogin]);

  if (!feishuAppId || !isFeishuContainer) return null;

  return (
    <>
      {isFeishuContainer && feishuAppId ? (
        <Script
          src="https://lf-scm-cn.feishucdn.com/lark/op/h5-js-sdk-1.5.30.js"
          strategy="afterInteractive"
          onLoad={() => setFeishuSdkLoaded(true)}
        />
      ) : null}
      <LoadingOverlay
        open={status !== "idle"}
        title={
          status === "requesting"
            ? copy.overlayConnecting
            : status === "signing_in"
              ? copy.overlayVerifying
              : copy.overlayEntering
        }
        description={copy.overlayHint}
      />
      <button
        type="button"
        onClick={startFeishuLogin}
        disabled={status !== "idle"}
        className="flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-60"
      >
        {status !== "idle" ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
        {status !== "idle" ? copy.buttonLoading : copy.buttonIdle}
      </button>
      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      ) : null}
    </>
  );
}

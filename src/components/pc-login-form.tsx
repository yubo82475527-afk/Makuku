"use client";

import { Loader2, LogIn } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import Script from "next/script";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Locale } from "@/lib/i18n/config";

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

function isFeishuUserAgent(userAgent: string) {
  return /feishu|lark|ttwebview/i.test(userAgent);
}

export function PcLoginForm({ locale }: { locale: Locale }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || `/${locale}/dashboard`;
  const feishuAppId = process.env.NEXT_PUBLIC_FEISHU_APP_ID;
  const [isFeishuContainer] = useState(() => (
    typeof navigator === "undefined" ? false : isFeishuUserAgent(navigator.userAgent)
  ));
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [feishuLoading, setFeishuLoading] = useState(false);
  const [feishuReady, setFeishuReady] = useState(false);
  const [feishuSdkLoaded, setFeishuSdkLoaded] = useState(false);
  const autoFeishuAttemptedRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const isZh = locale === "zh";

  const copy = {
    feishuLoading: isZh ? "飞书免登中..." : "Signing in with Feishu...",
    feishuCta: isZh ? "使用飞书免登" : "Sign in with Feishu",
    feishuFailed: isZh ? "飞书免登失败，请重试或使用账号密码登录。" : "Feishu sign-in failed. Retry or use password sign-in.",
    sdkInitFailed: isZh ? "飞书环境初始化失败，请重试。" : "Feishu environment failed to initialize. Please retry.",
    credentialsRequired: isZh ? "请输入用户名和密码。" : "Enter username and password.",
    loginFailed: isZh ? "登录失败。" : "Sign-in failed.",
    networkRetry: isZh ? "网络异常，请重试。" : "Network error. Please retry.",
    username: isZh ? "用户名" : "Username",
    password: isZh ? "密码" : "Password",
    submitIdle: isZh ? "登录后台" : "Sign in",
    submitLoading: isZh ? "登录中..." : "Signing in...",
  };

  const redirectAfterLogin = useCallback(() => {
    router.replace(next.startsWith("/") ? next : `/${locale}/dashboard`);
    router.refresh();
  }, [locale, next, router]);

  const startFeishuLogin = useCallback(() => {
    if (!feishuAppId || !feishuReady || !window.tt?.requestAccess) return;
    setFeishuLoading(true);
    setError(copy.feishuLoading);
    window.tt.requestAccess({
      scopeList: [],
      appID: feishuAppId,
      success: async (result) => {
        const code = String(result.code ?? "").trim();
        if (!code) {
          setFeishuLoading(false);
          setError(copy.feishuFailed);
          return;
        }
        try {
          const response = await fetch("/api/auth/feishu-login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ code, next, purpose: "pc_console" }),
          });
          const data = await response.json().catch(() => ({}));
          if (!response.ok) {
            setError(data.error ?? copy.feishuFailed);
            return;
          }
          redirectAfterLogin();
        } catch {
          setError(copy.feishuFailed);
        } finally {
          setFeishuLoading(false);
        }
      },
      fail: () => {
        setFeishuLoading(false);
        setError(copy.feishuFailed);
      },
    });
  }, [copy.feishuFailed, copy.feishuLoading, feishuAppId, feishuReady, next, redirectAfterLogin]);

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

  useEffect(() => {
    if (!isFeishuContainer) return;
    if (!feishuReady || autoFeishuAttemptedRef.current || !feishuAppId || !window.tt?.requestAccess) return;
    autoFeishuAttemptedRef.current = true;
    startFeishuLogin();
  }, [feishuAppId, feishuReady, isFeishuContainer, startFeishuLogin]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!username.trim() || !password) {
      setError(copy.credentialsRequired);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, purpose: "pc_console" }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error ?? copy.loginFailed);
        return;
      }
      redirectAfterLogin();
    } catch {
      setError(copy.networkRetry);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-6 space-y-4">
      {isFeishuContainer && feishuAppId ? (
        <Script
          src="https://lf-scm-cn.feishucdn.com/lark/op/h5-js-sdk-1.5.30.js"
          strategy="afterInteractive"
          onLoad={() => setFeishuSdkLoaded(true)}
        />
      ) : null}
      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      {isFeishuContainer && feishuAppId ? (
        <button
          type="button"
          onClick={startFeishuLogin}
          disabled={feishuLoading || loading || !feishuReady}
          className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-60"
        >
          {feishuLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
          {feishuLoading ? copy.feishuLoading : copy.feishuCta}
        </button>
      ) : null}
      <label className="block text-sm font-medium text-slate-700">
        {copy.username}
        <input
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-slate-500"
          autoComplete="username"
        />
      </label>
      <label className="block text-sm font-medium text-slate-700">
        {copy.password}
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-slate-500"
          autoComplete="current-password"
        />
      </label>
      <button
        type="submit"
        disabled={loading}
        className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
        {loading ? copy.submitLoading : copy.submitIdle}
      </button>
    </form>
  );
}

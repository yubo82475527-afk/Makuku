"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";
import { replacePathLocale, type Locale } from "@/lib/i18n/config";
import { withMinimumDelay } from "@/lib/async-ui";
import { LoadingOverlay } from "@/components/loading-overlay";
import { readLocalePreferenceFromCookieHeader } from "@/lib/locale-preference";

declare global {
  interface Window {
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

export function MobileFeishuAutoLogin({ locale }: { locale: Locale }) {
  const feishuAppId = process.env.NEXT_PUBLIC_FEISHU_APP_ID;
  const [feishuReady, setFeishuReady] = useState(false);
  const [status, setStatus] = useState<"idle" | "requesting" | "signing_in" | "redirecting">("idle");
  const [error, setError] = useState<string | null>(null);
  const attemptedRef = useRef(false);
  const isZh = locale === "zh";

  useEffect(() => {
    if (!feishuReady || attemptedRef.current || !feishuAppId || !window.tt?.requestAccess) return;
    if (loadUser()?.id) return;

    attemptedRef.current = true;

    const timer = window.setTimeout(() => {
      setStatus("requesting");
      setError(null);

      window.tt?.requestAccess?.({
        scopeList: [],
        appID: feishuAppId,
        success: async (result) => {
          const code = String(result.code ?? "").trim();
          if (!code) {
            setStatus("idle");
            setError(isZh ? "未获取到飞书授权码。" : "Did not receive a Feishu authorization code.");
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
              setError(
                typeof payload.error === "string" && payload.error.trim()
                  ? payload.error
                  : (isZh ? "飞书登录失败，请联系管理员。" : "Feishu sign-in failed. Please contact an administrator."),
              );
              return;
            }

            saveUser(payload.user as AppUser);
            setStatus("redirecting");
            window.location.reload();
          } catch {
            setStatus("idle");
            setError(isZh ? "网络异常，飞书登录未完成。" : "Network error. Feishu sign-in did not complete.");
            // Leave the existing password login fallback visible.
          }
        },
        fail: () => {
          setStatus("idle");
          setError(isZh ? "飞书授权失败，请重试。" : "Feishu authorization failed. Please try again.");
          // Leave the existing password login fallback visible.
        },
      });
    }, 0);

    return () => window.clearTimeout(timer);
  }, [feishuAppId, feishuReady, isZh, locale]);

  if (!feishuAppId) return null;

  return (
    <>
      <Script
        src="https://lf-scm-cn.feishucdn.com/lark/op/h5-js-sdk-1.5.30.js"
        strategy="afterInteractive"
        onLoad={() => setFeishuReady(true)}
      />
      <LoadingOverlay
        open={status !== "idle"}
        title={
          status === "requesting"
            ? (isZh ? "正在连接飞书..." : "Connecting to Feishu...")
            : status === "signing_in"
              ? (isZh ? "正在验证身份..." : "Verifying your account...")
              : (isZh ? "登录成功，正在进入系统..." : "Signed in. Entering the app...")
        }
        description={isZh ? "请稍候，不要重复点击。" : "Please wait and avoid tapping repeatedly."}
      />
      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      ) : null}
    </>
  );
}

"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";
import type { Locale } from "@/lib/i18n/config";

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
  const attemptedRef = useRef(false);

  useEffect(() => {
    if (!feishuReady || attemptedRef.current || !feishuAppId || !window.tt?.requestAccess) return;
    if (loadUser()?.id) return;

    attemptedRef.current = true;

    window.tt.requestAccess({
      scopeList: [],
      appID: feishuAppId,
      success: async (result) => {
        const code = String(result.code ?? "").trim();
        if (!code) return;

        try {
          const response = await fetch("/api/auth/feishu-login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              code,
              next: `/${locale}/mobile/offline-capture`,
              purpose: "mobile_h5",
            }),
          });
          const payload = await response.json().catch(() => ({}));
          if (!response.ok || !payload.user?.id) return;

          saveUser(payload.user as AppUser);
          window.location.reload();
        } catch {
          // Leave the existing password login fallback visible.
        }
      },
      fail: () => {
        // Leave the existing password login fallback visible.
      },
    });
  }, [feishuAppId, feishuReady, locale]);

  if (!feishuAppId) return null;

  return (
    <Script
      src="https://lf-scm-cn.feishucdn.com/lark/op/h5-js-sdk-1.5.30.js"
      strategy="afterInteractive"
      onLoad={() => setFeishuReady(true)}
    />
  );
}

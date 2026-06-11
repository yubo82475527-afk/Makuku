"use client";

import { Loader2, LogIn } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import type { Locale } from "@/lib/i18n/config";

export function PcLoginForm({ locale }: { locale: Locale }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || `/${locale}/dashboard`;
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isZh = locale === "zh";

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!username.trim() || !password) {
      setError(isZh ? "请输入用户名和密码。" : "Enter username and password.");
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
        setError(data.error ?? (isZh ? "登录失败。" : "Sign-in failed."));
        return;
      }
      router.replace(next.startsWith("/") ? next : `/${locale}/dashboard`);
      router.refresh();
    } catch {
      setError(isZh ? "网络异常，请重试。" : "Network error. Please retry.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-6 space-y-4">
      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      <label className="block text-sm font-medium text-slate-700">
        {isZh ? "用户名" : "Username"}
        <input
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-slate-500"
          autoComplete="username"
        />
      </label>
      <label className="block text-sm font-medium text-slate-700">
        {isZh ? "密码" : "Password"}
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
        {loading ? (isZh ? "登录中..." : "Signing in...") : (isZh ? "登录后台" : "Sign in")}
      </button>
    </form>
  );
}

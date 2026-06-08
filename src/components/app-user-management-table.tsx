"use client";

import { CheckCircle2, Loader2, UserX } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge, EmptyState, TextInput } from "@/components/ui";
import type { AppUser } from "@/lib/types";

function isDisabled(user: AppUser) {
  return user.status === "disabled" || Boolean(user.disabled_at);
}

function formatDate(value: string | null | undefined, locale: string) {
  if (!value) return "-";
  return new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-GB", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

export function AppUserManagementTable({ users, locale }: { users: AppUser[]; locale: string }) {
  const router = useRouter();
  const isZh = locale === "zh";
  const [busyId, setBusyId] = useState<string | null>(null);
  const [passwords, setPasswords] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function patchUser(id: string, body: Record<string, string>) {
    setBusyId(id);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/app-users", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, ...body }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(payload.error ?? (isZh ? "用户更新失败。" : "User update failed."));
        return false;
      }
      router.refresh();
      return true;
    } catch {
      setError(isZh ? "网络异常，用户更新没有提交成功。" : "Network error. User update was not submitted.");
      return false;
    } finally {
      setBusyId(null);
    }
  }

  async function toggleStatus(user: AppUser) {
    const nextStatus = isDisabled(user) ? "enabled" : "disabled";
    const ok = await patchUser(user.id, { status: nextStatus });
    if (ok) setNotice(nextStatus === "disabled" ? (isZh ? "用户已禁用。" : "User disabled.") : (isZh ? "用户已启用。" : "User enabled."));
  }

  async function resetPassword(user: AppUser) {
    const password = passwords[user.id]?.trim() ?? "";
    if (!password) {
      setError(isZh ? "请输入新密码。" : "Enter a new password.");
      return;
    }
    const ok = await patchUser(user.id, { password });
    if (ok) {
      setPasswords((current) => ({ ...current, [user.id]: "" }));
      setNotice(isZh ? "密码已重置。" : "Password reset.");
    }
  }

  if (users.length === 0) {
    return <EmptyState text={isZh ? "暂无 H5 登录账户。" : "No H5 login users yet."} />;
  }

  return (
    <div className="space-y-3">
      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      {notice ? <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</div> : null}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
            <tr>
              <th className="py-2 pr-3">{isZh ? "用户名" : "Username"}</th>
              <th className="py-2 pr-3">{isZh ? "展示名" : "Display name"}</th>
              <th className="py-2 pr-3">{isZh ? "角色" : "Role"}</th>
              <th className="py-2 pr-3">{isZh ? "状态" : "Status"}</th>
              <th className="py-2 pr-3">{isZh ? "创建时间" : "Created"}</th>
              <th className="py-2 pr-3">{isZh ? "禁用时间" : "Disabled at"}</th>
              <th className="py-2 pr-3">{isZh ? "重置密码" : "Reset password"}</th>
              <th className="py-2 pr-3">{isZh ? "操作" : "Actions"}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {users.map((user) => {
              const disabled = isDisabled(user);
              const busy = busyId === user.id;
              return (
                <tr key={user.id}>
                  <td className="py-3 pr-3 font-medium">{user.username}</td>
                  <td className="py-3 pr-3">{user.display_name}</td>
                  <td className="py-3 pr-3"><Badge>{user.role}</Badge></td>
                  <td className="py-3 pr-3"><Badge tone={disabled ? "medium" : "low"}>{disabled ? (isZh ? "禁用" : "Disabled") : (isZh ? "启用" : "Enabled")}</Badge></td>
                  <td className="py-3 pr-3">{formatDate(user.created_at, locale)}</td>
                  <td className="py-3 pr-3">{formatDate(user.disabled_at, locale)}</td>
                  <td className="py-3 pr-3">
                    <div className="flex min-w-64 items-center gap-2">
                      <TextInput
                        type="password"
                        value={passwords[user.id] ?? ""}
                        onChange={(event) => setPasswords((current) => ({ ...current, [user.id]: event.target.value }))}
                        placeholder={isZh ? "新密码" : "New password"}
                      />
                      <button
                        type="button"
                        onClick={() => resetPassword(user)}
                        disabled={busy}
                        className="inline-flex h-9 shrink-0 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                      >
                        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                        {isZh ? "重置" : "Reset password"}
                      </button>
                    </div>
                  </td>
                  <td className="py-3 pr-3">
                    <button
                      type="button"
                      onClick={() => toggleStatus(user)}
                      disabled={busy}
                      className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    >
                      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : disabled ? <CheckCircle2 className="h-3.5 w-3.5" /> : <UserX className="h-3.5 w-3.5" />}
                      {disabled ? (isZh ? "启用" : "Enable") : (isZh ? "禁用" : "Disable")}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

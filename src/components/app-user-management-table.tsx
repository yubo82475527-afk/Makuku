"use client";

import { AlertCircle, CheckCircle2, KeyRound, Loader2, MessageCircle, UserX, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge, Button, EmptyState, SelectInput, TextInput } from "@/components/ui";
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

const zh = {
  empty: "\u6682\u65e0 H5 \u767b\u5f55\u8d26\u6237\u3002",
  username: "\u7528\u6237\u540d",
  displayName: "\u663e\u793a\u540d",
  email: "\u90ae\u7bb1",
  feishuOrganization: "\u98de\u4e66\u7ec4\u7ec7",
  systemOrganization: "\u5f53\u524d\u7ec4\u7ec7",
  orgSourceAuto: "\u98de\u4e66\u81ea\u52a8",
  orgSourceManual: "\u624b\u5de5",
  orgMismatch: "\u8ddf\u98de\u4e66\u7ec4\u7ec7\u4e0d\u5339\u914d",
  role: "\u89d2\u8272",
  status: "\u72b6\u6001",
  roleUpdated: "\u89d2\u8272\u5df2\u66f4\u65b0\u3002",
  created: "\u521b\u5efa\u65f6\u95f4",
  actions: "\u64cd\u4f5c",
  disabled: "\u7981\u7528",
  enabled: "\u542f\u7528",
  saveEmail: "\u4fdd\u5b58\u90ae\u7bb1",
  getOpenId: "\u83b7\u53d6\u98de\u4e66 Open ID",
  resolveOpenId: "\u89e3\u6790\u98de\u4e66 Open ID",
  feishuEmail: "\u98de\u4e66\u90ae\u7bb1",
  currentOpenId: "\u98de\u4e66 Open ID",
  notResolved: "\u5c1a\u672a\u89e3\u6790",
  resetPassword: "\u91cd\u7f6e\u5bc6\u7801",
  enable: "\u542f\u7528",
  disable: "\u7981\u7528",
  newPassword: "\u65b0\u5bc6\u7801",
  cancel: "\u53d6\u6d88",
  save: "\u4fdd\u5b58",
  close: "\u5173\u95ed",
  emailSaved: "\u90ae\u7bb1\u5df2\u4fdd\u5b58\u3002",
  passwordReset: "\u5bc6\u7801\u5df2\u91cd\u7f6e\u3002",
  enterPassword: "\u8bf7\u8f93\u5165\u65b0\u5bc6\u7801\u3002",
  userDisabled: "\u7528\u6237\u5df2\u7981\u7528\u3002",
  userEnabled: "\u7528\u6237\u5df2\u542f\u7528\u3002",
  openIdUpdated: "\u98de\u4e66 Open ID \u5df2\u66f4\u65b0\u3002",
  updateFailed: "\u7528\u6237\u66f4\u65b0\u5931\u8d25\u3002",
  openIdFailed: "\u83b7\u53d6\u98de\u4e66 Open ID \u5931\u8d25\u3002",
  networkUpdateFailed: "\u7f51\u7edc\u5f02\u5e38\uff0c\u7528\u6237\u66f4\u65b0\u6ca1\u6709\u63d0\u4ea4\u6210\u529f\u3002",
  networkOpenIdFailed: "\u7f51\u7edc\u5f02\u5e38\uff0c\u98de\u4e66 Open ID \u6ca1\u6709\u83b7\u53d6\u6210\u529f\u3002",
};

export function AppUserManagementTable({ users, locale }: { users: AppUser[]; locale: string }) {
  const router = useRouter();
  const isZh = locale === "zh";
  const [busyId, setBusyId] = useState<string | null>(null);
  const [resetUser, setResetUser] = useState<AppUser | null>(null);
  const [feishuUser, setFeishuUser] = useState<AppUser | null>(null);
  const [password, setPassword] = useState("");
  const [feishuEmail, setFeishuEmail] = useState("");
  const [resolvedOpenId, setResolvedOpenId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function systemOrganizationLabel(user: AppUser) {
    const names = (user.organization_members ?? [])
      .filter((member) => member.active)
      .map((member) => member.organizations?.name)
      .filter((name): name is string => Boolean(name));
    return Array.from(new Set(names));
  }

  function feishuOrganizationLabel(user: AppUser) {
    return Array.from(new Set((user.feishu_org_names ?? []).map((name) => name.trim()).filter(Boolean)));
  }

  function assignmentSourceLabel(user: AppUser) {
    if (user.organization_assignment_method === "manual") {
      return isZh ? zh.orgSourceManual : "Manual";
    }
    if (user.organization_assignment_method === "feishu_auto") {
      return isZh ? zh.orgSourceAuto : "Feishu auto";
    }
    return null;
  }

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
        setError(payload.error ?? (isZh ? zh.updateFailed : "User update failed."));
        return false;
      }
      router.refresh();
      return true;
    } catch {
      setError(isZh ? zh.networkUpdateFailed : "Network error. User update was not submitted.");
      return false;
    } finally {
      setBusyId(null);
    }
  }

  async function resolveFeishuOpenId() {
    if (!feishuUser) return;
    const email = feishuEmail.trim();
    if (!email) {
      setError(isZh ? "\u8bf7\u8f93\u5165\u98de\u4e66\u90ae\u7bb1\u3002" : "Enter a Feishu email.");
      return;
    }
    setBusyId(feishuUser.id);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/app-users/resolve-feishu-open-id", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: feishuUser.id, email }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(payload.error ?? (isZh ? zh.openIdFailed : "Failed to resolve Feishu Open ID."));
        return;
      }
      setResolvedOpenId(payload.user?.feishu_user_id ?? "");
      router.refresh();
      setNotice(isZh ? zh.openIdUpdated : "Feishu Open ID updated.");
    } catch {
      setError(isZh ? zh.networkOpenIdFailed : "Network error. Feishu Open ID was not resolved.");
    } finally {
      setBusyId(null);
    }
  }

  async function toggleStatus(user: AppUser) {
    const nextStatus = isDisabled(user) ? "enabled" : "disabled";
    const ok = await patchUser(user.id, { status: nextStatus });
    if (ok) setNotice(nextStatus === "disabled" ? (isZh ? zh.userDisabled : "User disabled.") : (isZh ? zh.userEnabled : "User enabled."));
  }

  async function updateRole(user: AppUser, nextRole: AppUser["role"]) {
    if (user.role === nextRole) return;
    const ok = await patchUser(user.id, { role: nextRole });
    if (ok) setNotice(isZh ? zh.roleUpdated : "Role updated.");
  }

  async function submitPasswordReset() {
    if (!resetUser) return;
    const nextPassword = password.trim();
    if (!nextPassword) {
      setError(isZh ? zh.enterPassword : "Enter a new password.");
      return;
    }
    const ok = await patchUser(resetUser.id, { password: nextPassword });
    if (ok) {
      setPassword("");
      setResetUser(null);
      setNotice(isZh ? zh.passwordReset : "Password reset.");
    }
  }

  if (users.length === 0) {
    return <EmptyState text={isZh ? zh.empty : "No H5 login users yet."} />;
  }

  return (
    <div className="space-y-3">
      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      {notice ? <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</div> : null}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1380px] text-left text-sm">
          <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
            <tr>
              <th className="whitespace-nowrap py-2 pr-3">{isZh ? zh.username : "Username"}</th>
              <th className="whitespace-nowrap py-2 pr-3">{isZh ? zh.displayName : "Display name"}</th>
              <th className="whitespace-nowrap py-2 pr-3">{isZh ? zh.email : "Email"}</th>
              <th className="whitespace-nowrap py-2 pr-3">{isZh ? zh.feishuOrganization : "Feishu organization"}</th>
              <th className="whitespace-nowrap py-2 pr-3">{isZh ? zh.systemOrganization : "Current organization"}</th>
              <th className="whitespace-nowrap py-2 pr-3">{isZh ? zh.role : "Role"}</th>
              <th className="whitespace-nowrap py-2 pr-3">{isZh ? zh.status : "Status"}</th>
              <th className="whitespace-nowrap py-2 pr-3">{isZh ? zh.created : "Created"}</th>
              <th className="whitespace-nowrap py-2 pr-3">{isZh ? zh.actions : "Actions"}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {users.map((user) => {
              const disabled = isDisabled(user);
              const busy = busyId === user.id;
              const feishuOrgs = feishuOrganizationLabel(user);
              const systemOrgs = systemOrganizationLabel(user);
              const sourceLabel = assignmentSourceLabel(user);
              return (
                <tr key={user.id}>
                  <td className="py-3 pr-3 font-medium">{user.username}</td>
                  <td className="py-3 pr-3">{user.display_name}</td>
                  <td className="py-3 pr-3">{user.email || "-"}</td>
                  <td className="max-w-[220px] py-3 pr-3 text-slate-600">
                    <div className="flex items-center gap-2">
                      <span>{feishuOrgs.length ? feishuOrgs.join(", ") : "-"}</span>
                      {user.feishu_org_mismatch ? (
                        <span
                          title={isZh ? zh.orgMismatch : "Mismatch with Feishu organization"}
                          aria-label={isZh ? zh.orgMismatch : "Mismatch with Feishu organization"}
                          className="inline-flex h-4 w-4 items-center justify-center text-amber-500"
                        >
                          <AlertCircle className="h-4 w-4" />
                        </span>
                      ) : null}
                    </div>
                  </td>
                  <td className="max-w-[240px] py-3 pr-3 text-slate-600">
                    <div className="space-y-1">
                      <div>{systemOrgs.length ? systemOrgs.join(", ") : "-"}</div>
                      {sourceLabel ? <div className="text-xs text-slate-400">{sourceLabel}</div> : null}
                    </div>
                  </td>
                  <td className="py-3 pr-3">
                    <SelectInput
                      value={user.role}
                      onChange={(event) => void updateRole(user, event.target.value as AppUser["role"])}
                      disabled={busy}
                      className="h-8 min-w-[132px]"
                      aria-label={isZh ? zh.role : "Role"}
                    >
                      <option value="field_agent">field_agent</option>
                      <option value="manager">manager</option>
                      <option value="admin">admin</option>
                    </SelectInput>
                  </td>
                  <td className="whitespace-nowrap py-3 pr-3"><Badge tone={disabled ? "medium" : "low"}>{disabled ? (isZh ? zh.disabled : "Disabled") : (isZh ? zh.enabled : "Enabled")}</Badge></td>
                  <td className="py-3 pr-3">{formatDate(user.created_at, locale)}</td>
                  <td className="whitespace-nowrap py-3 pr-3">
                    <div className="flex flex-nowrap gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setFeishuUser(user);
                          setFeishuEmail(user.email ?? "");
                          setResolvedOpenId(user.feishu_user_id ?? "");
                          setError(null);
                          setNotice(null);
                        }}
                        disabled={busy}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                        title={user.feishu_user_id ? `Open ID: ${user.feishu_user_id}` : (isZh ? zh.getOpenId : "Get Open ID")}
                        aria-label={isZh ? zh.getOpenId : "Get Open ID"}
                      >
                        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MessageCircle className="h-3.5 w-3.5" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setResetUser(user);
                          setPassword("");
                          setError(null);
                          setNotice(null);
                        }}
                        disabled={busy}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                        title={isZh ? zh.resetPassword : "Reset password"}
                        aria-label={isZh ? zh.resetPassword : "Reset password"}
                      >
                        <KeyRound className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleStatus(user)}
                        disabled={busy}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                        title={disabled ? (isZh ? zh.enable : "Enable") : (isZh ? zh.disable : "Disable")}
                        aria-label={disabled ? (isZh ? zh.enable : "Enable") : (isZh ? zh.disable : "Disable")}
                      >
                        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : disabled ? <CheckCircle2 className="h-3.5 w-3.5" /> : <UserX className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {resetUser ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4 py-6">
          <div className="w-full max-w-md rounded-lg bg-white p-4 shadow-xl">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="font-semibold">{isZh ? zh.resetPassword : "Reset password"}</h2>
              <button
                type="button"
                aria-label={isZh ? zh.close : "Close"}
                onClick={() => setResetUser(null)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>
            <div className="mb-3 text-sm text-slate-600">{resetUser.display_name} / {resetUser.username}</div>
            <TextInput
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={isZh ? zh.newPassword : "New password"}
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setResetUser(null)}
                className="inline-flex h-9 items-center justify-center rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                {isZh ? zh.cancel : "Cancel"}
              </button>
              <Button type="button" onClick={submitPasswordReset} disabled={busyId === resetUser.id}>
                {busyId === resetUser.id ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {isZh ? zh.save : "Save"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {feishuUser ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4 py-6">
          <div className="w-full max-w-lg rounded-lg bg-white p-4 shadow-xl">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="font-semibold">{isZh ? zh.resolveOpenId : "Resolve Feishu Open ID"}</h2>
              <button
                type="button"
                aria-label={isZh ? zh.close : "Close"}
                onClick={() => setFeishuUser(null)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>
            <div className="mb-3 text-sm text-slate-600">{feishuUser.display_name} / {feishuUser.username}</div>
            <div className="grid gap-3">
              <TextInput
                type="email"
                value={feishuEmail}
                onChange={(event) => setFeishuEmail(event.target.value)}
                placeholder={isZh ? zh.feishuEmail : "Feishu email"}
              />
              <label className="grid gap-1 text-sm">
                <span className="font-medium text-slate-700">{isZh ? zh.currentOpenId : "Feishu Open ID"}</span>
                <TextInput value={resolvedOpenId} readOnly placeholder={isZh ? zh.notResolved : "Not resolved yet"} />
              </label>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setFeishuUser(null)}
                className="inline-flex h-9 items-center justify-center rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                {isZh ? zh.cancel : "Cancel"}
              </button>
              <Button type="button" onClick={resolveFeishuOpenId} disabled={busyId === feishuUser.id || !feishuEmail.trim()}>
                {busyId === feishuUser.id ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {isZh ? zh.getOpenId : "Get Open ID"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

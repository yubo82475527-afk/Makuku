"use client";

import { Loader2, Plus, Shield, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Badge, Button, SelectInput, TextInput } from "@/components/ui";
import { PAGE_KEY_LABELS, filterRoleAssignablePages, type RolePageKey } from "@/lib/page-permissions";
import type { AppRole } from "@/lib/types";

const zh = {
  addRole: "新增角色",
  edit: "编辑",
  delete: "删除",
  save: "保存",
  cancel: "取消",
  close: "关闭",
  code: "角色编码",
  name: "角色名称",
  description: "说明",
  pages: "页面权限",
  status: "状态",
  system: "系统角色",
  active: "启用",
  inactive: "停用",
  dataScopeAll: "全量数据",
  dataScopeOrg: "按组织",
  failed: "操作失败。",
  cannotEditSystemPages: "系统角色页面权限固定，不可修改。",
  confirmDelete: "确认删除该角色？",
};

export function RoleManagement({
  roles,
  pageKeys,
  locale,
}: {
  roles: AppRole[];
  pageKeys: RolePageKey[];
  locale: string;
}) {
  const router = useRouter();
  const isZh = locale === "zh";
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<AppRole | null>(null);
  const [creating, setCreating] = useState(false);
  const [draftCode, setDraftCode] = useState("");
  const [draftName, setDraftName] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [draftPages, setDraftPages] = useState<string[]>([]);
  const [draftStatus, setDraftStatus] = useState<"active" | "inactive">("active");

  const sortedRoles = useMemo(
    () => [...roles].sort((a, b) => Number(b.is_system) - Number(a.is_system) || a.code.localeCompare(b.code)),
    [roles],
  );

  function openCreate() {
    setCreating(true);
    setEditing(null);
    setDraftCode("");
    setDraftName("");
    setDraftDescription("");
    setDraftPages([]);
    setDraftStatus("active");
    setError(null);
  }

  function openEdit(role: AppRole) {
    setEditing(role);
    setCreating(false);
    setDraftCode(role.code);
    setDraftName(role.name);
    setDraftDescription(role.description ?? "");
    setDraftPages(filterRoleAssignablePages(role.page_keys));
    setDraftStatus(role.status);
    setError(null);
  }

  function closeDialog() {
    setCreating(false);
    setEditing(null);
    setError(null);
  }

  function togglePage(pageKey: string) {
    if (editing?.is_system || editing?.code === "admin" || editing?.code === "field_agent") return;
    setDraftPages((current) => (
      current.includes(pageKey) ? current.filter((item) => item !== pageKey) : [...current, pageKey]
    ));
  }

  async function submitCreate() {
    setBusyKey("create");
    setError(null);
    try {
      const response = await fetch("/api/app-roles", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          code: draftCode,
          name: draftName,
          description: draftDescription,
          page_keys: draftPages,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(payload.error ?? (isZh ? zh.failed : "Action failed."));
        return;
      }
      closeDialog();
      router.refresh();
    } catch {
      setError(isZh ? zh.failed : "Action failed.");
    } finally {
      setBusyKey(null);
    }
  }

  async function submitEdit() {
    if (!editing) return;
    setBusyKey(`edit:${editing.id}`);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        id: editing.id,
        name: draftName,
        description: draftDescription,
      };
      if (!editing.is_system) {
        body.status = draftStatus;
        body.page_keys = draftPages;
      }
      const response = await fetch("/api/app-roles", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(payload.error ?? (isZh ? zh.failed : "Action failed."));
        return;
      }
      closeDialog();
      router.refresh();
    } catch {
      setError(isZh ? zh.failed : "Action failed.");
    } finally {
      setBusyKey(null);
    }
  }

  async function deleteRole(role: AppRole) {
    if (role.is_system) return;
    if (!window.confirm(isZh ? zh.confirmDelete : "Delete this role?")) return;
    setBusyKey(`delete:${role.id}`);
    setError(null);
    try {
      const response = await fetch("/api/app-roles", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: role.id }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(payload.error ?? (isZh ? zh.failed : "Action failed."));
        return;
      }
      router.refresh();
    } catch {
      setError(isZh ? zh.failed : "Action failed.");
    } finally {
      setBusyKey(null);
    }
  }

  const dialogOpen = creating || Boolean(editing);
  const systemPageLocked = Boolean(editing?.is_system || editing?.code === "admin" || editing?.code === "field_agent");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold">{isZh ? "角色列表" : "Roles"}</h2>
        <Button type="button" onClick={openCreate}>
          <Plus size={16} aria-hidden="true" />
          {isZh ? zh.addRole : "Add role"}
        </Button>
      </div>

      {error ? <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div> : null}

      <div className="overflow-x-auto rounded-md border border-slate-200">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-3 py-2 font-medium">{isZh ? zh.code : "Code"}</th>
              <th className="px-3 py-2 font-medium">{isZh ? zh.name : "Name"}</th>
              <th className="px-3 py-2 font-medium">{isZh ? "数据范围" : "Data scope"}</th>
              <th className="px-3 py-2 font-medium">{isZh ? zh.pages : "Pages"}</th>
              <th className="px-3 py-2 font-medium">{isZh ? zh.status : "Status"}</th>
              <th className="px-3 py-2 font-medium">{isZh ? "操作" : "Actions"}</th>
            </tr>
          </thead>
          <tbody>
            {sortedRoles.map((role) => (
              <tr key={role.id ?? role.code} className="border-t border-slate-100">
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <code>{role.code}</code>
                    {role.is_system ? <Badge>{isZh ? zh.system : "System"}</Badge> : null}
                  </div>
                </td>
                <td className="px-3 py-2">{role.name}</td>
                <td className="px-3 py-2">
                  {role.data_scope === "all" ? (isZh ? zh.dataScopeAll : "All data") : (isZh ? zh.dataScopeOrg : "By organization")}
                </td>
                <td className="px-3 py-2">{(role.page_keys ?? []).length}</td>
                <td className="px-3 py-2">{role.status === "active" ? (isZh ? zh.active : "Active") : (isZh ? zh.inactive : "Inactive")}</td>
                <td className="px-3 py-2">
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50"
                      onClick={() => openEdit(role)}
                    >
                      {isZh ? zh.edit : "Edit"}
                    </button>
                    {!role.is_system ? (
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 rounded-md border border-rose-300 px-2 py-1 text-xs text-rose-700 hover:bg-rose-50"
                        onClick={() => deleteRole(role)}
                        disabled={busyKey === `delete:${role.id}`}
                      >
                        {busyKey === `delete:${role.id}` ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                        {isZh ? zh.delete : "Delete"}
                      </button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {dialogOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4 py-6">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-lg bg-white p-4 shadow-xl">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 font-semibold">
                <Shield className="h-4 w-4" />
                {creating ? (isZh ? zh.addRole : "Add role") : (isZh ? zh.edit : "Edit")}
              </h2>
              <button
                type="button"
                aria-label={isZh ? zh.close : "Close"}
                onClick={closeDialog}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <TextInput
                value={draftCode}
                onChange={(event) => setDraftCode(event.target.value)}
                placeholder={isZh ? zh.code : "Role code"}
                disabled={!creating}
              />
              <TextInput
                value={draftName}
                onChange={(event) => setDraftName(event.target.value)}
                placeholder={isZh ? zh.name : "Role name"}
              />
              <TextInput
                className="md:col-span-2"
                value={draftDescription}
                onChange={(event) => setDraftDescription(event.target.value)}
                placeholder={isZh ? zh.description : "Description"}
              />
              {editing && !editing.is_system ? (
                <SelectInput value={draftStatus} onChange={(event) => setDraftStatus(event.target.value as "active" | "inactive")}>
                  <option value="active">{isZh ? zh.active : "Active"}</option>
                  <option value="inactive">{isZh ? zh.inactive : "Inactive"}</option>
                </SelectInput>
              ) : null}
            </div>

            <div className="mt-4">
              <div className="mb-2 text-sm font-medium">{isZh ? zh.pages : "Page permissions"}</div>
              {systemPageLocked ? (
                <p className="mb-2 text-xs text-slate-500">{isZh ? zh.cannotEditSystemPages : "System role page permissions are fixed."}</p>
              ) : null}
              <div className="grid gap-2 sm:grid-cols-2">
                {pageKeys.map((pageKey) => {
                  const label = PAGE_KEY_LABELS[pageKey];
                  const checked = draftPages.includes(pageKey);
                  return (
                    <label key={pageKey} className="flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm">
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={systemPageLocked}
                        onChange={() => togglePage(pageKey)}
                      />
                      <span>{isZh ? label.zh : label.en}</span>
                      <span className="text-xs text-slate-400">({pageKey})</span>
                    </label>
                  );
                })}
              </div>
            </div>

            {error ? <div className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div> : null}

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeDialog}
                className="inline-flex h-9 items-center justify-center rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                {isZh ? zh.cancel : "Cancel"}
              </button>
              <Button
                type="button"
                onClick={creating ? submitCreate : submitEdit}
                disabled={Boolean(busyKey)}
              >
                {busyKey ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {isZh ? zh.save : "Save"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

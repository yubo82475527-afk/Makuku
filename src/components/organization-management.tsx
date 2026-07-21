"use client";

import { Link2, Loader2, Plus, Tags, Trash2, UserPlus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { Badge, Button, SelectInput, TextInput } from "@/components/ui";
import type { AppUser, Organization } from "@/lib/types";

type RegionDraft = {
  id: string;
  province: string;
  city_name: string;
  district: string;
};

const zh = {
  addOrganization: "\u65b0\u589e\u7ec4\u7ec7",
  organizationName: "\u7ec4\u7ec7\u540d\u79f0",
  externalOrgId: "\u5916\u90e8\u7ec4\u7ec7ID",
  notes: "\u5907\u6ce8",
  owner: "\u7ec4\u7ec7\u8d1f\u8d23\u4eba",
  created: "\u521b\u5efa\u65f6\u95f4",
  actions: "\u64cd\u4f5c",
  notConfigured: "\u672a\u914d\u7f6e",
  linkRegion: "\u5173\u8054\u533a\u57df",
  linkUser: "\u5173\u8054\u7528\u6237",
  linkExternalOrg: "\u5173\u8054\u5916\u90e8\u7ec4\u7ec7ID",
  regionTitle: "\u5173\u8054\u533a\u57df",
  userTitle: "\u5173\u8054\u7528\u6237",
  externalOrgTitle: "\u5173\u8054\u5916\u90e8\u7ec4\u7ec7ID",
  province: "\u7701",
  city: "\u5e02\uff08\u53ef\u9009\uff09",
  district: "\u533a\uff08\u53ef\u9009\uff09",
  addRow: "\u65b0\u589e\u4e00\u884c",
  save: "\u4fdd\u5b58",
  cancel: "\u53d6\u6d88",
  close: "\u5173\u95ed",
  existingRegions: "\u5df2\u5173\u8054\u533a\u57df",
  existingUsers: "\u5df2\u5173\u8054\u7528\u6237",
  selectUser: "\u9009\u62e9\u7528\u6237",
  addUser: "\u6dfb\u52a0\u7528\u6237",
  noRegions: "\u6682\u65e0\u533a\u57df",
  noUsers: "\u6682\u65e0\u7528\u6237",
  failed: "\u64cd\u4f5c\u5931\u8d25\u3002",
};

export function OrganizationManagement({ organizations, users, locale }: { organizations: Organization[]; users: AppUser[]; locale: string }) {
  const router = useRouter();
  const isZh = locale === "zh";
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [regionOrganization, setRegionOrganization] = useState<Organization | null>(null);
  const [userOrganization, setUserOrganization] = useState<Organization | null>(null);
  const [externalOrgOrganization, setExternalOrgOrganization] = useState<Organization | null>(null);
  const [regionDrafts, setRegionDrafts] = useState<RegionDraft[]>(() => [newRegionDraft()]);
  const [externalOrgDraft, setExternalOrgDraft] = useState("");

  async function submitJson(url: string, method: string, body: Record<string, unknown>) {
    setBusyKey(`${method}:${url}:${String(body.id ?? body.organization_id ?? body.name ?? "")}`);
    setError(null);
    try {
      const response = await fetch(url, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(payload.error ?? (isZh ? zh.failed : "Action failed."));
        return false;
      }
      router.refresh();
      return true;
    } catch {
      setError(isZh ? "\u7f51\u7edc\u5f02\u5e38\uff0c\u64cd\u4f5c\u6ca1\u6709\u63d0\u4ea4\u6210\u529f\u3002" : "Network error. Action was not submitted.");
      return false;
    } finally {
      setBusyKey(null);
    }
  }

  async function addOrganization(formData: FormData) {
    const ok = await submitJson("/api/organizations", "POST", {
      name: String(formData.get("name") ?? ""),
      notes: String(formData.get("notes") ?? ""),
    });
    if (ok) {
      const form = document.getElementById("organization-create-form") as HTMLFormElement | null;
      form?.reset();
    }
  }

  function openExternalOrgDialog(organization: Organization) {
    setExternalOrgOrganization(organization);
    setExternalOrgDraft(organization.external_org_id ?? "");
    setError(null);
  }

  async function saveExternalOrgId() {
    if (!externalOrgOrganization) return;
    const ok = await submitJson("/api/organizations", "PATCH", {
      id: externalOrgOrganization.id,
      external_org_id: externalOrgDraft,
    });
    if (ok) setExternalOrgOrganization(null);
  }

  function openRegionDialog(organization: Organization) {
    setRegionOrganization(organization);
    setRegionDrafts([newRegionDraft()]);
    setError(null);
  }

  function owners(organization: Organization) {
    const names = organization.organization_members
      ?.map((member) => member.app_users?.display_name ?? member.app_users?.username)
      .filter(Boolean) ?? [];
    return names.length ? names.join(", ") : (isZh ? zh.notConfigured : "Not configured");
  }

  function createdAt(value: string) {
    if (!value) return "-";
    return new Intl.DateTimeFormat(isZh ? "zh-CN" : "en-GB", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(value));
  }

  async function saveRegionDrafts() {
    if (!regionOrganization) return;
    const rules = regionDrafts
      .map((draft) => ({
        province: draft.province.trim(),
        city_name: draft.city_name.trim(),
        district: draft.district.trim(),
      }))
      .filter((draft) => draft.province);
    if (rules.length === 0) {
      setError(isZh ? "\u8bf7\u81f3\u5c11\u586b\u5199\u4e00\u6761\u7701\u4efd\u3002" : "Enter at least one province.");
      return;
    }
    const ok = await submitJson("/api/organizations/region-rules", "POST", {
      organization_id: regionOrganization.id,
      rules,
    });
    if (ok) setRegionDrafts([newRegionDraft()]);
  }

  async function addMember(formData: FormData) {
    if (!userOrganization) return;
    await submitJson("/api/organizations/members", "POST", {
      organization_id: userOrganization.id,
      app_user_id: String(formData.get("app_user_id") ?? ""),
    });
  }

  return (
    <div className="space-y-4">
      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}

      <form id="organization-create-form" action={addOrganization} className="grid gap-3 rounded-md border border-slate-200 bg-slate-50 p-3 md:grid-cols-[1fr_1fr_auto]">
        <TextInput name="name" placeholder={isZh ? zh.organizationName : "Organization name"} required />
        <TextInput name="notes" placeholder={isZh ? zh.notes : "Notes"} />
        <Button type="submit" disabled={Boolean(busyKey)}>
          {busyKey ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          {isZh ? zh.addOrganization : "Add organization"}
        </Button>
      </form>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
            <tr>
              <th className="py-2 pr-3">{isZh ? zh.organizationName : "Organization name"}</th>
              <th className="py-2 pr-3">{isZh ? zh.owner : "Organization owner"}</th>
              <th className="py-2 pr-3">{isZh ? zh.created : "Created"}</th>
              <th className="py-2 pr-3">{isZh ? zh.actions : "Actions"}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {organizations.map((organization) => (
              <tr key={organization.id}>
                <td className="py-3 pr-3 font-medium">
                  <div className="flex items-center gap-2">
                    <span>{organization.name}</span>
                    <Badge tone={organization.status === "active" ? "low" : "medium"}>{organization.status}</Badge>
                  </div>
                </td>
                <td className="py-3 pr-3">{owners(organization)}</td>
                <td className="whitespace-nowrap py-3 pr-3 text-slate-600">{createdAt(organization.created_at)}</td>
                <td className="py-3 pr-3">
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => openExternalOrgDialog(organization)} className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                      <Tags className="h-3.5 w-3.5" />
                      {isZh ? zh.linkExternalOrg : "Link external organization ID"}
                    </button>
                    <button type="button" onClick={() => openRegionDialog(organization)} className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                      <Link2 className="h-3.5 w-3.5" />
                      {isZh ? zh.linkRegion : "Link regions"}
                    </button>
                    <button type="button" onClick={() => setUserOrganization(organization)} className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                      <UserPlus className="h-3.5 w-3.5" />
                      {isZh ? zh.linkUser : "Link users"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {externalOrgOrganization ? (
        <Dialog title={`${isZh ? zh.externalOrgTitle : "Link external organization ID"} - ${externalOrgOrganization.name}`} closeLabel={isZh ? zh.close : "Close"} onClose={() => setExternalOrgOrganization(null)}>
          <div className="space-y-4">
            <label className="block text-sm font-medium text-slate-700">
              <span className="mb-1 block">{isZh ? zh.externalOrgId : "External organization ID"}</span>
              <TextInput
                value={externalOrgDraft}
                onChange={(event) => setExternalOrgDraft(event.target.value)}
                placeholder={isZh ? zh.externalOrgId : "External organization ID"}
              />
            </label>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setExternalOrgOrganization(null)} className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50">{isZh ? zh.cancel : "Cancel"}</button>
              <Button type="button" onClick={saveExternalOrgId} disabled={Boolean(busyKey)}>{isZh ? zh.save : "Save"}</Button>
            </div>
          </div>
        </Dialog>
      ) : null}

      {regionOrganization ? (
        <Dialog title={`${isZh ? zh.regionTitle : "Link regions"} - ${regionOrganization.name}`} closeLabel={isZh ? zh.close : "Close"} onClose={() => setRegionOrganization(null)}>
          <div className="mb-4">
            <div className="mb-2 text-sm font-semibold">{isZh ? zh.existingRegions : "Linked regions"}</div>
            <div className="flex flex-wrap gap-2">
              {regionOrganization.organization_region_rules?.length ? regionOrganization.organization_region_rules.map((rule) => (
                <span key={rule.id} className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">
                  {[rule.province, rule.city_name, rule.district].filter(Boolean).join(" / ")}
                  <button type="button" aria-label="Remove region" onClick={() => submitJson("/api/organizations/region-rules", "DELETE", { id: rule.id })}>
                    <Trash2 className="h-3 w-3" />
                  </button>
                </span>
              )) : <span className="text-sm text-slate-500">{isZh ? zh.noRegions : "No regions"}</span>}
            </div>
          </div>

          <div className="space-y-2">
            {regionDrafts.map((draft) => (
              <div key={draft.id} className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
                <TextInput value={draft.province} onChange={(event) => updateRegionDraft(setRegionDrafts, draft.id, "province", event.target.value)} placeholder={isZh ? zh.province : "Province"} />
                <TextInput value={draft.city_name} onChange={(event) => updateRegionDraft(setRegionDrafts, draft.id, "city_name", event.target.value)} placeholder={isZh ? zh.city : "City (optional)"} />
                <TextInput value={draft.district} onChange={(event) => updateRegionDraft(setRegionDrafts, draft.id, "district", event.target.value)} placeholder={isZh ? zh.district : "District (optional)"} />
                <button type="button" onClick={() => setRegionDrafts((current) => current.filter((item) => item.id !== draft.id))} disabled={regionDrafts.length === 1} className="inline-flex h-9 items-center justify-center rounded-md border border-slate-300 bg-white px-3 text-slate-700 hover:bg-slate-50 disabled:opacity-40">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap justify-between gap-2">
            <button type="button" onClick={() => setRegionDrafts((current) => [...current, newRegionDraft()])} className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50">
              <Plus className="h-4 w-4" />
              {isZh ? zh.addRow : "Add row"}
            </button>
            <div className="flex gap-2">
              <button type="button" onClick={() => setRegionOrganization(null)} className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50">{isZh ? zh.cancel : "Cancel"}</button>
              <Button type="button" onClick={saveRegionDrafts} disabled={Boolean(busyKey)}>{isZh ? zh.save : "Save"}</Button>
            </div>
          </div>
        </Dialog>
      ) : null}

      {userOrganization ? (
        <Dialog title={`${isZh ? zh.userTitle : "Link users"} - ${userOrganization.name}`} closeLabel={isZh ? zh.close : "Close"} onClose={() => setUserOrganization(null)}>
          <div className="mb-4">
            <div className="mb-2 text-sm font-semibold">{isZh ? zh.existingUsers : "Linked users"}</div>
            <div className="flex flex-wrap gap-2">
              {userOrganization.organization_members?.length ? userOrganization.organization_members.map((member) => (
                <span key={member.id} className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">
                  {member.app_users?.display_name ?? member.app_users?.username ?? member.app_user_id}
                  <button type="button" aria-label="Remove user" onClick={() => submitJson("/api/organizations/members", "DELETE", { id: member.id })}>
                    <Trash2 className="h-3 w-3" />
                  </button>
                </span>
              )) : <span className="text-sm text-slate-500">{isZh ? zh.noUsers : "No users"}</span>}
            </div>
          </div>
          <form action={addMember} className="grid gap-2 sm:grid-cols-[1fr_auto]">
            <SelectInput name="app_user_id" required>
              <option value="">{isZh ? zh.selectUser : "Select user"}</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>{user.display_name} / {user.username}</option>
              ))}
            </SelectInput>
            <Button type="submit" disabled={Boolean(busyKey)}>
              {isZh ? zh.addUser : "Add user"}
            </Button>
          </form>
        </Dialog>
      ) : null}
    </div>
  );
}

function Dialog({ title, closeLabel, onClose, children }: { title: string; closeLabel: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4 py-6">
      <div className="max-h-[88vh] w-full max-w-4xl overflow-y-auto rounded-lg bg-white p-4 shadow-xl">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="font-semibold">{title}</h2>
          <button type="button" aria-label={closeLabel} onClick={onClose} className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50">
            <X size={16} aria-hidden="true" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function newRegionDraft(): RegionDraft {
  return { id: crypto.randomUUID(), province: "", city_name: "", district: "" };
}

function updateRegionDraft(
  setRegionDrafts: Dispatch<SetStateAction<RegionDraft[]>>,
  id: string,
  key: keyof Omit<RegionDraft, "id">,
  value: string,
) {
  setRegionDrafts((current) => current.map((draft) => draft.id === id ? { ...draft, [key]: value } : draft));
}

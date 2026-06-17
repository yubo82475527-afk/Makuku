"use client";

import { Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, SelectInput, TextInput } from "@/components/ui";
import type { ChannelMaster, Organization } from "@/lib/types";

export function StoreCreateDialog({
  channels,
  organizations,
  useChannelTypeFallback,
  locale,
}: {
  channels: ChannelMaster[];
  organizations: Organization[];
  useChannelTypeFallback: boolean;
  locale: string;
}) {
  const isZh = locale === "zh";
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(formData: FormData) {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/offline-stores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.fromEntries(formData.entries())),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(payload.error ?? (isZh ? "新增门店失败。" : "Failed to create store."));
        return;
      }
      setOpen(false);
      router.refresh();
    } catch {
      setError(isZh ? "网络异常，新增门店没有提交成功。" : "Network error. Store was not submitted.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        {isZh ? "新增门店" : "Add Store"}
      </Button>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 px-4">
          <div className="w-full max-w-2xl rounded-lg bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <div className="text-base font-semibold text-slate-950">{isZh ? "新增门店" : "Add Store"}</div>
                <div className="mt-1 text-xs text-slate-500">{isZh ? "填写门店基础信息，归属组织可手动指定。" : "Fill store details. Organization can be assigned manually."}</div>
              </div>
              <button type="button" onClick={() => setOpen(false)} disabled={saving} className="rounded-md border border-slate-300 p-2 text-slate-600 hover:bg-slate-50 disabled:opacity-50" aria-label={isZh ? "关闭" : "Close"}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <form action={submit} className="grid gap-4 px-5 py-5 md:grid-cols-2">
              <Field label={isZh ? "门店名称" : "Store name"}>
                <TextInput name="name" autoComplete="off" required />
              </Field>
              <Field label={isZh ? "渠道" : "Channel"}>
                <SelectInput name={useChannelTypeFallback ? "channel_type" : "channel_id"} required>
                  <option value="">{isZh ? "选择渠道" : "Select channel"}</option>
                  {channels.map((channel) => (
                    <option key={channel.id} value={useChannelTypeFallback ? channel.code : channel.id}>{channel.name}</option>
                  ))}
                </SelectInput>
              </Field>
              <Field label={isZh ? "省" : "Province"}>
                <TextInput name="province" autoComplete="off" required />
              </Field>
              <Field label={isZh ? "市" : "City"}>
                <TextInput name="city_name" autoComplete="off" required />
              </Field>
              <Field label={isZh ? "区" : "District"}>
                <TextInput name="district" autoComplete="off" />
              </Field>
              <Field label={isZh ? "归属组织" : "Organization"}>
                <SelectInput name="organization_id">
                  <option value="">{isZh ? "按区域自动匹配" : "Auto match by region"}</option>
                  {organizations.map((organization) => (
                    <option key={organization.id} value={organization.id}>{organization.name}</option>
                  ))}
                </SelectInput>
              </Field>
              {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 md:col-span-2">{error}</div> : null}
              <div className="flex justify-end gap-2 border-t border-slate-200 pt-4 md:col-span-2">
                <button type="button" onClick={() => setOpen(false)} disabled={saving} className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                  {isZh ? "取消" : "Cancel"}
                </button>
                <Button type="submit" disabled={saving}>
                  {saving ? (isZh ? "保存中..." : "Saving...") : (isZh ? "保存" : "Save")}
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm font-medium text-slate-700">
      <span className="mb-1 block">{label}</span>
      {children}
    </label>
  );
}

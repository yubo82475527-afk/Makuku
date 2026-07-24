"use client";

import { Plus, X } from "lucide-react";
import { useState } from "react";
import { Button, SelectInput, TextInput } from "@/components/ui";

const zh = {
  addUser: "\u65b0\u589e\u8d26\u6237",
  title: "\u65b0\u589e H5 \u8d26\u6237",
  username: "\u7528\u6237\u540d",
  displayName: "\u663e\u793a\u540d",
  email: "\u90ae\u7bb1",
  password: "\u521d\u59cb\u5bc6\u7801",
  role: "\u89d2\u8272",
  cancel: "\u53d6\u6d88",
  save: "\u4fdd\u5b58",
  close: "\u5173\u95ed",
};

export function AppUserCreateDialog({
  locale,
  isZh,
  roles = [],
}: {
  locale: string;
  isZh: boolean;
  roles?: Array<{ code: string; name: string }>;
}) {
  const [open, setOpen] = useState(false);
  const roleOptions = roles.length > 0
    ? roles
    : [
      { code: "field_agent", name: isZh ? "巡店人员" : "Field agent" },
      { code: "manager", name: isZh ? "经理" : "Manager" },
      { code: "admin", name: isZh ? "管理员" : "Admin" },
    ];

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        <Plus size={16} aria-hidden="true" />
        {isZh ? zh.addUser : "Add user"}
      </Button>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4 py-6">
          <div className="w-full max-w-2xl rounded-lg bg-white p-4 shadow-xl">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="font-semibold">{isZh ? zh.title : "Add H5 user"}</h2>
              <button
                type="button"
                aria-label={isZh ? zh.close : "Close"}
                onClick={() => setOpen(false)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>

            <form action="/api/app-users" method="post" className="grid gap-3 md:grid-cols-2">
              <input type="hidden" name="return_to" value={`/${locale}/users`} />
              <TextInput name="username" placeholder={isZh ? zh.username : "Username"} required />
              <TextInput name="display_name" placeholder={isZh ? zh.displayName : "Display name"} required />
              <TextInput name="email" type="email" placeholder={isZh ? zh.email : "Email"} />
              <TextInput name="password" type="password" placeholder={isZh ? zh.password : "Initial password"} required />
              <SelectInput name="role" defaultValue="field_agent" className="md:col-span-2" aria-label={isZh ? zh.role : "Role"}>
                {roleOptions.map((role) => (
                  <option key={role.code} value={role.code}>{role.name}</option>
                ))}
              </SelectInput>
              <div className="flex justify-end gap-2 md:col-span-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="inline-flex h-9 items-center justify-center rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  {isZh ? zh.cancel : "Cancel"}
                </button>
                <Button type="submit">{isZh ? zh.save : "Save"}</Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}

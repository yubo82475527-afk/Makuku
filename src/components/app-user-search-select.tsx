"use client";

import { Check, Search } from "lucide-react";
import { useMemo, useState } from "react";
import type { AppUser } from "@/lib/types";

type AppUserSearchSelectProps = {
  users: AppUser[];
  locale: string;
  name?: string;
  excludeIds?: string[];
  onSelectedChange?: (user: AppUser | null) => void;
};

export function AppUserSearchSelect({
  users,
  locale,
  name = "app_user_id",
  excludeIds = [],
  onSelectedChange,
}: AppUserSearchSelectProps) {
  const isZh = locale === "zh";
  const labels = isZh
    ? {
      search: "搜索用户",
      placeholder: "输入中文名 / 英文名 / 用户名",
      empty: "未找到匹配用户",
      noOptions: "暂无可选用户",
      hint: "在列表中点选一位用户",
      selected: "已选择",
    }
    : {
      search: "Search users",
      placeholder: "Display name / username",
      empty: "No matching users",
      noOptions: "No users available",
      hint: "Select a user from the list",
      selected: "Selected",
    };

  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState("");

  const excludeSet = useMemo(() => new Set(excludeIds), [excludeIds]);
  const availableUsers = useMemo(
    () => users.filter((user) => !excludeSet.has(user.id)),
    [excludeSet, users],
  );

  const filteredUsers = useMemo(() => {
    const normalized = normalize(query);
    return availableUsers.filter((user) => !normalized || userMatchesSearch(user, normalized));
  }, [availableUsers, query]);

  const selectedUser = availableUsers.find((user) => user.id === selectedId) ?? null;

  function chooseUser(user: AppUser) {
    setSelectedId(user.id);
    onSelectedChange?.(user);
  }

  function clearSelection() {
    setSelectedId("");
    onSelectedChange?.(null);
  }

  return (
    <div className="space-y-3">
      <input type="hidden" name={name} value={selectedId} />

      <div>
        <label className="mb-1.5 block text-sm font-semibold text-slate-800">{labels.search}</label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && filteredUsers[0]) {
                event.preventDefault();
                chooseUser(filteredUsers[0]);
              }
            }}
            placeholder={labels.placeholder}
            aria-label={labels.placeholder}
            autoComplete="off"
            className="h-9 w-full rounded-md border border-slate-300 bg-white pl-8 pr-3 text-sm outline-none focus:border-slate-500"
          />
        </div>
      </div>

      <div
        role="listbox"
        aria-label={labels.search}
        className="h-56 overflow-y-auto rounded-md border border-slate-200 bg-slate-50/60"
      >
        {filteredUsers.length > 0 ? filteredUsers.map((user) => {
          const selected = selectedId === user.id;
          return (
            <button
              key={user.id}
              type="button"
              role="option"
              aria-selected={selected}
              onClick={() => chooseUser(user)}
              className={
                selected
                  ? "flex w-full items-start gap-2 border-b border-slate-100 bg-slate-900 px-3 py-2.5 text-left text-sm text-white last:border-b-0"
                  : "flex w-full items-start gap-2 border-b border-slate-100 px-3 py-2.5 text-left text-sm text-slate-800 hover:bg-white last:border-b-0"
              }
            >
              <span className="min-w-0 flex-1">
                <span className={`block truncate font-medium ${selected ? "text-white" : "text-slate-900"}`}>
                  {user.display_name}
                </span>
                <span className={`mt-0.5 block truncate text-xs ${selected ? "text-slate-300" : "text-slate-500"}`}>
                  {[user.username, user.email].filter(Boolean).join(" · ")}
                </span>
              </span>
              {selected ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-white" aria-hidden /> : null}
            </button>
          );
        }) : (
          <div className="flex h-full items-center justify-center px-3 py-6 text-sm text-slate-500">
            {availableUsers.length === 0 ? labels.noOptions : labels.empty}
          </div>
        )}
      </div>

      <div className="rounded-md border border-dashed border-slate-200 bg-white px-3 py-2 text-sm">
        {selectedUser ? (
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-xs text-slate-500">{labels.selected}</div>
              <div className="truncate font-medium text-slate-900">
                {selectedUser.display_name}
                <span className="ml-1.5 font-normal text-slate-500">{selectedUser.username}</span>
              </div>
            </div>
            <button
              type="button"
              onClick={clearSelection}
              className="shrink-0 text-xs font-medium text-slate-500 hover:text-slate-800"
            >
              {isZh ? "清除" : "Clear"}
            </button>
          </div>
        ) : (
          <div className="text-slate-500">{labels.hint}</div>
        )}
      </div>
    </div>
  );
}

function userMatchesSearch(user: AppUser, normalized: string) {
  return [
    user.display_name,
    user.username,
    user.email,
  ].some((value) => String(value ?? "").toLowerCase().includes(normalized));
}

function normalize(value: string) {
  return value.trim().toLowerCase();
}

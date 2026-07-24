import { AppUserCreateDialog } from "@/components/app-user-create-dialog";
import { AppUserManagementTable } from "@/components/app-user-management-table";
import { PageShellState } from "@/components/page-shell-state";
import { Button, Card, DataNotice, SelectInput, TextInput } from "@/components/ui";
import { getFilteredAppUsers } from "@/lib/data";
import { getPageI18n } from "@/lib/i18n/server";
import { listActiveRoles } from "@/lib/role-access";

export const dynamic = "force-dynamic";

const zh = {
  title: "\u7528\u6237",
  list: "\u8d26\u6237\u5217\u8868",
  filter: "\u7b5b\u9009",
  keyword: "\u7528\u6237\u540d/\u663e\u793a\u540d/\u7ec4\u7ec7/\u89d2\u8272",
  allRoles: "\u5168\u90e8\u89d2\u8272",
};

export default async function UsersPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale, dict } = await getPageI18n(params);
  const query = await searchParams;
  const getFilter = (key: string) => {
    const value = query[key];
    return Array.isArray(value) ? value[0] ?? "" : value ?? "";
  };
  const q = getFilter("q").trim();
  const rawRole = getFilter("role");
  const roles = await listActiveRoles();
  const roleCodes = new Set(roles.map((role) => role.code));
  const role = rawRole && roleCodes.has(rawRole) ? rawRole : "all";
  const pageParam = Number.parseInt(getFilter("page") || "1", 10);
  const perPageParam = Number.parseInt(getFilter("per_page") || "25", 10);
  const page = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1;
  const perPage = Number.isFinite(perPageParam) && perPageParam > 0 ? Math.min(100, Math.max(10, perPageParam)) : 25;
  const result = await getFilteredAppUsers({
    q,
    role: role === "all" ? "" : role,
  });
  const total = result.data.length;
  const pageCount = Math.max(1, Math.ceil(total / perPage));
  const currentPage = Math.min(page, pageCount);
  const from = (currentPage - 1) * perPage;
  const pagedUsers = result.data.slice(from, from + perPage);
  const isZh = locale === "zh";
  const queryParts = [
    q ? `q=${encodeURIComponent(q)}` : "",
    role !== "all" ? `role=${role}` : "",
  ].filter(Boolean);
  const currentPath = `/users${queryParts.length ? `?${queryParts.join("&")}` : ""}`;
  const roleOptions = roles.map((item) => ({ code: item.code, name: item.name }));

  return (
    <>
      <PageShellState locale={locale} dict={dict} title={isZh ? zh.title : "Users"} currentPath={currentPath} isDemo={result.isDemo} />
      <DataNotice dict={dict} error={result.error} />

      <Card className="mb-4">
        <form className="grid gap-3 md:grid-cols-[minmax(280px,1fr)_180px_120px]">
          <input type="hidden" name="per_page" value={perPage} />
          <TextInput
            name="q"
            defaultValue={q}
            placeholder={isZh ? zh.keyword : "Username / display name / organization / role"}
          />
          <SelectInput name="role" defaultValue={role}>
            <option value="all">{isZh ? zh.allRoles : "All roles"}</option>
            {roleOptions.map((item) => (
              <option key={item.code} value={item.code}>{item.name}</option>
            ))}
          </SelectInput>
          <Button type="submit">{isZh ? zh.filter : "Filter"}</Button>
        </form>
      </Card>

      <Card>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="font-semibold">{isZh ? zh.list : "Users"}</h2>
          <AppUserCreateDialog locale={locale} isZh={isZh} roles={roleOptions} />
        </div>
        <AppUserManagementTable
          users={pagedUsers}
          total={total}
          page={currentPage}
          perPage={perPage}
          locale={locale}
          roles={roleOptions}
          filters={{
            q,
            role,
          }}
        />
      </Card>
    </>
  );
}

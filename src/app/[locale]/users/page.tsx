import { AppUserManagementTable } from "@/components/app-user-management-table";
import { AppShell } from "@/components/app-shell";
import { Button, Card, DataNotice, SelectInput, TextInput } from "@/components/ui";
import { getAppUsers } from "@/lib/data";
import { getPageI18n } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function UsersPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale, dict } = await getPageI18n(params);
  const result = await getAppUsers();
  const isZh = locale === "zh";

  return (
    <AppShell locale={locale} dict={dict} title={isZh ? "用户管理" : "User Management"} currentPath="/users" isDemo={result.isDemo}>
      <DataNotice dict={dict} error={result.error} />

      <Card className="mb-4">
        <h2 className="mb-3 font-semibold">{isZh ? "新增 H5 账户" : "Add H5 user"}</h2>
        <form action="/api/app-users" method="post" className="grid gap-3 md:grid-cols-5">
          <input type="hidden" name="return_to" value={`/${locale}/users`} />
          <TextInput name="username" placeholder={isZh ? "用户名" : "Username"} required />
          <TextInput name="display_name" placeholder={isZh ? "展示名" : "Display name"} required />
          <TextInput name="password" type="password" placeholder={isZh ? "初始密码" : "Initial password"} required />
          <SelectInput name="role" defaultValue="field_agent">
            <option value="field_agent">{isZh ? "巡店人员" : "Field agent"}</option>
            <option value="manager">{isZh ? "经理" : "Manager"}</option>
            <option value="admin">{isZh ? "管理员" : "Admin"}</option>
          </SelectInput>
          <Button type="submit">{isZh ? "新增" : "Add"}</Button>
        </form>
      </Card>

      <Card>
        <AppUserManagementTable users={result.data} locale={locale} />
      </Card>
    </AppShell>
  );
}

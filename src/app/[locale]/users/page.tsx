import { AppShell } from "@/components/app-shell";
import { AppUserCreateDialog } from "@/components/app-user-create-dialog";
import { AppUserManagementTable } from "@/components/app-user-management-table";
import { Card, DataNotice } from "@/components/ui";
import { getAppUsers } from "@/lib/data";
import { getPageI18n } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

const zh = {
  title: "\u7528\u6237\u7ba1\u7406",
  list: "\u8d26\u6237\u5217\u8868",
};

export default async function UsersPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale, dict } = await getPageI18n(params);
  const result = await getAppUsers();
  const isZh = locale === "zh";

  return (
    <AppShell locale={locale} dict={dict} title={isZh ? zh.title : "User Management"} currentPath="/users" isDemo={result.isDemo}>
      <DataNotice dict={dict} error={result.error} />

      <Card>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="font-semibold">{isZh ? zh.list : "Users"}</h2>
          <AppUserCreateDialog locale={locale} isZh={isZh} />
        </div>
        <AppUserManagementTable users={result.data} locale={locale} />
      </Card>
    </AppShell>
  );
}

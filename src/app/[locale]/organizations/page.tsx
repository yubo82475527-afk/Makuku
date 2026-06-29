import { PageShellState } from "@/components/page-shell-state";
import { OrganizationManagement } from "@/components/organization-management";
import { Card, DataNotice } from "@/components/ui";
import { getAppUsers, getOrganizations } from "@/lib/data";
import { getPageI18n } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function OrganizationsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale, dict } = await getPageI18n(params);
  const [organizationsResult, usersResult] = await Promise.all([getOrganizations(), getAppUsers()]);
  const isZh = locale === "zh";

  return (
    <>
      <PageShellState locale={locale} dict={dict} title={isZh ? "\u7ec4\u7ec7\u7ba1\u7406" : "Organization Management"} currentPath="/organizations" isDemo={organizationsResult.isDemo || usersResult.isDemo} />
      <DataNotice dict={dict} error={organizationsResult.error ?? usersResult.error} />

      <Card>
        <div className="mb-3">
          <h2 className="font-semibold">{isZh ? "\u7ec4\u7ec7\u3001\u6210\u5458\u548c\u8d1f\u8d23\u533a\u57df" : "Organizations, members, and regions"}</h2>
          <p className="mt-1 text-sm text-slate-500">
            {isZh
              ? "\u65b0\u589e\u95e8\u5e97\u65f6\u4f1a\u6839\u636e\u7701\u5e02\u533a\u81ea\u52a8\u5339\u914d\u7ec4\u7ec7\uff1b\u533a\u7ea7\u89c4\u5219\u4f18\u5148\uff0c\u5e02\u7ea7\u89c4\u5219\u515c\u5e95\u3002"
              : "New stores are assigned by province, city, and district. District rules win over city rules."}
          </p>
        </div>
        <OrganizationManagement organizations={organizationsResult.data} users={usersResult.data} locale={locale} />
      </Card>
    </>
  );
}

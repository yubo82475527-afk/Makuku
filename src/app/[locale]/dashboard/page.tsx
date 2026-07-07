import { DashboardClient } from "@/components/dashboard-client";
import { PageShellState } from "@/components/page-shell-state";
import { getPageI18n } from "@/lib/i18n/server";
import type { DashboardSearchParams } from "@/lib/dashboard-data";

function dashboardSearchSuffix(filters: DashboardSearchParams) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value) query.set(key, value);
  }
  const serialized = query.toString();
  return serialized ? `?${serialized}` : "";
}

export default async function DashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<DashboardSearchParams>;
}) {
  const { locale, dict } = await getPageI18n(params);
  const query = await searchParams;
  const queryString = dashboardSearchSuffix(query);

  return (
    <>
      <PageShellState
        locale={locale}
        dict={dict}
        title={locale === "zh" ? "首页" : "Dashboard"}
        currentPath={`/dashboard${queryString}`}
      />
      <DashboardClient locale={locale} dict={dict} queryString={queryString.slice(1)} />
    </>
  );
}

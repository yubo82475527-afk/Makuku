import { PageShellState } from "@/components/page-shell-state";
import { DashboardClient } from "@/components/dashboard-client";
import { getPageI18n } from "@/lib/i18n/server";

export default async function DashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale, dict } = await getPageI18n(params);
  const isZh = locale === "zh";
  const queryString = toQueryString(await searchParams);

  return (
    <>
      <PageShellState
        locale={locale}
        dict={dict}
        title={isZh ? "首页" : "Dashboard"}
        currentPath="/dashboard"
        isDemo={false}
      />

      <DashboardClient locale={locale} dict={dict} queryString={queryString} />
    </>
  );
}

function toQueryString(searchParams: Record<string, string | string[] | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (Array.isArray(value)) {
      for (const item of value) params.append(key, item);
      continue;
    }
    if (value) params.set(key, value);
  }
  return params.toString();
}

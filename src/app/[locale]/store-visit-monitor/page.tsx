import { PageShellState } from "@/components/page-shell-state";
import { StoreVisitMonitorClient } from "@/components/store-visit-monitor-client";
import { getPageI18n } from "@/lib/i18n/server";
import { isAllowedAdminRole, readSessionFromCookies } from "@/lib/auth-session";

export const dynamic = "force-dynamic";

function monitorSearchSuffix(filters: Record<string, string | string[] | undefined>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    const text = Array.isArray(value) ? value[0] : value;
    if (text) query.set(key, text);
  }
  const serialized = query.toString();
  return serialized ? `?${serialized}` : "";
}

export default async function StoreVisitMonitorPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale, dict } = await getPageI18n(params);
  const filters = await searchParams;
  const queryString = monitorSearchSuffix(filters);
  const session = await readSessionFromCookies();
  const canRerunMatching = isAllowedAdminRole(session?.role);

  return (
    <>
      <PageShellState
        locale={locale}
        dict={dict}
        title={locale === "zh" ? "巡店记录" : "Store Visit Records"}
        currentPath={`/store-visit-monitor${queryString}`}
      />
      <StoreVisitMonitorClient locale={locale} dict={dict} queryString={queryString.slice(1)} canRerunMatching={canRerunMatching} />
    </>
  );
}

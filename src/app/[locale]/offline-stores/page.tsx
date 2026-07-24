import { PageShellState } from "@/components/page-shell-state";
import { StoreMasterTable } from "@/components/store-master-table";
import { Button, Card, DataNotice, SelectInput } from "@/components/ui";
import { getOfflineStores, getOrganizations } from "@/lib/data";
import {
  clampOrganizationFilter,
  organizationsVisibleInScope,
  resolveSessionDataScope,
} from "@/lib/data-scope";
import { getPageI18n } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function OfflineStoresPage({
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

  const rawStatus = getFilter("status");
  const rawOrganization = getFilter("organization");
  const statusFilter = rawStatus === "disabled" || rawStatus === "all" ? rawStatus : "enabled";
  const dataScope = await resolveSessionDataScope();
  const organizationFilter = clampOrganizationFilter(rawOrganization.trim() || "all", dataScope);
  const pageParam = Number.parseInt(getFilter("page") || "1", 10);
  const perPageParam = Number.parseInt(getFilter("per_page") || "25", 10);
  const page = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1;
  const perPage = Number.isFinite(perPageParam) && perPageParam > 0 ? Math.min(100, Math.max(10, perPageParam)) : 25;

  const [storesResult, organizationsResult] = await Promise.all([
    getOfflineStores({ status: statusFilter, organization: organizationFilter, dataScope }),
    getOrganizations(),
  ]);
  const visibleOrganizations = organizationsVisibleInScope(organizationsResult.data, dataScope);
  const total = storesResult.data.length;
  const pageCount = Math.max(1, Math.ceil(total / perPage));
  const currentPage = Math.min(page, pageCount);
  const from = (currentPage - 1) * perPage;
  const pagedStores = storesResult.data.slice(from, from + perPage);
  const isZh = locale === "zh";
  const queryParts = [
    statusFilter === "enabled" ? "" : `status=${statusFilter}`,
    organizationFilter === "all" ? "" : `organization=${organizationFilter}`,
  ].filter(Boolean);
  const currentPath = `/offline-stores${queryParts.length ? `?${queryParts.join("&")}` : ""}`;

  return (
    <>
      <PageShellState locale={locale} dict={dict} title={isZh ? "\u95e8\u5e97\u5217\u8868" : "Store List"} currentPath={currentPath} isDemo={storesResult.isDemo || organizationsResult.isDemo} />
      <DataNotice dict={dict} error={storesResult.error ?? organizationsResult.error} />

      <Card className="mb-4">
        <div className="flex flex-wrap items-center gap-3">
          <form className="grid flex-1 gap-3 md:grid-cols-[160px_240px_120px]">
            <input type="hidden" name="per_page" value={perPage} />
            <SelectInput name="status" defaultValue={statusFilter}>
              <option value="enabled">{isZh ? "\u542f\u7528" : "Enabled"}</option>
              <option value="disabled">{isZh ? "\u7981\u7528" : "Disabled"}</option>
              <option value="all">{isZh ? "\u5168\u90e8" : "All"}</option>
            </SelectInput>
            <SelectInput name="organization" defaultValue={organizationFilter === "empty" ? "all" : organizationFilter}>
              <option value="all">{isZh ? "\u5168\u90e8\u7ec4\u7ec7" : "All organizations"}</option>
              {dataScope.mode === "all" ? (
                <option value="unassigned">{isZh ? "\u672a\u5206\u914d\u7ec4\u7ec7" : "Unassigned"}</option>
              ) : null}
              {visibleOrganizations.map((organization) => (
                <option key={organization.id} value={organization.id}>{organization.name}</option>
              ))}
            </SelectInput>
            <Button type="submit">{isZh ? "\u7b5b\u9009" : "Filter"}</Button>
          </form>
        </div>
      </Card>

      <Card>
        <StoreMasterTable
          stores={pagedStores}
          total={total}
          page={currentPage}
          perPage={perPage}
          organizations={visibleOrganizations}
          locale={locale}
          filters={{
            status: statusFilter,
            organization: organizationFilter,
          }}
        />
      </Card>
    </>
  );
}

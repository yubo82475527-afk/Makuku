import { PageShellState } from "@/components/page-shell-state";
import { StoreMasterTable } from "@/components/store-master-table";
import { Button, Card, DataNotice, SelectInput } from "@/components/ui";
import { getOfflineStores, getOrganizations } from "@/lib/data";
import { getPageI18n } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function OfflineStoresPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ status?: string | string[] | undefined; organization?: string | string[] | undefined }>;
}) {
  const { locale, dict } = await getPageI18n(params);
  const query = await searchParams;
  const rawStatus = Array.isArray(query.status) ? query.status[0] : query.status;
  const rawOrganization = Array.isArray(query.organization) ? query.organization[0] : query.organization;
  const statusFilter = rawStatus === "disabled" || rawStatus === "all" ? rawStatus : "enabled";
  const organizationFilter = rawOrganization?.trim() || "all";
  const [storesResult, organizationsResult] = await Promise.all([
    getOfflineStores({ status: statusFilter, organization: organizationFilter }),
    getOrganizations(),
  ]);
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
            <SelectInput name="status" defaultValue={statusFilter}>
              <option value="enabled">{isZh ? "\u542f\u7528" : "Enabled"}</option>
              <option value="disabled">{isZh ? "\u7981\u7528" : "Disabled"}</option>
              <option value="all">{isZh ? "\u5168\u90e8" : "All"}</option>
            </SelectInput>
            <SelectInput name="organization" defaultValue={organizationFilter}>
              <option value="all">{isZh ? "\u5168\u90e8\u7ec4\u7ec7" : "All organizations"}</option>
              <option value="unassigned">{isZh ? "\u672a\u5206\u914d\u7ec4\u7ec7" : "Unassigned"}</option>
              {organizationsResult.data.map((organization) => (
                <option key={organization.id} value={organization.id}>{organization.name}</option>
              ))}
            </SelectInput>
            <Button type="submit">{isZh ? "\u7b5b\u9009" : "Filter"}</Button>
          </form>
        </div>
      </Card>

      <Card>
        <StoreMasterTable
          stores={storesResult.data}
          organizations={organizationsResult.data}
          locale={locale}
        />
      </Card>
    </>
  );
}

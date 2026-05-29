import { AppShell } from "@/components/app-shell";
import { StoreVisitAiDebugClient } from "@/components/store-visit-ai-debug-client";
import { Card, DataNotice, EmptyState } from "@/components/ui";
import { getOfflineStoreVisits } from "@/lib/data";
import { getPageI18n } from "@/lib/i18n/server";
import { listStoreVisitAiConfigs } from "@/lib/store-visit-ai-config";

export const dynamic = "force-dynamic";

export default async function StoreVisitAiDebugPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale, dict } = await getPageI18n(params);
  const [visitsResult, configResult] = await Promise.all([
    getOfflineStoreVisits({ limit: 50 }),
    listStoreVisitAiConfigs(),
  ]);

  return (
    <AppShell locale={locale} dict={dict} title="Store Visit AI Debug" currentPath="/store-visit-ai-debug" isDemo={visitsResult.isDemo || configResult.isDemo}>
      <DataNotice dict={dict} error={visitsResult.error ?? configResult.error} />
      <div className="mb-4">
        <Card>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold">AI parsing debug and production configuration</h2>
              <p className="mt-1 max-w-3xl text-sm text-slate-500">
                Test prompt and parameter changes against existing store visits. Test runs do not save visit results, change status, or create price candidates.
              </p>
            </div>
            <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">
              Save is enabled only after a successful test.
            </div>
          </div>
        </Card>
      </div>
      {visitsResult.data.length === 0 ? (
        <EmptyState text="No store visits are available for AI debugging." />
      ) : (
        <StoreVisitAiDebugClient visits={visitsResult.data} activeConfig={configResult.active} history={configResult.history} />
      )}
    </AppShell>
  );
}

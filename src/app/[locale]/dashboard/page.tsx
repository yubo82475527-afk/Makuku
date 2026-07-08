import { PageShellState } from "@/components/page-shell-state";
import { Card } from "@/components/ui";
import { getPageI18n } from "@/lib/i18n/server";

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale, dict } = await getPageI18n(params);
  const isZh = locale === "zh";

  return (
    <>
      <PageShellState
        locale={locale}
        dict={dict}
        title={isZh ? "首页" : "Dashboard"}
        currentPath="/dashboard"
        isDemo={false}
      />

      <Card className="space-y-4">
        <div className="space-y-2">
          <div className="text-xs font-semibold uppercase tracking-normal text-slate-500">
            {isZh ? "重构中" : "Refactor in Progress"}
          </div>
          <h1 className="text-2xl font-semibold tracking-normal text-slate-950">
            {isZh ? "仪表盘重构中" : "Dashboard under refactor"}
          </h1>
          <p className="max-w-2xl text-sm text-slate-600">
            {isZh
              ? "当前已临时停用首页仪表盘的所有报表查询，避免本地环境进入其他页面时被首页 SSR 阻塞。重构完成后再恢复数据加载。"
              : "All dashboard report queries are temporarily disabled so the local app can enter other routes without being blocked by homepage SSR. Data loading will return after the refactor."}
          </p>
        </div>
      </Card>
    </>
  );
}

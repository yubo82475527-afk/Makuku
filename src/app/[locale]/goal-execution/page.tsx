import { NavPlaceholderPage } from "@/components/nav-placeholder-page";
import { PageShellState } from "@/components/page-shell-state";
import { Card } from "@/components/ui";
import { getPageI18n } from "@/lib/i18n/server";

export default async function GoalExecutionPage({
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
        title={isZh ? "目标执行2.0" : "Goal Execution 2.0"}
        currentPath="/goal-execution"
      />

      <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
        {isZh ? "示意数据，非生产事实" : "Mock data — not production facts"}
      </div>

      <Card className="mb-4">
        <h2 className="font-semibold">{isZh ? "本周目标摘要" : "This week summary"}</h2>
        <p className="mt-1 text-sm text-slate-500">
          {isZh
            ? "制定目标后，同一页查看完成情况。周期按周管理。"
            : "Set goals and track completion on the same page. Managed by week."}
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
            <div className="text-xs text-slate-500">{isZh ? "目标门店" : "Target stores"}</div>
            <div className="mt-1 text-2xl font-semibold">24</div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
            <div className="text-xs text-slate-500">{isZh ? "已完成" : "Completed"}</div>
            <div className="mt-1 text-2xl font-semibold">15</div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
            <div className="text-xs text-slate-500">{isZh ? "完成率" : "Completion"}</div>
            <div className="mt-1 text-2xl font-semibold">63%</div>
          </div>
        </div>
      </Card>

      <NavPlaceholderPage
        isZh={isZh}
        showBanner={false}
        description={
          isZh
            ? "目标拆到门店与导购，并直接显示完成状态。"
            : "Goals assigned to stores and promoters, with completion status."
        }
        columns={
          isZh
            ? [
                { key: "store", label: "门店" },
                { key: "promoter", label: "导购" },
                { key: "goal", label: "本周目标" },
                { key: "progress", label: "完成情况" },
                { key: "source", label: "来源" },
              ]
            : [
                { key: "store", label: "Store" },
                { key: "promoter", label: "Promoter" },
                { key: "goal", label: "Weekly goal" },
                { key: "progress", label: "Progress" },
                { key: "source", label: "Source" },
              ]
        }
        rows={
          isZh
            ? [
                { store: "Toko Berkah Jaya", promoter: "Andi", goal: "采价核实", progress: "未完成", source: "完美终端失守" },
                { store: "Apotek Sehat 21", promoter: "Siti", goal: "采价核实", progress: "已完成", source: "完美终端失守" },
                { store: "Baby Care Menteng", promoter: "Andi", goal: "补采价签", progress: "进行中", source: "重点店" },
                { store: "Warung Sari", promoter: "Budi", goal: "本周拜访采价", progress: "未完成", source: "覆盖目标" },
                { store: "Toko Maju", promoter: "Rina", goal: "本周拜访采价", progress: "已完成", source: "覆盖目标" },
              ]
            : [
                { store: "Toko Berkah Jaya", promoter: "Andi", goal: "Price verify", progress: "Open", source: "Perfect Store" },
                { store: "Apotek Sehat 21", promoter: "Siti", goal: "Price verify", progress: "Done", source: "Perfect Store" },
                { store: "Baby Care Menteng", promoter: "Andi", goal: "Retake price tags", progress: "In progress", source: "Priority store" },
                { store: "Warung Sari", promoter: "Budi", goal: "Visit & capture", progress: "Open", source: "Coverage" },
                { store: "Toko Maju", promoter: "Rina", goal: "Visit & capture", progress: "Done", source: "Coverage" },
              ]
        }
      />
    </>
  );
}

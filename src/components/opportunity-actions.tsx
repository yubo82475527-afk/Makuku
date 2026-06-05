import {
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  Crosshair,
  Search,
  ShieldAlert,
  Store,
} from "lucide-react";
import Link from "next/link";
import type { ComponentType } from "react";
import { Badge, Card } from "@/components/ui";
import type { OpportunityAction, OpportunityActionStatus, OpportunityActionType } from "@/lib/types";

const typeIcons: Record<OpportunityActionType, ComponentType<{ className?: string }>> = {
  review_price: ClipboardCheck,
  capture_evidence: Store,
  inspect_promo: Search,
  defend_city: ShieldAlert,
  expand_channel: Crosshair,
};

export function PriorityActionCard({ action, locale }: { action: OpportunityAction; locale: string }) {
  const Icon = typeIcons[action.type];
  return (
    <Link href={action.href} className="block">
      <Card className="h-full border-slate-300 hover:border-slate-500">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-slate-950 text-white">
              <Icon className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={action.severity ?? "neutral"}>{action.severity ?? actionStatusLabel(action.status, locale)}</Badge>
                <span className="text-xs font-medium text-slate-500">{actionTypeLabel(action.type, locale)}</span>
              </div>
              <h2 className="mt-2 text-base font-semibold leading-6 text-slate-950">{action.title}</h2>
            </div>
          </div>
          <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-slate-400" />
        </div>
        <p className="mt-3 text-sm leading-5 text-slate-600">{action.reason}</p>
        <div className="mt-3 rounded-md bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600">{action.evidence}</div>
        <div className="mt-3 text-sm font-medium text-slate-900">{actionCtaLabel(action.type, locale)}</div>
      </Card>
    </Link>
  );
}

export function OpportunityTaskCard({ action, locale }: { action: OpportunityAction; locale: string }) {
  const Icon = typeIcons[action.type];
  return (
    <Link href={action.href} className="block">
      <Card className="hover:border-slate-300">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px] lg:items-start">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={action.severity ?? "neutral"}>{action.severity ?? actionStatusLabel(action.status, locale)}</Badge>
              <Badge>{actionStatusLabel(action.status, locale)}</Badge>
              <span className="text-xs font-medium text-slate-500">{actionTypeLabel(action.type, locale)}</span>
            </div>
            <div className="mt-3 flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-700">
                <Icon className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <h2 className="break-words font-semibold text-slate-950">{action.title}</h2>
                <p className="mt-2 text-sm leading-5 text-slate-600">{action.reason}</p>
              </div>
            </div>
            <div className="mt-3 rounded-md bg-slate-50 px-3 py-2 text-sm leading-5 text-slate-600">
              <span className="font-medium text-slate-900">{locale === "zh" ? "证据：" : "Evidence: "}</span>
              {action.evidence}
            </div>
          </div>
          <div className="rounded-md border border-slate-200 px-3 py-3 text-sm">
            <ActionMeta label={locale === "zh" ? "城市" : "City"} value={action.city ?? "-"} />
            <ActionMeta label={locale === "zh" ? "渠道" : "Channel"} value={action.channelCode ?? "-"} />
            <ActionMeta label={locale === "zh" ? "品类" : "Category"} value={action.category ?? "-"} />
            <ActionMeta label={locale === "zh" ? "优先分" : "Priority"} value={String(action.priorityScore)} />
            <div className="mt-3 flex items-center justify-center rounded-md bg-slate-950 px-3 py-2 text-sm font-medium text-white">
              {actionCtaLabel(action.type, locale)}
            </div>
          </div>
        </div>
      </Card>
    </Link>
  );
}

export function OpportunityQueueTabs({
  locale,
  currentStatus,
  baseHref,
  counts,
}: {
  locale: string;
  currentStatus: string;
  baseHref: string;
  counts: Record<"all" | OpportunityActionStatus, number>;
}) {
  const tabs: Array<{ value: "all" | OpportunityActionStatus; label: string; href: string }> = [
    { value: "all", label: locale === "zh" ? "全部" : "All", href: baseHref },
    { value: "open", label: locale === "zh" ? "高风险" : "High risk", href: `${baseHref}?status=open` },
    { value: "pending_review", label: locale === "zh" ? "待复核" : "Pending review", href: `${baseHref}?status=pending_review` },
    { value: "capture_needed", label: locale === "zh" ? "补采" : "Capture gaps", href: `${baseHref}?status=capture_needed` },
    { value: "completed", label: locale === "zh" ? "已完成" : "Completed", href: `${baseHref}?status=completed` },
  ];

  return (
    <div className="mb-4 flex gap-2 overflow-x-auto">
      {tabs.map((tab) => {
        const active = currentStatus === tab.value || (!currentStatus && tab.value === "all");
        return (
          <Link
            key={tab.value}
            href={tab.href}
            className={active
              ? "whitespace-nowrap rounded-md bg-slate-950 px-3 py-2 text-sm font-medium text-white"
              : "whitespace-nowrap rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"}
          >
            {tab.label} <span className="ml-1 opacity-75">{counts[tab.value]}</span>
          </Link>
        );
      })}
    </div>
  );
}

function ActionMeta({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-100 py-1.5 last:border-b-0">
      <span className="text-slate-500">{label}</span>
      <span className="truncate font-medium text-slate-900">{value}</span>
    </div>
  );
}

function actionTypeLabel(type: OpportunityActionType, locale: string) {
  const labels: Record<OpportunityActionType, { zh: string; en: string }> = {
    review_price: { zh: "价格复核", en: "Price review" },
    capture_evidence: { zh: "补采证据", en: "Capture evidence" },
    inspect_promo: { zh: "促销复核", en: "Promo review" },
    defend_city: { zh: "城市防守", en: "City defense" },
    expand_channel: { zh: "渠道扩展", en: "Channel expansion" },
  };
  return labels[type][locale === "zh" ? "zh" : "en"];
}

function actionStatusLabel(status: OpportunityActionStatus, locale: string) {
  const labels: Record<OpportunityActionStatus, { zh: string; en: string }> = {
    open: { zh: "待处理", en: "Open" },
    pending_review: { zh: "待复核", en: "Pending review" },
    capture_needed: { zh: "待补采", en: "Capture needed" },
    completed: { zh: "已完成", en: "Completed" },
  };
  return labels[status][locale === "zh" ? "zh" : "en"];
}

function actionCtaLabel(type: OpportunityActionType, locale: string) {
  const labels: Record<OpportunityActionType, { zh: string; en: string }> = {
    review_price: { zh: "去复核价格", en: "Review prices" },
    capture_evidence: { zh: "去补采证据", en: "Capture evidence" },
    inspect_promo: { zh: "查看促销证据", en: "Inspect promo" },
    defend_city: { zh: "查看城市机会", en: "View city actions" },
    expand_channel: { zh: "查看渠道机会", en: "View channel gap" },
  };
  return labels[type][locale === "zh" ? "zh" : "en"];
}

export function CompletedActionIcon() {
  return <CheckCircle2 className="h-4 w-4" />;
}

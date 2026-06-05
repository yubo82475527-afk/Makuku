import { AppShell } from "@/components/app-shell";
import { OpportunityQueueTabs, OpportunityTaskCard } from "@/components/opportunity-actions";
import { Button, Card, DataNotice, EmptyState, SelectInput, TextInput } from "@/components/ui";
import { getBrands, getChannels, getOpportunityActions } from "@/lib/data";
import { getPageI18n } from "@/lib/i18n/server";
import { translateEnum } from "@/lib/i18n/get-dictionary";
import type { OpportunityActionStatus } from "@/lib/types";

export default async function PromoEventsPage({
  params: routeParams,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ severity?: string; channel?: string; brand?: string; city?: string; category?: string; status?: string }>;
}) {
  const { locale, dict } = await getPageI18n(routeParams);
  const params = await searchParams;
  const [actionsResult, brandsResult, channelsResult] = await Promise.all([getOpportunityActions(locale), getBrands(), getChannels()]);
  const categories = Array.from(new Set(actionsResult.data.map((action) => action.category).filter((category): category is string => Boolean(category)))).sort();
  const selectedBrand = params.brand ? brandsResult.data.find((brand) => brand.id === params.brand) : null;
  const actions = actionsResult.data.filter((action) => {
    if (params.status && params.status !== "all" && action.status !== params.status) return false;
    if (params.severity && action.severity !== params.severity) return false;
    if (params.channel && action.channelCode !== params.channel) return false;
    if (selectedBrand && action.brandName !== selectedBrand.name) return false;
    if (params.city && action.city !== params.city) return false;
    if (params.category && action.category !== params.category) return false;
    return true;
  });

  const counts: Record<"all" | OpportunityActionStatus, number> = {
    all: actionsResult.data.length,
    open: actionsResult.data.filter((action) => action.status === "open").length,
    pending_review: actionsResult.data.filter((action) => action.status === "pending_review").length,
    capture_needed: actionsResult.data.filter((action) => action.status === "capture_needed").length,
    completed: actionsResult.data.filter((action) => action.status === "completed").length,
  };

  return (
    <AppShell
      locale={locale}
      dict={dict}
      title={locale === "zh" ? "\u673a\u4f1a\u5904\u7406\u53f0" : "Operating Queue"}
      currentPath="/promo-events"
      isDemo={actionsResult.isDemo || brandsResult.isDemo || channelsResult.isDemo}
    >
      <DataNotice dict={dict} error={actionsResult.error ?? brandsResult.error ?? channelsResult.error} />

      <OpportunityQueueTabs
        locale={locale}
        currentStatus={params.status ?? "all"}
        baseHref={`/${locale}/promo-events`}
        counts={counts}
      />

      <Card className="mb-4">
        <form className="grid gap-3 md:grid-cols-6">
          {params.status && params.status !== "all" ? <input type="hidden" name="status" value={params.status} /> : null}
          <SelectInput name="severity" defaultValue={params.severity ?? ""}>
            <option value="">{dict.common.allSeverity}</option>
            <option value="critical">{translateEnum(dict, "severity", "critical")}</option>
            <option value="high">{translateEnum(dict, "severity", "high")}</option>
            <option value="medium">{translateEnum(dict, "severity", "medium")}</option>
            <option value="low">{translateEnum(dict, "severity", "low")}</option>
          </SelectInput>
          <SelectInput name="channel" defaultValue={params.channel ?? ""}>
            <option value="">{dict.common.allChannels}</option>
            {channelsResult.data.filter((channel) => channel.active).map((channel) => (
              <option key={channel.id} value={channel.code}>{channel.name}</option>
            ))}
          </SelectInput>
          <SelectInput name="category" defaultValue={params.category ?? ""}>
            <option value="">{locale === "zh" ? "\u5168\u90e8\u54c1\u7c7b" : "All categories"}</option>
            {categories.map((category) => <option key={category} value={category}>{category}</option>)}
          </SelectInput>
          <SelectInput name="brand" defaultValue={params.brand ?? ""}>
            <option value="">{dict.common.allBrands}</option>
            {brandsResult.data.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}
          </SelectInput>
          <TextInput name="city" placeholder={dict.common.city} defaultValue={params.city ?? ""} />
          <Button type="submit">{dict.common.filter}</Button>
        </form>
      </Card>

      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">{locale === "zh" ? "\u673a\u4f1a\u5904\u7406\u53f0" : "Operating Queue"}</h2>
          <p className="mt-1 text-sm text-slate-500">
            {locale === "zh"
              ? "\u6309\u5f71\u54cd\u4f18\u5148\u6392\u5e8f\uff0c\u6bcf\u5f20\u5361\u90fd\u7ed9\u51fa\u539f\u56e0\u3001\u8bc1\u636e\u548c\u4e0b\u4e00\u6b65\u3002"
              : "Sorted by impact, with reason, evidence, and next step on every card."}
          </p>
        </div>
        <div className="text-sm text-slate-500">{actions.length} / {actionsResult.data.length}</div>
      </div>

      <div className="space-y-3">
        {actions.length === 0 ? (
          <EmptyState
            text={locale === "zh"
              ? "\u6682\u65e0\u4f18\u5148\u52a8\u4f5c\uff0c\u5148\u5b8c\u6210\u95e8\u5e97\u91c7\u96c6\u6216\u4ef7\u683c\u590d\u6838\u3002"
              : "No priority actions yet. Complete store capture or price review first."}
          />
        ) : null}
        {actions.map((action) => <OpportunityTaskCard key={action.id} action={action} locale={locale} />)}
      </div>
    </AppShell>
  );
}

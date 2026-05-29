import { MarkAlertReadButton } from "@/components/client-actions";
import { AppShell } from "@/components/app-shell";
import { Badge, Card, DataNotice, SelectInput } from "@/components/ui";
import { formatJakartaTime } from "@/lib/format";
import { getAlerts } from "@/lib/data";
import { getPageI18n } from "@/lib/i18n/server";
import { translateEnum } from "@/lib/i18n/get-dictionary";

export default async function AlertsPage({
  params: routeParams,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ severity?: string }>;
}) {
  const { locale, dict } = await getPageI18n(routeParams);
  const params = await searchParams;
  const result = await getAlerts();
  const alerts = result.data.filter((alert) => !params.severity || alert.severity === params.severity);

  return (
    <AppShell locale={locale} dict={dict} title={dict.alerts.title} currentPath="/alerts" isDemo={result.isDemo}>
      <DataNotice dict={dict} error={result.error} />
      <Card className="mb-4">
        <form className="max-w-xs">
          <SelectInput name="severity" defaultValue={params.severity ?? ""}>
            <option value="">{dict.common.allSeverity}</option>
            <option value="critical">{translateEnum(dict, "severity", "critical")}</option>
            <option value="high">{translateEnum(dict, "severity", "high")}</option>
            <option value="medium">{translateEnum(dict, "severity", "medium")}</option>
            <option value="low">{translateEnum(dict, "severity", "low")}</option>
          </SelectInput>
        </form>
      </Card>
      <div className="space-y-3">
        {alerts.map((alert) => (
          <Card key={alert.id} className={alert.read ? "opacity-70" : undefined}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={alert.severity}>{translateEnum(dict, "severity", alert.severity)}</Badge>
                  <span className="text-xs text-slate-500">{formatJakartaTime(alert.created_at)}</span>
                  {alert.read ? <Badge>{dict.common.read}</Badge> : <Badge>{dict.common.unread}</Badge>}
                </div>
                <h2 className="mt-2 font-semibold">{alert.title}</h2>
                <p className="mt-1 text-sm text-slate-600">{alert.message}</p>
              </div>
              {!alert.read ? <MarkAlertReadButton alertId={alert.id} label={dict.alerts.markRead} /> : null}
            </div>
          </Card>
        ))}
      </div>
    </AppShell>
  );
}

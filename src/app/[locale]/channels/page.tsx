import { PageShellState } from "@/components/page-shell-state";
import { Badge, Button, Card, DataNotice, SelectInput, TextInput } from "@/components/ui";
import { getChannels } from "@/lib/data";
import { getPageI18n } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function ChannelsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale, dict } = await getPageI18n(params);
  const result = await getChannels();
  const isZh = locale === "zh";

  return (
    <>
      <PageShellState locale={locale} dict={dict} title={isZh ? "\u6e20\u9053\u5217\u8868" : "Channel List"} currentPath="/channels" isDemo={result.isDemo} />
      <DataNotice dict={dict} error={result.error} />

      <Card className="mb-4">
        <h2 className="mb-3 font-semibold">{isZh ? "\u65b0\u589e\u6e20\u9053" : "Add channel"}</h2>
        <form action="/api/channels" method="post" className="grid gap-3 md:grid-cols-[1fr_1fr_160px_120px_auto]">
          <input type="hidden" name="return_to" value={`/${locale}/channels`} />
          <TextInput name="code" placeholder={isZh ? "\u6e20\u9053\u7f16\u7801" : "Channel code"} required />
          <TextInput name="name" placeholder={isZh ? "\u6e20\u9053\u540d\u79f0" : "Channel name"} required />
          <SelectInput name="type" defaultValue="offline" required>
            <option value="offline">{isZh ? "\u7ebf\u4e0b" : "Offline"}</option>
            <option value="online">{isZh ? "\u7ebf\u4e0a" : "Online"}</option>
          </SelectInput>
          <TextInput name="sort_order" type="number" placeholder={isZh ? "\u6392\u5e8f" : "Sort"} defaultValue="100" />
          <Button type="submit">{isZh ? "\u65b0\u589e" : "Add"}</Button>
        </form>
      </Card>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
              <tr>
                <th className="py-2 pr-3">{isZh ? "\u6e20\u9053" : "Channel"}</th>
                <th className="py-2 pr-3">{isZh ? "\u7f16\u7801" : "Code"}</th>
                <th className="py-2 pr-3">{isZh ? "\u7c7b\u578b" : "Type"}</th>
                <th className="py-2 pr-3">{isZh ? "\u6392\u5e8f" : "Sort"}</th>
                <th className="py-2 pr-3">{isZh ? "\u72b6\u6001" : "Status"}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {result.data.map((channel) => (
                <tr key={channel.id}>
                  <td className="py-3 pr-3 font-medium">{channel.name}</td>
                  <td className="py-3 pr-3">{channel.code}</td>
                  <td className="py-3 pr-3"><Badge>{channel.type === "offline" ? (isZh ? "\u7ebf\u4e0b" : "Offline") : (isZh ? "\u7ebf\u4e0a" : "Online")}</Badge></td>
                  <td className="py-3 pr-3">{channel.sort_order}</td>
                  <td className="py-3 pr-3">{channel.active ? (isZh ? "\u542f\u7528" : "Active") : (isZh ? "\u505c\u7528" : "Inactive")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}

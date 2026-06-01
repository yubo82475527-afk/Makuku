import { AppShell } from "@/components/app-shell";
import { Badge, Button, Card, DataNotice, SelectInput, TextInput } from "@/components/ui";
import { getChannels, getOfflineStores } from "@/lib/data";
import { getPageI18n } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function OfflineStoresPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale, dict } = await getPageI18n(params);
  const [storesResult, channelsResult] = await Promise.all([getOfflineStores(), getChannels()]);
  const offlineChannels = channelsResult.data.filter((channel) => channel.active && channel.type === "offline");
  const useChannelTypeFallback = offlineChannels.every((channel) => channel.id.startsWith("ch-"));
  const isZh = locale === "zh";

  return (
    <AppShell locale={locale} dict={dict} title={isZh ? "\u95e8\u5e97\u5217\u8868" : "Store List"} currentPath="/offline-stores" isDemo={storesResult.isDemo || channelsResult.isDemo}>
      <DataNotice dict={dict} error={storesResult.error ?? channelsResult.error} />

      <Card className="mb-4">
        <h2 className="mb-3 font-semibold">{isZh ? "\u65b0\u589e\u95e8\u5e97" : "Add store"}</h2>
        <form action="/api/offline-stores" method="post" className="grid gap-3 md:grid-cols-5">
          <input type="hidden" name="return_to" value={`/${locale}/offline-stores`} />
          <TextInput name="name" placeholder={isZh ? "\u95e8\u5e97\u540d\u79f0" : "Store name"} required />
          <TextInput name="city" placeholder={isZh ? "\u57ce\u5e02" : "City"} required />
          <SelectInput name={useChannelTypeFallback ? "channel_type" : "channel_id"} required>
            <option value="">{isZh ? "\u9009\u62e9\u6e20\u9053" : "Select channel"}</option>
            {offlineChannels.map((channel) => (
              <option key={channel.id} value={useChannelTypeFallback ? channel.code : channel.id}>{channel.name}</option>
            ))}
          </SelectInput>
          <TextInput name="address" placeholder={isZh ? "\u5730\u5740" : "Address"} />
          <Button type="submit">{isZh ? "\u65b0\u589e" : "Add"}</Button>
        </form>
      </Card>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[840px] text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
              <tr>
                <th className="py-2 pr-3">{isZh ? "\u95e8\u5e97" : "Store"}</th>
                <th className="py-2 pr-3">{isZh ? "\u57ce\u5e02" : "City"}</th>
                <th className="py-2 pr-3">{isZh ? "\u6240\u5c5e\u6e20\u9053" : "Channel"}</th>
                <th className="py-2 pr-3">{isZh ? "\u5730\u5740" : "Address"}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {storesResult.data.map((store) => (
                <tr key={store.id}>
                  <td className="py-3 pr-3 font-medium">{store.name}</td>
                  <td className="py-3 pr-3">{store.city}</td>
                  <td className="py-3 pr-3"><Badge>{store.channels?.name ?? store.channel_type}</Badge></td>
                  <td className="py-3 pr-3">{store.address ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </AppShell>
  );
}

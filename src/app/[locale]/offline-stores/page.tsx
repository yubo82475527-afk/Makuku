import { AppShell } from "@/components/app-shell";
import { StoreMasterTable } from "@/components/store-master-table";
import { Button, Card, DataNotice, SelectInput, TextInput } from "@/components/ui";
import { getChannels, getOfflineStores } from "@/lib/data";
import { getPageI18n } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function OfflineStoresPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ status?: string | string[] | undefined }>;
}) {
  const { locale, dict } = await getPageI18n(params);
  const query = await searchParams;
  const rawStatus = Array.isArray(query.status) ? query.status[0] : query.status;
  const statusFilter = rawStatus === "disabled" || rawStatus === "all" ? rawStatus : "enabled";
  const [storesResult, channelsResult] = await Promise.all([getOfflineStores({ status: statusFilter }), getChannels()]);
  const offlineChannels = channelsResult.data.filter((channel) => channel.active && channel.type === "offline");
  const useChannelTypeFallback = offlineChannels.every((channel) => channel.id.startsWith("ch-"));
  const isZh = locale === "zh";
  const currentPath = `/offline-stores${statusFilter === "enabled" ? "" : `?status=${statusFilter}`}`;

  return (
    <AppShell locale={locale} dict={dict} title={isZh ? "\u95e8\u5e97\u5217\u8868" : "Store List"} currentPath={currentPath} isDemo={storesResult.isDemo || channelsResult.isDemo}>
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
        <StoreMasterTable stores={storesResult.data} locale={locale} statusFilter={statusFilter} />
      </Card>
    </AppShell>
  );
}

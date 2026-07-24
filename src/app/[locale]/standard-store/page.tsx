import { NavPlaceholderPage } from "@/components/nav-placeholder-page";
import { PageShellState } from "@/components/page-shell-state";
import { getPageI18n } from "@/lib/i18n/server";

export default async function StandardStorePage({
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
        title={isZh ? "完美终端2.0" : "Perfect Store 2.0"}
        currentPath="/standard-store"
      />
      <NavPlaceholderPage
        isZh={isZh}
        description={
          isZh
            ? "价格失守门店清单（示意）。后续可从这里纳入本周目标执行。"
            : "Price-breach store list (mock). Later these can feed weekly goal execution."
        }
        columns={
          isZh
            ? [
                { key: "store", label: "门店" },
                { key: "city", label: "城市" },
                { key: "sku", label: "SKU / 系列" },
                { key: "deviation", label: "偏离" },
                { key: "status", label: "跟进状态" },
              ]
            : [
                { key: "store", label: "Store" },
                { key: "city", label: "City" },
                { key: "sku", label: "SKU / Series" },
                { key: "deviation", label: "Deviation" },
                { key: "status", label: "Follow-up" },
              ]
        }
        rows={
          isZh
            ? [
                { store: "Toko Berkah Jaya", city: "Jakarta", sku: "Huggies Pants M", deviation: "偏低 11%", status: "待跟进" },
                { store: "Apotek Sehat 21", city: "Bandung", sku: "Mamypoko XL", deviation: "偏低 8%", status: "待跟进" },
                { store: "Baby Care Menteng", city: "Jakarta", sku: "Merries L", deviation: "偏高 6%", status: "已纳入本周" },
                { store: "Warung Sari", city: "Surabaya", sku: "Huggies NB", deviation: "偏低 9%", status: "待跟进" },
              ]
            : [
                { store: "Toko Berkah Jaya", city: "Jakarta", sku: "Huggies Pants M", deviation: "-11%", status: "Pending" },
                { store: "Apotek Sehat 21", city: "Bandung", sku: "Mamypoko XL", deviation: "-8%", status: "Pending" },
                { store: "Baby Care Menteng", city: "Jakarta", sku: "Merries L", deviation: "+6%", status: "In this week" },
                { store: "Warung Sari", city: "Surabaya", sku: "Huggies NB", deviation: "-9%", status: "Pending" },
              ]
        }
      />
    </>
  );
}

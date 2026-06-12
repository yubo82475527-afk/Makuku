import { AppShell } from "@/components/app-shell";
import { Badge, Button, Card, DataNotice, SelectInput, TextInput } from "@/components/ui";
import { getCompetitorProducts, getMarketBenchmarks, getPriceSnapshots } from "@/lib/data";
import { formatPricePerPiece } from "@/lib/format";
import { getPageI18n } from "@/lib/i18n/server";
import type { CompetitorProduct, PriceSnapshot, SkuMaster } from "@/lib/types";

export default async function MarketBenchmarksPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ competitorProductId?: string; line?: string; priceBand?: string; size?: string }>;
}) {
  const { locale, dict } = await getPageI18n(params);
  const query = await searchParams;
  const isZh = locale === "zh";
  const [benchmarkResult, competitorResult, priceResult] = await Promise.all([
    getMarketBenchmarks(),
    getCompetitorProducts(),
    getPriceSnapshots(),
  ]);
  const competitors = competitorResult.data;
  const selectedCompetitorId = query.competitorProductId ?? "";
  const selectedCompetitor = competitors.find((product) => product.id === selectedCompetitorId) ?? null;
  const matchedSku = selectedCompetitor?.sku_matches?.find((match) => match.sku_master)?.sku_master ?? null;
  const latestBenchmarkPrice = selectedCompetitor
    ? latestPriceForCompetitor(priceResult.data, selectedCompetitor.id)
    : null;
  const productLine = query.line ?? (matchedSku ? productLineLabel(matchedSku.pack_type) : "");
  const priceBand = query.priceBand ?? matchedSku?.segment ?? selectedCompetitor?.segment ?? "";
  const size = query.size ?? matchedSku?.size ?? selectedCompetitor?.size ?? "";
  const benchmarkSkuName = selectedCompetitor
    ? `${selectedCompetitor.brands?.name ?? ""} ${selectedCompetitor.normalized_name}`.trim()
    : "";
  const missingMapping = Boolean(selectedCompetitor && !matchedSku);
  const currentPath = `/market-benchmarks${selectedCompetitorId ? `?competitorProductId=${encodeURIComponent(selectedCompetitorId)}` : ""}`;

  return (
    <AppShell locale={locale} dict={dict} title={isZh ? "市场标杆管理" : "Market Benchmarks"} currentPath={currentPath} isDemo={benchmarkResult.isDemo || competitorResult.isDemo || priceResult.isDemo}>
      <DataNotice dict={dict} error={benchmarkResult.error ?? competitorResult.error ?? priceResult.error} />

      <Card className="mb-4">
        <div className="mb-3">
          <h2 className="font-semibold">{isZh ? "负责人制定市场标杆" : "Owner Benchmark Configuration"}</h2>
          <p className="mt-1 text-sm text-slate-500">
            {isZh ? "市场标杆是价格指数里的 100：负责人选择竞品 SKU，系统带出产品段和最新单片价，价格可手工修正。" : "Define the index baseline by selecting a competitor SKU; mapped segment and latest per-piece price are prefilled and editable."}
          </p>
        </div>

        <form className="mb-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
          <SelectInput name="competitorProductId" defaultValue={selectedCompetitorId}>
            <option value="">{isZh ? "选择竞品 SKU" : "Select competitor SKU"}</option>
            {competitors.map((product) => (
              <option key={product.id} value={product.id}>
                {product.brands?.name ?? "-"} / {product.normalized_name}
              </option>
            ))}
          </SelectInput>
          <Button type="submit">{isZh ? "带出标杆信息" : "Prefill"}</Button>
        </form>

        {missingMapping ? (
          <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {isZh ? "缺少映射：该竞品 SKU 尚未关联 Makuku SKU，无法自动带出产品段。请先到竞品映射管理补齐。" : "Missing mapping: this competitor SKU is not linked to a Makuku SKU, so the segment cannot be prefilled."}
          </div>
        ) : null}

        <form action="/api/market-benchmarks" method="post" className="grid gap-3 md:grid-cols-4 xl:grid-cols-8">
          <TextInput name="market" placeholder={isZh ? "国家/市场" : "Market"} defaultValue="Indonesia" required />
          <TextInput name="province" placeholder={isZh ? "省/州" : "Province/State"} />
          <TextInput name="city_name" placeholder={isZh ? "城市" : "City"} />
          <TextInput name="district" placeholder={isZh ? "区/县" : "District"} />
          <TextInput name="category" placeholder={isZh ? "品类" : "Category"} defaultValue="Diapers" required readOnly />
          <input type="hidden" name="benchmark_competitor_product_id" value={selectedCompetitorId} />
          <ReadonlyField name="product_line" label={isZh ? "产品线" : "Product line"} value={productLine} />
          <ReadonlyField name="price_band" label={isZh ? "商品等级" : "Product grade"} value={priceBand} />
          <ReadonlyField name="size" label={isZh ? "尺码" : "Size"} value={size} />
          <TextInput name="benchmark_sku_name" placeholder={isZh ? "标杆SKU" : "Benchmark SKU"} defaultValue={benchmarkSkuName} required className="md:col-span-2" readOnly={Boolean(selectedCompetitor)} />
          <TextInput name="benchmark_price_per_piece" type="number" step="0.0001" placeholder={isZh ? "标杆单片价" : "Benchmark per piece"} defaultValue={latestBenchmarkPrice?.toString() ?? ""} required />
          <TextInput name="currency" placeholder={isZh ? "币种" : "Currency"} defaultValue="IDR" />
          <TextInput name="notes" placeholder={isZh ? "备注" : "Notes"} defaultValue={selectedCompetitor ? (isZh ? "负责人指定标杆" : "Owner selected benchmark") : ""} className="md:col-span-2" />
          <Button type="submit" disabled={!selectedCompetitor || !matchedSku}>{isZh ? "启用为市场标杆" : "Activate Benchmark"}</Button>
        </form>
      </Card>

      <Card>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="font-semibold">{isZh ? "市场标杆列表" : "Market Benchmarks"}</h2>
          <div className="text-sm text-slate-500">{benchmarkResult.data.length} {isZh ? "条" : "rows"}</div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
              <tr>
                <th className="py-2 pr-3">{isZh ? "状态" : "Status"}</th>
                <th className="py-2 pr-3">{isZh ? "区域" : "Region"}</th>
                <th className="py-2 pr-3">{isZh ? "产品段 / 商品等级" : "Segment / Grade"}</th>
                <th className="py-2 pr-3">{isZh ? "标杆SKU" : "Benchmark SKU"}</th>
                <th className="py-2 pr-3">{isZh ? "标杆单片价" : "Per Piece"}</th>
                <th className="py-2 pr-3">{isZh ? "竞品映射" : "Competitor"}</th>
                <th className="py-2 pr-3">{isZh ? "备注" : "Notes"}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {benchmarkResult.data.map((benchmark) => (
                <tr key={benchmark.id}>
                  <td className="py-3 pr-3"><Badge tone={benchmark.active ? "low" : "neutral"}>{benchmark.active ? (isZh ? "启用" : "Active") : (isZh ? "禁用" : "Disabled")}</Badge></td>
                  <td className="py-3 pr-3">
                    <div className="font-medium">{benchmark.market}</div>
                    <div className="text-xs text-slate-500">{[benchmark.province, benchmark.city_name, benchmark.district].filter(Boolean).join(" / ") || (isZh ? "全区域" : "All regions")}</div>
                  </td>
                  <td className="py-3 pr-3">{benchmark.category} / {benchmark.product_line} / {benchmark.price_band} / {benchmark.size}</td>
                  <td className="py-3 pr-3 font-medium">{benchmark.benchmark_sku_name}</td>
                  <td className="py-3 pr-3 font-semibold">{formatPricePerPiece(benchmark.benchmark_price_per_piece)} <span className="text-xs text-slate-500">{benchmark.currency}</span></td>
                  <td className="py-3 pr-3">{benchmark.competitor_products?.normalized_name ?? "-"}</td>
                  <td className="py-3 pr-3">{benchmark.notes ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </AppShell>
  );
}

function ReadonlyField({ name, label, value }: { name: string; label: string; value: string }) {
  return (
    <label className="block">
      <span className="sr-only">{label}</span>
      <TextInput name={name} placeholder={label} value={value} readOnly required />
    </label>
  );
}

function productLineLabel(value: SkuMaster["pack_type"]) {
  if (value === "pants") return "Pants";
  if (value === "tape") return "Tape";
  return "Unknown";
}

function latestPriceForCompetitor(snapshots: PriceSnapshot[], competitorProductId: CompetitorProduct["id"]) {
  return snapshots
    .filter((snapshot) => snapshot.competitor_product_id === competitorProductId)
    .sort((a, b) => new Date(b.captured_at).getTime() - new Date(a.captured_at).getTime())[0]?.price_per_piece ?? null;
}

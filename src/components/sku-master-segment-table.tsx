import { Button, Card, SelectInput } from "@/components/ui";
import { productGradeOptions } from "@/lib/segments";
import type { SkuMaster } from "@/lib/types";

export function SkuMasterSegmentTable({
  rows,
  locale,
}: {
  rows: SkuMaster[];
  locale: string;
}) {
  const isZh = locale === "zh";
  return (
    <Card className="mb-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">{isZh ? "Makuku 商品等级" : "Makuku Product Grades"}</h2>
          <p className="mt-1 text-sm text-slate-500">
            {isZh ? "商品等级维护在 Makuku 主数据，不写入价格快照。" : "Grades are maintained on Makuku master data, not price snapshots."}
          </p>
        </div>
        <div className="text-sm text-slate-500">{rows.length} {isZh ? "条" : "rows"}</div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
            <tr>
              <th className="py-2 pr-3">{isZh ? "商品" : "Product"}</th>
              <th className="py-2 pr-3">{isZh ? "类型" : "Type"}</th>
              <th className="py-2 pr-3">{isZh ? "尺码" : "Size"}</th>
              <th className="py-2 pr-3">{isZh ? "片数" : "Pcs"}</th>
              <th className="py-2 pr-3">{isZh ? "商品等级" : "Grade"}</th>
              <th className="py-2 pr-3">{isZh ? "状态" : "Status"}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {rows.map((sku) => (
              <tr key={sku.id}>
                <td className="py-3 pr-3 font-medium">{sku.makuku_sku_name}</td>
                <td className="py-3 pr-3">{sku.pack_type}</td>
                <td className="py-3 pr-3">{sku.size}</td>
                <td className="py-3 pr-3">{sku.piece_count}</td>
                <td className="min-w-52 py-3 pr-3">
                  <form action="/api/sku-master" method="post" className="flex items-center gap-2">
                    <input type="hidden" name="return_to" value={`/${locale}/sku-master`} />
                    <input type="hidden" name="intent" value="update_segment" />
                    <input type="hidden" name="id" value={sku.id} />
                    <SelectInput name="segment" defaultValue={sku.segment} className="h-9">
                      {productGradeOptions().map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </SelectInput>
                    <Button type="submit" className="h-9 whitespace-nowrap">{isZh ? "保存" : "Save"}</Button>
                  </form>
                </td>
                <td className="py-3 pr-3">{sku.active ? (isZh ? "启用" : "Active") : (isZh ? "停用" : "Inactive")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">{isZh ? "暂无 Makuku SKU 桥接数据。关联产品主数据后会自动生成。" : "No Makuku SKU bridge rows yet. They are created after product master mapping."}</p>
      ) : null}
    </Card>
  );
}

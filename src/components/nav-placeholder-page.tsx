import { Card } from "@/components/ui";

export type NavPlaceholderColumn = {
  key: string;
  label: string;
};

export type NavPlaceholderRow = Record<string, string | number>;

export function NavPlaceholderPage({
  isZh,
  description,
  columns,
  rows,
  showBanner = true,
}: {
  isZh: boolean;
  description: string;
  columns: NavPlaceholderColumn[];
  rows: NavPlaceholderRow[];
  showBanner?: boolean;
}) {
  return (
    <>
      {showBanner ? (
        <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {isZh ? "示意数据，非生产事实" : "Mock data — not production facts"}
        </div>
      ) : null}

      <Card>
        <p className="mb-4 text-sm text-slate-600">{description}</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
              <tr>
                {columns.map((column) => (
                  <th key={column.key} className="py-2 pr-3 font-semibold">
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={index} className="border-b border-slate-100 last:border-0">
                  {columns.map((column) => (
                    <td key={column.key} className="py-2.5 pr-3 text-slate-800">
                      {row[column.key] ?? "-"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}

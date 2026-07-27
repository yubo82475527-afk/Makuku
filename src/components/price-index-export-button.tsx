"use client";

import { AsyncExportJobButton, postExportJob } from "@/components/async-export-job-button";

export function PriceIndexExportButton({
  locale,
  filters,
}: {
  locale: string;
  filters: Record<string, string | undefined>;
}) {
  return (
    <AsyncExportJobButton
      locale={locale}
      createJob={() => postExportJob("/api/price-index/export-jobs", { locale, filters })}
    />
  );
}

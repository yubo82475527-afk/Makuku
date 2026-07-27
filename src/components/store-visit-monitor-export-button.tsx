"use client";

import { AsyncExportJobButton, postExportJob } from "@/components/async-export-job-button";

type ExportFilters = {
  visit_code?: string;
  store_name?: string;
  promoter?: string;
  analysis_status?: string;
  date_from?: string;
  date_to?: string;
};

type ExportView = "visit" | "promoter" | "store";

export function StoreVisitMonitorExportButton({
  locale,
  filters,
  exportView = "visit",
}: {
  locale: string;
  filters: ExportFilters;
  exportView?: ExportView;
}) {
  return (
    <AsyncExportJobButton
      locale={locale}
      createJob={() =>
        postExportJob("/api/store-visit-monitor/export-jobs", {
          locale,
          filters: {
            ...filters,
            export_view: exportView,
          },
        })
      }
    />
  );
}

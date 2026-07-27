"use client";

import { AsyncExportJobButton, postExportJob } from "@/components/async-export-job-button";

export function OperatorPriceReviewExportButton({
  locale,
  filters,
}: {
  locale: string;
  filters: {
    state: string;
    date_from?: string;
    date_to?: string;
    visit_code?: string;
    reason?: string;
  };
}) {
  return (
    <AsyncExportJobButton
      locale={locale}
      createJob={() =>
        postExportJob("/api/operator-price-reviews/export-jobs", { locale, filters })
      }
    />
  );
}

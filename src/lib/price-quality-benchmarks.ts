import { createSupabaseServiceClient } from "@/lib/supabase";

export type PriceQualityBenchmarkRefreshResult = {
  benchmark_date: string;
  inserted_count: number;
  ready_count: number;
  insufficient_count: number;
};

export async function refreshPriceQualityBenchmarks(input: {
  benchmarkDate?: string | null;
  supabase?: ReturnType<typeof createSupabaseServiceClient>;
} = {}): Promise<PriceQualityBenchmarkRefreshResult> {
  const supabase = input.supabase ?? createSupabaseServiceClient();
  const { data, error } = await supabase.rpc("refresh_price_quality_benchmark_daily", {
    p_benchmark_date: input.benchmarkDate ?? null,
  });
  if (error) throw new Error(error.message);

  const row = Array.isArray(data) ? data[0] : null;
  if (!row?.benchmark_date) {
    throw new Error("Price quality benchmark refresh returned no result.");
  }

  return {
    benchmark_date: String(row.benchmark_date),
    inserted_count: Number(row.inserted_count ?? 0),
    ready_count: Number(row.ready_count ?? 0),
    insufficient_count: Number(row.insufficient_count ?? 0),
  };
}

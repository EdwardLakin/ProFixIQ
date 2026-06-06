"use client";

import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";

import {
  getTechnicianLoadMetricsWithClient,
  type TechnicianIdleBreakdown,
  type TechnicianLoadMetricResult,
  type TechnicianLoadMetricRow,
  type TechnicianLoadMetricSummary,
} from "@shared/lib/stats/getTechnicianLoadMetricsCore";


export type {
  TechnicianIdleBreakdown,
  TechnicianLoadMetricRow,
  TechnicianLoadMetricSummary,
  TechnicianLoadMetricResult,
};

export async function getTechnicianLoadMetrics(
  shopId: string,
): Promise<TechnicianLoadMetricResult> {
  const supabase = createBrowserSupabase();
  return getTechnicianLoadMetricsWithClient(supabase, shopId);
}

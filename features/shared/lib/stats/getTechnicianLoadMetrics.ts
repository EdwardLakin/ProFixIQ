"use client";

import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

import type { Database } from "@shared/types/types/supabase";
import {
  getTechnicianLoadMetricsWithClient,
  type TechnicianIdleBreakdown,
  type TechnicianLoadMetricResult,
  type TechnicianLoadMetricRow,
  type TechnicianLoadMetricSummary,
} from "@shared/lib/stats/getTechnicianLoadMetricsCore";

type DB = Database;

export type {
  TechnicianIdleBreakdown,
  TechnicianLoadMetricRow,
  TechnicianLoadMetricSummary,
  TechnicianLoadMetricResult,
};

export async function getTechnicianLoadMetrics(
  shopId: string,
): Promise<TechnicianLoadMetricResult> {
  const supabase = createClientComponentClient<DB>();
  return getTechnicianLoadMetricsWithClient(supabase, shopId);
}

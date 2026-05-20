// features/work-orders/lib/saveWorkOrderLines.ts
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";
import { normalizeLaborHoursInput } from "@/features/work-orders/lib/pricing/resolveWorkOrderLinePricing";

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

type InsertLine = Database["public"]["Tables"]["work_order_lines"]["Insert"];

export async function saveWorkOrderLines(
  lines: Array<{
    complaint: string;
    cause?: string;
    correction?: string;
    tools?: string;
    labor_time?: number;
    job_type?: string | null;
    status?: InsertLine["status"];
  }>,
  userId: string,
  vehicleId: string,
  workOrderId: string,
) {
  const { data: workOrder, error: workOrderError } = await supabase
    .from("work_orders")
    .select("shop_id")
    .eq("id", workOrderId)
    .single();

  if (workOrderError || !workOrder?.shop_id) {
    throw new Error(workOrderError?.message ?? "Work order missing shop_id");
  }

  const payload: InsertLine[] = lines.map((l) => ({
    user_id: userId,
    shop_id: workOrder.shop_id,
    vehicle_id: vehicleId,
    work_order_id: workOrderId,
    complaint: l.complaint ?? null,
    cause: l.cause ?? null,
    correction: l.correction ?? null,
    tools: l.tools ?? null,
    labor_time: normalizeLaborHoursInput(l.labor_time, true),
    status: l.status ?? "awaiting",
    job_type: l.job_type ?? null,
  }));

  const { data, error } = await supabase.from("work_order_lines").insert(payload).select("*");
  if (error) throw new Error(error.message);
  return data;
}

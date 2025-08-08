// src/lib/saveWorkOrderLines.ts

import { createClient } from "@supabase/supabase-js";
import { RepairLine } from "@ai/lib/parseRepairOutput";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

export async function saveWorkOrderLines(
  lines: RepairLine[],
  userId: string,
  vehicleId: string,
  workOrderId: string,
) {
  const formatted = lines.map((line) => ({
    user_id: userId,
    vehicle_id: vehicleId,
    work_order_id: workOrderId,
    complaint: line.complaint,
    cause: line.cause,
    correction: line.correction,
    tools: line.tools,
    labor_time: line.labor_time,
  }));

  const { data, error } = await supabase
    .from("work_order_lines")
    .insert(formatted);

  if (error) throw new Error(error.message);
  return data;
}

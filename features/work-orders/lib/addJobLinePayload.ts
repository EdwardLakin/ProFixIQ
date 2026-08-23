import type { Database } from "@shared/types/types/supabase";

type WorkOrderLineInsert =
  Database["public"]["Tables"]["work_order_lines"]["Insert"];

export type AddJobLinePart = {
  description: string;
  qty: number;
};

export type AddJobLinePayloadInput = {
  id: string;
  workOrderId: string;
  vehicleId: string | null;
  jobName: string;
  notes: string;
  laborHours: number;
  parts: AddJobLinePart[];
  shopId: string;
  userId: string | null;
  urgency: "low" | "medium" | "high";
};

export function buildAddJobLinePayload(
  input: AddJobLinePayloadInput,
): WorkOrderLineInsert {
  return {
    id: input.id,
    work_order_id: input.workOrderId,
    vehicle_id: input.vehicleId,
    complaint: input.jobName.trim(),
    cause: null,
    correction: input.notes.trim() || null,
    labor_time: input.laborHours > 0 ? input.laborHours : null,
    parts:
      input.parts.length > 0
        ? input.parts.map((part) => `${part.qty}x ${part.description}`).join(", ")
        : null,
    status: "awaiting_approval",
    approval_state: "pending",
    job_type: "repair",
    shop_id: input.shopId,
    urgency: input.urgency,
    ...(input.userId ? { user_id: input.userId } : {}),
  };
}

import { z } from "zod";
import { getServerSupabase } from "../server/supabase";
import type { ToolDef } from "../lib/toolTypes";

const In = z.object({
  customerId: z.string().uuid(),
  vehicleId: z.string().uuid(),
  type: z
    .enum(["maintenance", "repair", "diagnosis", "inspection"])
    .default("inspection"),
  notes: z.string().nullable().optional(),
});
export type CreateWorkOrderIn = z.infer<typeof In>;

const Out = z.object({
  workOrderId: z.string().uuid(),
});
export type CreateWorkOrderOut = z.infer<typeof Out>;

/**
 * Create Work Order
 * -----------------------------------------------------------------------------
 * Creates a new work order for a given customer + vehicle in the current shop.
 * Safe for RLS, as it respects shop_id and the "awaiting_approval" status constraint.
 */
export const toolCreateWorkOrder: ToolDef<
  CreateWorkOrderIn,
  CreateWorkOrderOut
> = {
  name: "create_work_order",
  description: "Create a new work order for a customer+vehicle.",
  inputSchema: In,
  outputSchema: Out,

  async run(input, ctx) {
    const supabase = getServerSupabase();

    const payload = {
      shop_id: ctx.shopId,
      customer_id: input.customerId,
      vehicle_id: input.vehicleId,
      type: input.type,
      // ✅ Must match allowed enum: ['new','awaiting','awaiting_approval','queued','in_progress','on_hold','planned','completed']
      status: "awaiting_approval",
      notes: input.notes ?? null,
    };

    const { data, error } = await supabase
      .from("work_orders")
      .insert(payload)
      .select("id")
      .single();

    if (error || !data)
      throw new Error(error?.message ?? "create_work_order failed");

    return { workOrderId: data.id };
  },
};
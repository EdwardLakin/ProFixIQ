import { z } from "zod";
import { getServerSupabase } from "../server/supabase";
import type { ToolDef } from "../lib/toolTypes";

const In = z.object({
  workOrderId: z.string().uuid(),
  description: z.string().min(2),
  jobType: z.enum(["maintenance","repair","diagnosis","inspection"]),
  laborHours: z.number().min(0).default(0),
  notes: z.string().optional()
});
export type AddWorkOrderLineIn = z.infer<typeof In>;

const Out = z.object({ lineId: z.string().uuid() });
export type AddWorkOrderLineOut = z.infer<typeof Out>;

export const toolAddWorkOrderLine: ToolDef<AddWorkOrderLineIn, AddWorkOrderLineOut> = {
  name: "add_work_order_line",
  description: "Add a line item to an existing work order (maps laborHours → labor_time).",
  inputSchema: In,
  outputSchema: Out,
  async run(input, ctx) {
    const supabase = getServerSupabase();
    const payload = {
      shop_id: ctx.shopId,
      work_order_id: input.workOrderId,
      description: input.description,
      job_type: input.jobType,
      labor_time: input.laborHours,
      notes: input.notes ?? null,
      status: "open" as const
    };
    const { data, error } = await supabase
      .from("work_order_lines")
      .insert(payload)
      .select("id")
      .single();

    if (error || !data) throw new Error(error?.message ?? "add_work_order_line failed");
    return { lineId: data.id };
  }
};

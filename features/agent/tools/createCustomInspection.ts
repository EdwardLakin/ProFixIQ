import { z } from "zod";
import { getServerSupabase } from "../server/supabase";
import type { ToolDef } from "../lib/toolTypes";

import { buildInspectionFromSelections } from "@inspections/lib/inspection/buildFromSelections";

const In = z.object({
  workOrderId: z.string().uuid(),
  title: z.string().min(1).default("Custom Inspection"),
  selections: z.record(z.string(), z.array(z.string())).default({}),
  services: z.array(z.string()).default([]),
  vehicleType: z.enum(["car", "truck", "bus", "trailer"]).default("truck"),
  includeAxle: z.boolean().default(true),
  includeOil: z.boolean().default(false),
});
export type CreateCustomInspectionIn = z.infer<typeof In>;

const Out = z.object({
  inspectionId: z.string().uuid(),
});
export type CreateCustomInspectionOut = z.infer<typeof Out>;

export const toolCreateCustomInspection: ToolDef<
  CreateCustomInspectionIn,
  CreateCustomInspectionOut
> = {
  name: "create_custom_inspection",
  description: "Build and attach a custom inspection to a work order from user-selected items.",
  inputSchema: In,
  outputSchema: Out,
  async run(input, ctx) {
    const supabase = getServerSupabase();

    // ✅ Only pass the supported keys
    const sections = buildInspectionFromSelections({
      selections: input.selections,
      axle: input.includeAxle ? { vehicleType: input.vehicleType } : null,
      extraServiceItems: input.services,
    });

    // Persist (adjust table/columns to your schema as needed)
    const payload = {
      shop_id: ctx.shopId,
      work_order_id: input.workOrderId,
      title: input.title,
      sections, // JSON
      vehicle_type: input.vehicleType,
      include_axle: input.includeAxle,
      include_oil: input.includeOil,
      services: input.services, // JSON/text[]
    };

    const { data, error } = await supabase
      .from("work_order_inspections")
      .insert(payload)
      .select("id")
      .single();

    if (error || !data) throw new Error(error?.message ?? "create_custom_inspection failed");
    return { inspectionId: data.id };
  },
};
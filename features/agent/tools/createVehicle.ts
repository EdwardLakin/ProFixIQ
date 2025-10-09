import { z } from "zod";
import { getServerSupabase } from "../server/supabase";
import type { ToolDef } from "../lib/toolTypes";

const In = z.object({
  customerId: z.string().uuid(),
  vin: z.string().min(6).optional(),
  license_plate: z.string().min(2).optional(),
  make: z.string().optional(),
  model: z.string().optional(),
  year: z.number().int().optional(),
});
export type CreateVehicleIn = z.infer<typeof In>;

const Out = z.object({ vehicleId: z.string().uuid() });
export type CreateVehicleOut = z.infer<typeof Out>;

export const toolCreateVehicle: ToolDef<CreateVehicleIn, CreateVehicleOut> = {
  name: "create_vehicle",
  description: "Create a vehicle for a customer in the current shop",
  inputSchema: In,
  outputSchema: Out,
  async run(input, ctx) {
    const supabase = getServerSupabase();

    const { data, error } = await supabase
      .from("vehicles")
      .insert({
        customer_id: input.customerId,
        vin: input.vin ?? undefined,
        license_plate: input.license_plate ?? undefined,
        make: input.make ?? undefined,
        model: input.model ?? undefined,
        year: input.year ?? undefined,
        shop_id: ctx.shopId,          // ← critical for RLS
        user_id: ctx.userId ?? null,  // if present in your schema
      })
      .select("id")
      .single();

    if (error || !data) throw new Error(error?.message ?? "Failed to create vehicle");
    return { vehicleId: data.id };
  },
};
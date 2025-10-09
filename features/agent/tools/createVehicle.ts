import { z } from "zod";
import { getServerSupabase } from "../server/supabase";
import type { ToolDef } from "../lib/toolTypes";

const In = z.object({
  customerId: z.string().uuid(),
  license_plate: z.string().optional(),
  vin: z.string().optional(),
  make: z.string().optional(),
  model: z.string().optional(),
  year: z.number().optional(),
}).refine(v => Boolean(v.license_plate || v.vin), {
  message: "Provide at least license_plate or vin"
});
export type CreateVehicleIn = z.infer<typeof In>;

const Out = z.object({ vehicleId: z.string().uuid() });
export type CreateVehicleOut = z.infer<typeof Out>;

export const toolCreateVehicle: ToolDef<CreateVehicleIn, CreateVehicleOut> = {
  name: "create_vehicle",
  description: "Create a vehicle for an existing customer",
  inputSchema: In,
  outputSchema: Out,
  async run(input, _ctx) {
    const supabase = getServerSupabase();
    const { data, error } = await supabase
      .from("vehicles")
      .insert({
        customer_id: input.customerId,
        license_plate: input.license_plate ?? null,
        vin: input.vin ?? null,
        make: input.make ?? null,
        model: input.model ?? null,
        year: input.year ?? null,
      })
      .select("id")
      .single();

    if (error || !data) throw new Error(error?.message ?? "Failed to create vehicle");
    return { vehicleId: data.id };
  }
};

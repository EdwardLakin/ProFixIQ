// features/agent/tools/generateFleetWorkOrders.ts
import { z } from "zod";
import { getServerSupabase } from "../server/supabase";
import type { ToolDef } from "../lib/toolTypes";

export const GenerateFleetWorkOrdersIn = z.object({
  programId: z.string().uuid(),
  vehicleIds: z.array(z.string().uuid()).optional(),
  label: z.string().optional(), // e.g. "Q1 2025 PM"
});
export type GenerateFleetWorkOrdersIn = z.infer<typeof GenerateFleetWorkOrdersIn>;

export const GenerateFleetWorkOrdersOut = z.object({
  created: z.array(
    z.object({
      workOrderId: z.string().uuid(),
      vehicleId: z.string().uuid(),
      customerId: z.string().uuid().nullable(),
    }),
  ),
});
export type GenerateFleetWorkOrdersOut = z.infer<
  typeof GenerateFleetWorkOrdersOut
>;

export const toolGenerateFleetWorkOrders: ToolDef<
  GenerateFleetWorkOrdersIn,
  GenerateFleetWorkOrdersOut
> = {
  name: "generate_fleet_work_orders",
  description:
    "Generates work orders for a fleet program for one or more vehicles, including job lines based on program tasks.",
  inputSchema: GenerateFleetWorkOrdersIn,
  outputSchema: GenerateFleetWorkOrdersOut,
  async run(input, ctx) {
    const supabase = getServerSupabase();

    // 1) load program + fleet
    const { data: program, error: progErr } = await supabase
      .from("fleet_programs")
      .select(
        "id, fleet_id, name, base_template_slug, include_custom_inspection",
      )
      .eq("id", input.programId)
      .maybeSingle();
    if (progErr) throw new Error(progErr.message);
    if (!program) throw new Error("Program not found");

    const { data: fleet, error: fleetErr } = await supabase
      .from("fleets")
      .select("shop_id, name")
      .eq("id", program.fleet_id)
      .maybeSingle();
    if (fleetErr) throw new Error(fleetErr.message);
    if (!fleet) throw new Error("Fleet not found");
    if (fleet.shop_id !== ctx.shopId) throw new Error("Cross-shop access denied");

    // 2) vehicles
    let vehicleIds = input.vehicleIds;
    if (!vehicleIds || vehicleIds.length === 0) {
      const { data: fv, error: fvErr } = await supabase
        .from("fleet_vehicles")
        .select("vehicle_id")
        .eq("fleet_id", program.fleet_id)
        .eq("active", true);
      if (fvErr) throw new Error(fvErr.message);
      vehicleIds = (fv ?? []).map((r) => r.vehicle_id);
    }

    if (!vehicleIds || vehicleIds.length === 0) {
      return { created: [] };
    }

    // 3) tasks
    const { data: tasks, error: tErr } = await supabase
      .from("fleet_program_tasks")
      .select("id, description, job_type, default_labor_hours")
      .eq("program_id", program.id)
      .order("display_order", { ascending: true });
    if (tErr) throw new Error(tErr.message);

    if (!tasks || tasks.length === 0) {
      throw new Error("Program has no tasks");
    }

    // 4) loop vehicles: create WO + lines
    const created: GenerateFleetWorkOrdersOut["created"] = [];

    for (const vehicleId of vehicleIds) {
      // lookup vehicle + customer
      const { data: veh, error: vErr } = await supabase
        .from("vehicles")
        .select("id, customer_id")
        .eq("id", vehicleId)
        .maybeSingle();
      if (vErr) throw new Error(vErr.message);
      if (!veh) continue;

      const { data: wo, error: woErr } = await supabase
        .from("work_orders")
        .insert({
          shop_id: ctx.shopId,
          vehicle_id: veh.id,
          customer_id: veh.customer_id,
          user_id: ctx.userId,
          status: "awaiting_approval",
          notes: input.label
            ? `Fleet program: ${program.name} (${input.label})`
            : `Fleet program: ${program.name}`,
        })
        .select("id, customer_id")
        .maybeSingle();

      if (woErr || !wo?.id) throw new Error(woErr?.message ?? "Failed to create WO");

      // lines
      for (const task of tasks) {
        const { error: lineErr } = await supabase.from("work_order_lines").insert({
          work_order_id: wo.id,
          shop_id: ctx.shopId,
          job_type: task.job_type ?? "maintenance",
          description: task.description,
          labor_time: task.default_labor_hours ?? 1,
          status: "awaiting",
          source: "fleet_program",
        });

        if (lineErr) throw new Error(lineErr.message);
      }

      created.push({
        workOrderId: wo.id,
        vehicleId: veh.id,
        customerId: veh.customer_id,
      });
    }

    return { created };
  },
};
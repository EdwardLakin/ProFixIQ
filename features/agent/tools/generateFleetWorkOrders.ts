// features/agent/tools/generateFleetWorkOrders.ts
import { z } from "zod";
import { getServerSupabase } from "../server/supabase";
import type { ToolDef } from "../lib/toolTypes";

export const GenerateFleetWorkOrdersIn = z.object({
  fleetId: z.string().uuid(),
  programName: z.string().min(1),
  vehicleIds: z.array(z.string().uuid()).optional(),
  label: z.string().optional(), // e.g. "Q1 2026 PM"
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
export type GenerateFleetWorkOrdersOut = z.infer<typeof GenerateFleetWorkOrdersOut>;

type ProgramRow = {
  id: string;
  fleet_id: string;
  name: string;
  base_template_slug: string | null;
  include_custom_inspection: boolean | null;
};

type TaskRow = {
  id: string;
  description: string;
  job_type: string | null;
  default_labor_hours: number | null;
};

export const toolGenerateFleetWorkOrders: ToolDef<
  GenerateFleetWorkOrdersIn,
  GenerateFleetWorkOrdersOut
> = {
  name: "generate_fleet_work_orders",
  description:
    "Generates work orders for a fleet program (find/create by name) for one or more vehicles, including job lines based on program tasks.",
  inputSchema: GenerateFleetWorkOrdersIn,
  outputSchema: GenerateFleetWorkOrdersOut,
  async run(input, ctx) {
    const supabase = getServerSupabase();

    // 0) Validate fleet ownership (cross-shop guard)
    const { data: fleet, error: fleetErr } = await supabase
      .from("fleets")
      .select("id, shop_id, name")
      .eq("id", input.fleetId)
      .maybeSingle<{ id: string; shop_id: string; name: string }>();

    if (fleetErr) throw new Error(fleetErr.message);
    if (!fleet) throw new Error("Fleet not found");
    if (fleet.shop_id !== ctx.shopId) throw new Error("Cross-shop access denied");

    // 1) Find or create program by (fleet_id, name)
    let program: ProgramRow | null = null;

    const { data: existingProgram, error: findProgErr } = await supabase
      .from("fleet_programs")
      .select("id, fleet_id, name, base_template_slug, include_custom_inspection")
      .eq("fleet_id", input.fleetId)
      .ilike("name", input.programName) // ilike treats value as pattern if it contains %
      .limit(1)
      .maybeSingle<ProgramRow>();

    if (findProgErr) throw new Error(findProgErr.message);

    if (existingProgram?.id) {
      program = existingProgram;
    } else {
      const { data: insertedProgram, error: insProgErr } = await supabase
        .from("fleet_programs")
        .insert({
          fleet_id: input.fleetId,
          name: input.programName,
          base_template_slug: null,
          include_custom_inspection: false,
        })
        .select("id, fleet_id, name, base_template_slug, include_custom_inspection")
        .maybeSingle<ProgramRow>();

      if (insProgErr) throw new Error(insProgErr.message);
      if (!insertedProgram?.id) throw new Error("Failed to create fleet program");
      program = insertedProgram;
    }

    // 2) Vehicles (explicit list, or all active enrolled vehicles)
    let vehicleIds = input.vehicleIds;

    if (!vehicleIds || vehicleIds.length === 0) {
      const { data: fv, error: fvErr } = await supabase
        .from("fleet_vehicles")
        .select("vehicle_id")
        .eq("fleet_id", input.fleetId)
        .eq("active", true);

      if (fvErr) throw new Error(fvErr.message);
      vehicleIds = (fv ?? [])
        .map((r) => r.vehicle_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0);
    }

    if (!vehicleIds || vehicleIds.length === 0) {
      return { created: [] };
    }

    // 3) Tasks for the program
    const { data: tasks, error: tErr } = await supabase
      .from("fleet_program_tasks")
      .select("id, description, job_type, default_labor_hours")
      .eq("program_id", program.id)
      .order("display_order", { ascending: true });

    if (tErr) throw new Error(tErr.message);

    const taskRows = (tasks ?? []) as TaskRow[];

    // If program has no tasks yet, fallback to a single generic task so planner still works.
    const effectiveTasks: Array<Pick<TaskRow, "description" | "job_type" | "default_labor_hours">> =
      taskRows.length > 0
        ? taskRows.map((t) => ({
            description: t.description,
            job_type: t.job_type,
            default_labor_hours: t.default_labor_hours,
          }))
        : [
            {
              description: `Fleet program: ${program.name}`,
              job_type: "maintenance",
              default_labor_hours: 1,
            },
          ];

    // 4) Loop vehicles: create WO + lines
    const created: GenerateFleetWorkOrdersOut["created"] = [];

    for (const vehicleId of vehicleIds) {
      // lookup vehicle + customer
      const { data: veh, error: vErr } = await supabase
        .from("vehicles")
        .select("id, customer_id")
        .eq("id", vehicleId)
        .maybeSingle<{ id: string; customer_id: string | null }>();

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
          source_fleet_program_id: program.id,
        })
        .select("id, customer_id")
        .maybeSingle<{ id: string; customer_id: string | null }>();

      if (woErr) throw new Error(woErr.message);
      if (!wo?.id) throw new Error("Failed to create work order");

      // lines
      for (const task of effectiveTasks) {
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
// features/agent/tools/findOrCreateFleetProgram.ts
import { z } from "zod";
import { getServerSupabase } from "../server/supabase";
import type { ToolDef } from "../lib/toolTypes";

export const FindOrCreateFleetProgramIn = z.object({
  fleetId: z.string().uuid(),
  programName: z.string().min(1),
  baseTemplateSlug: z.string().optional(),
  includeCustomInspection: z.boolean().optional(),
});
export type FindOrCreateFleetProgramIn = z.infer<typeof FindOrCreateFleetProgramIn>;

export const FindOrCreateFleetProgramOut = z.object({
  programId: z.string().uuid(),
  created: z.boolean().optional(),
});
export type FindOrCreateFleetProgramOut = z.infer<typeof FindOrCreateFleetProgramOut>;

export const toolFindOrCreateFleetProgram: ToolDef<
  FindOrCreateFleetProgramIn,
  FindOrCreateFleetProgramOut
> = {
  name: "find_or_create_fleet_program",
  description:
    "Finds a fleet program by name (within a fleet) or creates it if it does not exist.",
  inputSchema: FindOrCreateFleetProgramIn,
  outputSchema: FindOrCreateFleetProgramOut,
  async run(input, ctx) {
    const supabase = getServerSupabase();

    // Cross-shop guard: verify fleet belongs to this shop
    const { data: fleet, error: fleetErr } = await supabase
      .from("fleets")
      .select("id, shop_id")
      .eq("id", input.fleetId)
      .maybeSingle<{ id: string; shop_id: string }>();

    if (fleetErr) throw new Error(fleetErr.message);
    if (!fleet) throw new Error("Fleet not found");
    if (fleet.shop_id !== ctx.shopId) throw new Error("Cross-shop access denied");

    // Find existing (case-insensitive)
    const { data: existing, error: findErr } = await supabase
      .from("fleet_programs")
      .select("id")
      .eq("fleet_id", input.fleetId)
      .ilike("name", input.programName)
      .limit(1)
      .maybeSingle<{ id: string }>();

    if (findErr) throw new Error(findErr.message);
    if (existing?.id) return { programId: existing.id, created: false };

    // Create
    const { data: inserted, error: insErr } = await supabase
      .from("fleet_programs")
      .insert({
        fleet_id: input.fleetId,
        name: input.programName,
        base_template_slug: input.baseTemplateSlug ?? null,
        include_custom_inspection: input.includeCustomInspection ?? false,
      })
      .select("id")
      .maybeSingle<{ id: string }>();

    if (insErr) throw new Error(insErr.message);
    if (!inserted?.id) throw new Error("Failed to create fleet program");

    return { programId: inserted.id, created: true };
  },
};
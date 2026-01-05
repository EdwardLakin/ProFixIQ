// features/agent/tools/findOrCreateFleet.ts
import { z } from "zod";
import { getServerSupabase } from "../server/supabase";
import type { ToolDef } from "../lib/toolTypes";

export const FindOrCreateFleetIn = z.object({
  name: z.string().min(1),
  contact_email: z.string().email().optional(),
  contact_name: z.string().min(1).optional(),
});
export type FindOrCreateFleetIn = z.infer<typeof FindOrCreateFleetIn>;

export const FindOrCreateFleetOut = z.object({
  fleetId: z.string().uuid(),
  created: z.boolean().optional(),
});
export type FindOrCreateFleetOut = z.infer<typeof FindOrCreateFleetOut>;

export const toolFindOrCreateFleet: ToolDef<
  FindOrCreateFleetIn,
  FindOrCreateFleetOut
> = {
  name: "find_or_create_fleet",
  description:
    "Finds a fleet by name for this shop or creates it if it does not exist.",
  inputSchema: FindOrCreateFleetIn,
  outputSchema: FindOrCreateFleetOut,
  async run(input, ctx) {
    const supabase = getServerSupabase();

    const fleetName = input.name.trim();

    // 1) Try find existing fleet (case-insensitive) within this shop
    const { data: existing, error: findErr } = await supabase
      .from("fleets")
      .select("id")
      .eq("shop_id", ctx.shopId)
      .ilike("name", fleetName)
      .limit(1)
      .maybeSingle<{ id: string }>();

    if (findErr) throw new Error(findErr.message);
    if (existing?.id) return { fleetId: existing.id, created: false };

    // 2) Insert new fleet
    const { data: inserted, error: insErr } = await supabase
      .from("fleets")
      .insert({
        shop_id: ctx.shopId,
        name: fleetName,
        contact_email: input.contact_email ?? null,
        contact_name: input.contact_name ?? null,
      })
      .select("id")
      .maybeSingle<{ id: string }>();

    if (insErr) throw new Error(insErr.message);
    if (!inserted?.id) throw new Error("Failed to create fleet");

    return { fleetId: inserted.id, created: true };
  },
};
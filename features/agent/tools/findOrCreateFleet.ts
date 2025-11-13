// features/agent/tools/findOrCreateFleet.ts
import { z } from "zod";
import { getServerSupabase } from "../server/supabase";
import type { ToolDef } from "../lib/toolTypes";

export const FindOrCreateFleetIn = z.object({
  name: z.string().min(1),
  contact_email: z.string().email().optional(),
  contact_name: z.string().optional(),
});
export type FindOrCreateFleetIn = z.infer<typeof FindOrCreateFleetIn>;

export const FindOrCreateFleetOut = z.object({
  fleetId: z.string().uuid(),
});
export type FindOrCreateFleetOut = z.infer<typeof FindOrCreateFleetOut>;

export const toolFindOrCreateFleet: ToolDef<
  FindOrCreateFleetIn,
  FindOrCreateFleetOut
> = {
  name: "find_or_create_fleet",
  description:
    "Finds a fleet by name (within the same shop) or creates it if it does not exist.",
  inputSchema: FindOrCreateFleetIn,
  outputSchema: FindOrCreateFleetOut,
  async run(input, ctx) {
    const supabase = getServerSupabase();

    const { data: existing, error: findErr } = await supabase
      .from("fleets")
      .select("id")
      .eq("shop_id", ctx.shopId)
      .ilike("name", input.name)
      .limit(1)
      .maybeSingle();

    if (findErr) throw new Error(findErr.message);
    if (existing?.id) {
      return { fleetId: existing.id };
    }

    const { data: inserted, error: insErr } = await supabase
      .from("fleets")
      .insert({
        shop_id: ctx.shopId,
        name: input.name,
        contact_email: input.contact_email ?? null,
        contact_name: input.contact_name ?? null,
      })
      .select("id")
      .maybeSingle();

    if (insErr || !inserted?.id) {
      throw new Error(insErr?.message ?? "Failed to create fleet");
    }
    return { fleetId: inserted.id };
  },
};
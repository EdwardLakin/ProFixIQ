// features/agent/tools/findCustomerVehicle.ts
import { z } from "zod";
import { getServerSupabase } from "../server/supabase";
import type { ToolDef } from "../lib/toolTypes";

const In = z.object({
  customerQuery: z.string().min(1).optional(),
  plateOrVin: z.string().min(2).optional(),
});
export type FindCustomerVehicleIn = z.infer<typeof In>;

const Match = z.object({
  customerId: z.string().uuid(),
  customerName: z.string(),
  vehicleId: z.string().uuid(),
  year: z.number().nullable(),
  make: z.string().nullable(),
  model: z.string().nullable(),
  vin: z.string().nullable(),
  license_plate: z.string().nullable(),
});

const Out = z.object({
  // “best guess” (first match) to keep existing planner code working
  customerId: z.string().uuid().optional(),
  vehicleId: z.string().uuid().optional(),

  // always return matches (possibly empty)
  matches: z.array(Match),

  // NEW: helps planners decide whether they should stop vs proceed
  found: z.boolean(),

  // NEW: a human-friendly explanation when found=false
  reason: z.string().optional(),
});
export type FindCustomerVehicleOut = z.infer<typeof Out>;

type VehicleRow = {
  id: string;
  customer_id: string | null;
  year: number | null;
  make: string | null;
  model: string | null;
  vin: string | null;
  license_plate: string | null;
  customers?: { name: string | null } | null;
};
function isVehicleRows(x: unknown): x is VehicleRow[] {
  return Array.isArray(x);
}

type CustomerWithVehicles = {
  id: string;
  name: string | null;
  vehicles:
    | Array<{
        id: string | null;
        year: number | null;
        make: string | null;
        model: string | null;
        vin: string | null;
        license_plate: string | null;
      }>
    | null;
};
function isCustomerWithVehicles(x: unknown): x is CustomerWithVehicles[] {
  return Array.isArray(x);
}

function normalizeQueryPart(s: string): string {
  // keep it simple: trim and cap length
  return s.trim().slice(0, 64);
}

function pickFirst(out: Array<z.infer<typeof Match>>) {
  return {
    customerId: out[0]?.customerId,
    vehicleId: out[0]?.vehicleId,
  };
}

export const toolFindCustomerVehicle: ToolDef<
  FindCustomerVehicleIn,
  FindCustomerVehicleOut
> = {
  name: "find_customer_vehicle",
  description: "Fuzzy search customers/vehicles by name, plate, or VIN",
  inputSchema: In,
  outputSchema: Out,
  async run(input, ctx) {
    const supabase = getServerSupabase();

    const plateOrVinRaw =
      typeof input.plateOrVin === "string" ? normalizeQueryPart(input.plateOrVin) : "";
    const customerQueryRaw =
      typeof input.customerQuery === "string" ? normalizeQueryPart(input.customerQuery) : "";

    // Prefer plate/VIN search when provided
    if (plateOrVinRaw) {
      const res = await supabase
        .from("vehicles")
        .select("id, customer_id, year, make, model, vin, license_plate, customers(name)")
        .eq("shop_id", ctx.shopId)
        .or(`license_plate.ilike.%${plateOrVinRaw}%,vin.ilike.%${plateOrVinRaw}%`)
        .limit(5);

      if (res.error) throw new Error(res.error.message);

      const data = isVehicleRows(res.data) ? res.data : [];
      const matches = data
        .filter((v) => typeof v.id === "string" && typeof v.customer_id === "string")
        .map((v) => {
          const customerName =
            v.customers && typeof v.customers === "object" && "name" in v.customers
              ? ((v.customers as { name: string | null }).name ?? "Customer")
              : "Customer";

          return {
            customerId: v.customer_id as string,
            customerName,
            vehicleId: v.id,
            year: v.year,
            make: v.make,
            model: v.model,
            vin: v.vin,
            license_plate: v.license_plate,
          };
        });

      const best = pickFirst(matches);
      return {
        ...best,
        matches,
        found: matches.length > 0,
        ...(matches.length === 0
          ? {
              reason: `No vehicle match for "${plateOrVinRaw}" in this shop.`,
            }
          : {}),
      };
    }

    // Customer name search (shop-scoped)
    if (customerQueryRaw) {
      const res = await supabase
        .from("customers")
        .select("id, name, vehicles(id, year, make, model, vin, license_plate)")
        .eq("shop_id", ctx.shopId)
        .ilike("name", `%${customerQueryRaw}%`)
        .limit(5);

      if (res.error) throw new Error(res.error.message);

      const data = isCustomerWithVehicles(res.data) ? res.data : [];

      const matches = data.flatMap((c) =>
        (c.vehicles ?? [])
          .filter((v) => typeof v?.id === "string")
          .map((v) => ({
            customerId: c.id,
            customerName: c.name ?? "Customer",
            vehicleId: v.id as string,
            year: v.year,
            make: v.make,
            model: v.model,
            vin: v.vin,
            license_plate: v.license_plate,
          })),
      );

      const best = pickFirst(matches);
      return {
        ...best,
        matches,
        found: matches.length > 0,
        ...(matches.length === 0
          ? {
              reason: `No customer+vehicle matches for "${customerQueryRaw}" in this shop.`,
            }
          : {}),
      };
    }

    return {
      matches: [],
      found: false,
      reason: "Provide customerQuery and/or plateOrVin.",
    };
  },
};
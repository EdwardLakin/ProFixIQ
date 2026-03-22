import { z } from "zod";
import { getServerSupabase } from "../server/supabase";
import type { ToolContext } from "../lib/toolTypes";
import { runFindCustomerVehicle } from "../lib/toolRegistry";

const InputSchema = z.object({
  vehicleId: z.string().uuid().optional(),
  customerQuery: z.string().min(1).optional(),
  plateOrVin: z.string().min(2).optional(),
  limit: z.number().int().min(1).max(20).optional(),
});

type Input = z.infer<typeof InputSchema>;

function customerDisplayName(
  customer:
    | {
        first_name?: string | null;
        last_name?: string | null;
        name?: string | null;
        business_name?: string | null;
      }
    | null
    | undefined,
): string {
  if (!customer) return "Customer";
  return (
    customer.business_name ??
    customer.name ??
    [customer.first_name ?? "", customer.last_name ?? ""]
      .filter(Boolean)
      .join(" ")
      .trim() ??
    "Customer"
  );
}

function vehicleDisplayName(
  vehicle:
    | {
        year?: number | null;
        make?: string | null;
        model?: string | null;
        license_plate?: string | null;
        vin?: string | null;
      }
    | null
    | undefined,
): string {
  if (!vehicle) return "Vehicle";
  const ym = [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ");
  const tail = vehicle.license_plate ?? vehicle.vin ?? null;
  return tail ? `${ym} (${tail})`.trim() : ym || "Vehicle";
}

export async function runGetVehicleHistory(
  rawInput: Input,
  ctx: ToolContext,
) {
  const input = InputSchema.parse(rawInput);
  const supabase = getServerSupabase();

  let vehicleId = input.vehicleId ?? null;
  let customerId: string | null = null;

  if (!vehicleId) {
    const found = await runFindCustomerVehicle(
      {
        customerQuery: input.customerQuery,
        plateOrVin: input.plateOrVin,
      },
      ctx,
    );

    vehicleId = found.vehicleId ?? null;
    customerId = found.customerId ?? null;
  }

  if (!vehicleId) {
    return {
      ok: false,
      summary:
        "I couldn’t resolve that vehicle yet. Try a plate, VIN, or pair it with a customer name.",
      citations: [],
    };
  }

  const { data, error } = await supabase
    .from("work_orders")
    .select(
      `
      id,
      custom_id,
      created_at,
      updated_at,
      status,
      customer_id,
      vehicle_id,
      customers:customer_id (
        id,
        first_name,
        last_name,
        name,
        business_name
      ),
      vehicles:vehicle_id (
        id,
        year,
        make,
        model,
        license_plate,
        vin
      ),
      work_order_lines (
        id,
        description,
        complaint,
        correction,
        status,
        labor_time,
        updated_at
      )
    `,
    )
    .eq("shop_id", ctx.shopId)
    .eq("vehicle_id", vehicleId)
    .order("created_at", { ascending: false })
    .limit(input.limit ?? 12);

  if (error) {
    throw new Error(error.message);
  }

  const rows = (data ?? []) as Array<{
    id: string;
    custom_id: string | null;
    created_at: string | null;
    status: string | null;
    customer_id: string | null;
    customers?: {
      first_name?: string | null;
      last_name?: string | null;
      name?: string | null;
      business_name?: string | null;
    } | null;
    vehicles?: {
      year?: number | null;
      make?: string | null;
      model?: string | null;
      license_plate?: string | null;
      vin?: string | null;
    } | null;
    work_order_lines?: Array<{
      description?: string | null;
      complaint?: string | null;
      correction?: string | null;
      labor_time?: number | null;
    }> | null;
  }>;

  if (rows.length === 0) {
    return {
      ok: true,
      vehicleId,
      customerId,
      summary: "I found the vehicle, but there are no prior work orders yet.",
      citations: [],
    };
  }

  const latest = rows[0];
  const ownerName = customerDisplayName(latest.customers);
  const vehicleName = vehicleDisplayName(latest.vehicles);

  const recentWork = rows
    .slice(0, 3)
    .map((row) => {
      const lines = Array.isArray(row.work_order_lines) ? row.work_order_lines : [];
      const summary = lines
        .slice(0, 2)
        .map((line) => line.correction ?? line.description ?? line.complaint ?? "Service line")
        .filter(Boolean)
        .join("; ");

      return `${row.custom_id ? `WO #${row.custom_id}` : row.id.slice(0, 8)}: ${summary || row.status || "No details"}`;
    })
    .join(" | ");

  return {
    ok: true,
    vehicleId,
    customerId: latest.customer_id ?? customerId,
    summary:
      `${vehicleName} has ${rows.length} recent work order(s) in this shop. ` +
      `Current owner/customer on latest record: ${ownerName}. ` +
      (recentWork ? `Recent work: ${recentWork}.` : ""),
    citations: rows.map((row) => ({
      type: "work_order",
      id: row.id,
      href: `/work-orders/${row.id}`,
      label: row.custom_id ? `WO #${row.custom_id}` : `WO ${row.id.slice(0, 8)}`,
    })),
  };
}

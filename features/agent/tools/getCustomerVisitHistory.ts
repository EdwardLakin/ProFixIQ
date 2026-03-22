import { z } from "zod";
import { getServerSupabase } from "../server/supabase";
import type { ToolContext } from "../lib/toolTypes";
import { runFindCustomerVehicle } from "../lib/toolRegistry";

const InputSchema = z.object({
  customerId: z.string().uuid().optional(),
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

export async function runGetCustomerVisitHistory(
  rawInput: Input,
  ctx: ToolContext,
) {
  const input = InputSchema.parse(rawInput);
  const supabase = getServerSupabase();

  let customerId = input.customerId ?? null;
  let vehicleId: string | null = null;

  if (!customerId) {
    const found = await runFindCustomerVehicle(
      {
        customerQuery: input.customerQuery,
        plateOrVin: input.plateOrVin,
      },
      ctx,
    );

    customerId = found.customerId ?? null;
    vehicleId = found.vehicleId ?? null;
  }

  if (!customerId) {
    return {
      ok: false,
      summary:
        "I couldn’t find that customer in this shop yet. Try a more specific customer name, phone, plate, or VIN.",
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
      notes,
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
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false })
    .limit(input.limit ?? 10);

  if (error) {
    throw new Error(error.message);
  }

  const rows = (data ?? []) as Array<{
    id: string;
    custom_id: string | null;
    created_at: string | null;
    status: string | null;
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
      customerId,
      vehicleId,
      summary: "This customer exists, but I couldn’t find any prior work orders.",
      citations: [],
    };
  }

  const latest = rows[0];
  const lines = Array.isArray(latest.work_order_lines) ? latest.work_order_lines : [];
  const workSummary = lines
    .slice(0, 3)
    .map((line) => line.correction ?? line.description ?? line.complaint ?? "Service line")
    .filter(Boolean)
    .join("; ");

  return {
    ok: true,
    customerId,
    vehicleId,
    summary:
      `${customerDisplayName(latest.customers)} last visited on ${latest.created_at ?? "an unknown date"}. ` +
      `Latest work order ${latest.custom_id ? `#${latest.custom_id}` : latest.id} ` +
      `for ${vehicleDisplayName(latest.vehicles)} is ${latest.status ?? "unknown status"}. ` +
      (workSummary
        ? `Work performed: ${workSummary}.`
        : "I found the visit, but not enough line detail to summarize the work."),
    citations: rows.map((row) => ({
      type: "work_order",
      id: row.id,
      href: `/work-orders/${row.id}`,
      label: row.custom_id ? `WO #${row.custom_id}` : `WO ${row.id.slice(0, 8)}`,
    })),
  };
}

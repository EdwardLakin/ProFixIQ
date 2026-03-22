import { z } from "zod";
import { getServerSupabase } from "../server/supabase";
import type { ToolContext } from "../lib/toolTypes";
import { runFindCustomerVehicle } from "../lib/toolRegistry";

const InputSchema = z.object({
  customerId: z.string().uuid().optional(),
  customerQuery: z.string().min(1).optional(),
  plateOrVin: z.string().min(2).optional(),
  status: z.string().optional(),
  limit: z.number().int().min(1).max(50).optional(),
});

type Input = z.infer<typeof InputSchema>;

export async function runGetBookings(rawInput: Input, ctx: ToolContext) {
  const input = InputSchema.parse(rawInput);
  const supabase = getServerSupabase();

  let customerId = input.customerId ?? null;

  if (!customerId && (input.customerQuery || input.plateOrVin)) {
    const found = await runFindCustomerVehicle(
      {
        customerQuery: input.customerQuery,
        plateOrVin: input.plateOrVin,
      },
      ctx,
    );
    customerId = found.customerId ?? null;
  }

  let query = supabase
    .from("bookings")
    .select(
      `
      id,
      customer_id,
      vehicle_id,
      work_order_id,
      starts_at,
      ends_at,
      status,
      notes
    `,
    )
    .eq("shop_id", ctx.shopId)
    .order("starts_at", { ascending: false })
    .limit(input.limit ?? 20);

  if (customerId) {
    query = query.eq("customer_id", customerId);
  }

  if (input.status) {
    query = query.eq("status", input.status);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as Array<{
    id: string;
    customer_id: string | null;
    vehicle_id: string | null;
    work_order_id: string | null;
    starts_at: string;
    ends_at: string | null;
    status: string | null;
    notes: string | null;
  }>;

  if (rows.length === 0) {
    return {
      ok: true,
      summary: "I couldn’t find any matching bookings.",
      citations: [],
    };
  }

  return {
    ok: true,
    summary: `I found ${rows.length} booking(s). The most recent starts at ${rows[0].starts_at}.`,
    citations: rows.map((row) => ({
      type: "booking",
      id: row.id,
      href: "/dashboard/appointments",
      label: `${row.status ?? "booking"} • ${row.starts_at}`,
    })),
  };
}

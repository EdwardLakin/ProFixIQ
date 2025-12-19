// app/api/portal/request/start/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

export const runtime = "nodejs";

type DB = Database;

type Body = {
  vehicleId?: string | null;
  visitType: "waiter" | "drop_off";
  notes?: string | null;

  // ✅ NEW: the selected slot start from /api/portal/availability
  startsAt?: string | null; // ISO string
  durationMins?: number | null; // default 60
};

function bad(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status });
}

function isIsoDateString(s: string) {
  const t = Date.parse(s);
  return Number.isFinite(t);
}

export async function POST(req: Request) {
  try {
    const supabase = createRouteHandlerClient<DB>({ cookies });

    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();

    if (authErr || !user) return bad("Not authenticated", 401);

    let body: Body;
    try {
      body = (await req.json()) as Body;
    } catch {
      return bad("Invalid JSON body");
    }

    const visitType = body?.visitType;
    if (visitType !== "waiter" && visitType !== "drop_off") {
      return bad("visitType must be 'waiter' or 'drop_off'");
    }

    const startsAtRaw = typeof body.startsAt === "string" ? body.startsAt.trim() : "";
    if (!startsAtRaw) return bad("Missing startsAt (ISO) from selected slot.");
    if (!isIsoDateString(startsAtRaw)) return bad("startsAt must be a valid ISO date string.");

    const duration =
      typeof body.durationMins === "number" && Number.isFinite(body.durationMins)
        ? Math.max(15, Math.min(180, Math.trunc(body.durationMins)))
        : 60;

    const startsAt = new Date(startsAtRaw);
    const endsAt = new Date(startsAt.getTime() + duration * 60_000);

    // Basic safety: don't allow bookings in the past
    if (startsAt.getTime() < Date.now() - 60_000) {
      return bad("Selected time is in the past. Please choose another slot.");
    }

    // Portal customer by auth user
    const { data: customer, error: custErr } = await supabase
      .from("customers")
      .select("id, shop_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (custErr) return bad(custErr.message, 500);
    if (!customer?.id) return bad("Customer profile not found", 404);
    if (!customer.shop_id) return bad("Customer is not linked to a shop", 400);

    // 1) Create the work order
    const insertWo: DB["public"]["Tables"]["work_orders"]["Insert"] = {
      shop_id: customer.shop_id,
      customer_id: customer.id,
      vehicle_id: body.vehicleId ?? null,

      // Keep your portal behavior
      status: "awaiting_approval",
      approval_state: "pending",
      is_waiter: visitType === "waiter",
      notes: (body.notes ?? "").trim() || null,
    };

    const { data: createdWo, error: woErr } = await supabase
      .from("work_orders")
      .insert(insertWo)
      .select(
        "id, shop_id, customer_id, vehicle_id, status, approval_state, is_waiter, created_at",
      )
      .single();

    if (woErr || !createdWo?.id) return bad("Failed to create work order", 500);

    // 2) Create the booking row so the selected slot is actually reserved
    // (These keys exist in your availability route, so bookings has starts_at/ends_at/status.)
    const insertBooking: DB["public"]["Tables"]["bookings"]["Insert"] = {
      shop_id: customer.shop_id,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      status: "pending",

      // Optional linkage if your schema supports them:
      // These are common in ProFixIQ, and extra fields are allowed by supabase at runtime
      // even if not present in types; but we only set fields that exist in generated Insert.
      //
      // If your bookings table DOES have work_order_id/customer_id/vehicle_id,
      // add them here after confirming types.
    };

    const { data: createdBooking, error: bErr } = await supabase
      .from("bookings")
      .insert(insertBooking)
      .select("id, starts_at, ends_at, status")
      .single();

    if (bErr || !createdBooking?.id) {
      // Roll back the WO if booking fails
      await supabase.from("work_orders").delete().eq("id", createdWo.id);
      return bad(bErr?.message ?? "Failed to create booking", 500);
    }

    return NextResponse.json(
      {
        workOrderId: createdWo.id,
        bookingId: createdBooking.id,
        workOrder: createdWo,
        booking: createdBooking,
      },
      { status: 201 },
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("portal request start error:", msg);
    return bad("Unexpected error", 500);
  }
}
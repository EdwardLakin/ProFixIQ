// app/api/portal/request/submit/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

export const runtime = "nodejs";

type DB = Database;

type Body = {
  workOrderId: string;
  startsAt: string; // ISO
  // Customer does NOT pick end time. We book a 1-hour slot.
};

function bad(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status });
}

function addHoursIso(startIso: string, hours: number): string {
  const d = new Date(startIso);
  d.setHours(d.getHours() + hours);
  return d.toISOString();
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

    const workOrderId = (body?.workOrderId ?? "").trim();
    const startsAt = (body?.startsAt ?? "").trim();

    if (!workOrderId || !startsAt) return bad("Missing workOrderId or startsAt");

    const start = new Date(startsAt);
    if (Number.isNaN(start.getTime())) return bad("Invalid startsAt");

    // Resolve portal customer
    const { data: customer, error: custErr } = await supabase
      .from("customers")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (custErr) return bad(custErr.message, 500);
    if (!customer?.id) return bad("Customer profile not found", 404);

    // Load WO + ensure ownership
    const { data: wo, error: woErr } = await supabase
      .from("work_orders")
      .select("id, shop_id, customer_id, vehicle_id, is_waiter")
      .eq("id", workOrderId)
      .maybeSingle();

    if (woErr) return bad("Failed to load work order", 500);
    if (!wo) return bad("Work order not found", 404);
    if (wo.customer_id !== customer.id) return bad("Not allowed", 403);

    const endsAt = addHoursIso(startsAt, 1);

    // Overlap check (same shop, overlapping window)
    const { data: overlaps, error: ovErr } = await supabase
      .from("bookings")
      .select("id")
      .eq("shop_id", wo.shop_id)
      .or(`and(starts_at.lt.${endsAt},ends_at.gt.${startsAt})`)
      .limit(1);

    if (ovErr) return bad("Failed to check availability", 500);
    if (overlaps && overlaps.length > 0) return bad("This time overlaps an existing booking", 409);

    const insertBooking: DB["public"]["Tables"]["bookings"]["Insert"] = {
      shop_id: wo.shop_id,
      customer_id: wo.customer_id,
      vehicle_id: wo.vehicle_id ?? null,
      starts_at: startsAt,
      ends_at: endsAt,
      status: "pending",
      notes: null,
      // If you add bookings.work_order_id + bookings.visit_type in SQL, set them here:
      // work_order_id: wo.id,
      // visit_type: wo.is_waiter ? "waiter" : "drop_off",
    };

    const { data: created, error: insErr } = await supabase
      .from("bookings")
      .insert(insertBooking)
      .select("*")
      .single();

    if (insErr || !created) return bad("Failed to create booking", 500);

    return NextResponse.json({ booking: created }, { status: 201 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("portal request submit error:", msg);
    return bad("Unexpected error", 500);
  }
}

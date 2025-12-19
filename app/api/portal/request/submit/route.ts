// app/api/portal/request/submit/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

export const runtime = "nodejs";

type DB = Database;

type Body = {
  workOrderId: string;
  bookingId: string;
};

function bad(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status });
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
    const bookingId = (body?.bookingId ?? "").trim();
    if (!workOrderId || !bookingId) return bad("Missing workOrderId or bookingId");

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
      .select("id, shop_id, customer_id")
      .eq("id", workOrderId)
      .maybeSingle();

    if (woErr) return bad("Failed to load work order", 500);
    if (!wo) return bad("Work order not found", 404);
    if (wo.customer_id !== customer.id) return bad("Not allowed", 403);

    // Load booking + ensure it belongs to the same shop
    const { data: booking, error: bErr } = await supabase
      .from("bookings")
      .select("id, shop_id, starts_at, ends_at, status")
      .eq("id", bookingId)
      .maybeSingle();

    if (bErr) return bad("Failed to load booking", 500);
    if (!booking) return bad("Booking not found", 404);
    if (booking.shop_id !== wo.shop_id) return bad("Not allowed", 403);

    // Optional sanity: booking should still be in the future-ish
    const startT = Date.parse(String(booking.starts_at ?? ""));
    if (Number.isFinite(startT) && startT < Date.now() - 60_000) {
      return bad("This booking time is in the past. Please start again.", 409);
    }

    // Finalize: DO NOT create a new booking (Option B).
    // Keep status as "pending" (or change if you add a distinct finalized status later).
    const bookingUpdate: DB["public"]["Tables"]["bookings"]["Update"] = {
      status: booking.status ?? "pending",
    };

    const { error: updErr } = await supabase
      .from("bookings")
      .update(bookingUpdate)
      .eq("id", booking.id);

    if (updErr) return bad("Failed to finalize booking", 500);

    return NextResponse.json(
      { ok: true, workOrderId: wo.id, bookingId: booking.id },
      { status: 200 },
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("portal request submit error:", msg);
    return bad("Unexpected error", 500);
  }
}
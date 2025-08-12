// app/api/portal/bookings/[id]/route.ts
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@shared/types/types/supabase";

export const runtime = "nodejs";

type PatchBody = {
  status?: "pending" | "confirmed" | "completed" | "cancelled";
  startsAt?: string; // ISO for reschedule
  endsAt?: string;   // ISO for reschedule
  notes?: string | null;
};

function bad(msg: string, code = 400) {
  return NextResponse.json({ error: msg }, { status: code });
}

export async function PATCH(req: NextRequest, context: { params: { id: string } }) {
  const supabase = createRouteHandlerClient<Database>({ cookies });
  const bookingId = context.params.id;

  // 1) Auth
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) return bad("Not authenticated", 401);

  let payload: PatchBody;
  try {
    payload = (await req.json()) as PatchBody;
  } catch {
    return bad("Invalid JSON body");
  }

  const { status: nextStatus, startsAt, endsAt, notes } = payload ?? {};

  // 2) Load booking + shop context
  const { data: booking, error: bErr } = await supabase
    .from("bookings")
    .select("id, shop_id, customer_id, starts_at, ends_at, status")
    .eq("id", bookingId)
    .single();
  if (bErr || !booking) return bad("Booking not found", 404);

  // 3) Determine actor role
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, shop_id")
    .eq("id", user.id)
    .single();

  const staffRoles = ["owner", "admin", "manager", "advisor", "mechanic", "parts"] as const;
  const isStaff =
    !!profile?.role &&
    (staffRoles as readonly string[]).includes(profile.role) &&
    profile.shop_id === booking.shop_id;

  // Is this the customer who owns the booking?
  const { data: custRow } = await supabase
    .from("customers")
    .select("id")
    .eq("id", booking.customer_id)
    .eq("user_id", user.id)
    .maybeSingle();
  const isCustomerOwner = !!custRow;

  if (!isStaff && !isCustomerOwner) return bad("Not allowed", 403);

  // 4) Validate status transition
  const curr = booking.status as PatchBody["status"];
  const allowedTransitions: Record<
    NonNullable<PatchBody["status"]>,
    NonNullable<PatchBody["status"]>[]
  > = {
    pending: ["confirmed", "cancelled"],
    confirmed: ["completed", "cancelled"],
    completed: [],
    cancelled: [],
  };

  if (isCustomerOwner && nextStatus && nextStatus !== "cancelled") {
    return bad("Customers may only cancel their own booking", 403);
  }
  if (nextStatus) {
    if (!curr || !allowedTransitions[curr].includes(nextStatus)) {
      return bad(`Invalid status transition: ${curr} → ${nextStatus}`);
    }
  }

  // 5) Reschedule (staff only)
  const newStart = startsAt ? new Date(startsAt) : null;
  const newEnd = endsAt ? new Date(endsAt) : null;

  if (newStart || newEnd) {
    if (!isStaff) return bad("Only staff can reschedule", 403);
    if (!newStart || !newEnd || isNaN(newStart.getTime()) || isNaN(newEnd.getTime()) || newEnd <= newStart) {
      return bad("Invalid startsAt/endsAt");
    }

    // Shop constraints
    const { data: shop } = await supabase
      .from("shop") // change to "shops" if your table is plural
      .select("id, min_notice_minutes, max_lead_days")
      .eq("id", booking.shop_id)
      .single();

    const now = new Date();
    const minNotice = shop?.min_notice_minutes ?? 120;
    const maxLead = shop?.max_lead_days ?? 30;

    const minutesUntil = Math.floor((newStart.getTime() - now.getTime()) / 60000);
    if (minutesUntil < minNotice) return bad(`Reschedule requires at least ${minNotice} minutes notice`);

    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const daysUntil = Math.floor((newStart.getTime() - startOfToday) / 86400000);
    if (daysUntil > maxLead) return bad(`Cannot schedule more than ${maxLead} days ahead`);

    // Overlap check (exclude this booking)
    const { data: overlaps, error: ovErr } = await supabase
      .from("bookings")
      .select("id")
      .eq("shop_id", booking.shop_id)
      .neq("id", booking.id)
      .or(`and(starts_at.lt.${newEnd.toISOString()},ends_at.gt.${newStart.toISOString()})`)
      .limit(1);
    if (ovErr) return bad("Failed to check overlaps", 500);
    if (overlaps && overlaps.length > 0) return bad("Selected time overlaps another booking", 409);
  }

  // 6) Patch
  const patch: Partial<Database["public"]["Tables"]["bookings"]["Update"]> = {};
  if (nextStatus) patch.status = nextStatus;
  if (typeof notes !== "undefined") patch.notes = notes;
  if (newStart && newEnd) {
    patch.starts_at = newStart.toISOString();
    patch.ends_at = newEnd.toISOString();
  }
  if (Object.keys(patch).length === 0) return bad("Nothing to update");

  // 7) Update
  const { data: updated, error: upErr } = await supabase
    .from("bookings")
    .update(patch)
    .eq("id", bookingId)
    .select("*")
    .single();
  if (upErr || !updated) return bad("Failed to update booking", 500);

  return NextResponse.json({ booking: updated }, { status: 200 });
}
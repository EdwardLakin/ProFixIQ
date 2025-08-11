// app/api/portal/book/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

export const runtime = "nodejs";

type Body = {
  shopSlug: string;
  startsAt: string; // ISO
  endsAt: string;   // ISO
  notes?: string;
  vehicleId?: string | null;
};

function bad(msg: string, code = 400) {
  return NextResponse.json({ error: msg }, { status: code });
}

export async function POST(req: Request) {
  try {
    const supabase = createRouteHandlerClient<Database>({ cookies });

    // 1) Auth
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();
    if (authErr || !user) return bad("Not authenticated", 401);

    // 2) Parse body
    const body = (await req.json()) as Body;
    const { shopSlug, startsAt, endsAt, notes = "", vehicleId = null } = body || {};
    if (!shopSlug || !startsAt || !endsAt) {
      return bad("Missing shopSlug, startsAt, or endsAt");
    }

    const start = new Date(startsAt);
    const end = new Date(endsAt);
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) {
      return bad("Invalid start/end");
    }

    // 3) Load shop (NOTE: using 'shop' table name to match your types)
    const { data: shop, error: shopErr } = await supabase
      .from("shop")
      .select(
        "id, slug, accepts_online_booking, min_notice_minutes, max_lead_days, timezone",
      )
      .eq("slug", shopSlug)
      .single();

    if (shopErr || !shop) return bad("Shop not found", 404);
    if (shop.accepts_online_booking === false) {
      return bad("Shop is not accepting online bookings", 403);
    }

    // 4) Get customer row for this user
    const { data: customer, error: custErr } = await supabase
      .from("customers")
      .select("id, shop_id")
      .eq("user_id", user.id)
      .single();

    if (custErr || !customer) {
      return bad("Customer profile not found for this user", 404);
    }

    // 5) Enforce notice/max lead
    const now = new Date();
    const minutesUntil = Math.floor((start.getTime() - now.getTime()) / 60000);
    const minNotice = shop.min_notice_minutes ?? 120;
    if (minutesUntil < minNotice) {
      return bad(`Bookings require at least ${minNotice} minutes notice`);
    }

    const daysUntil = Math.floor(
      (start.getTime() - new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) /
        86400000,
    );
    const maxLead = shop.max_lead_days ?? 30;
    if (daysUntil > maxLead) {
      return bad(`Bookings cannot be more than ${maxLead} days in advance`);
    }

    // 6) Overlap check (same shop, overlapping time window)
    const { data: overlaps, error: ovErr } = await supabase
      .from("bookings")
      .select("id")
      .eq("shop_id", shop.id)
      .or(
        // (existing.starts_at < requested.end) AND (existing.ends_at > requested.start)
        `and(starts_at.lt.${endsAt},ends_at.gt.${startsAt})`,
      )
      .limit(1);

    if (ovErr) return bad("Failed to check availability", 500);
    if (overlaps && overlaps.length > 0) {
      return bad("This time overlaps an existing booking", 409);
    }

    // 7) Insert booking
    const insertPayload = {
      shop_id: shop.id,
      customer_id: customer.id,
      vehicle_id: vehicleId ?? null,
      starts_at: startsAt,
      ends_at: endsAt,
      status: "pending" as const,
      notes: notes || null,
    };

    const { data: created, error: insErr } = await supabase
      .from("bookings")
      .insert(insertPayload)
      .select("*")
      .single();

    if (insErr || !created) return bad("Failed to create booking", 500);

    // 8) OPTIONAL: attach customer to shop if not already set
    if (!customer.shop_id) {
      const { error: attachErr } = await supabase
        .from("customers")
        .update({ shop_id: shop.id })
        .eq("id", customer.id);

      // Not fatal if RLS blocks this; booking is already created.
      if (attachErr) {
        console.warn("Could not link customer to shop:", attachErr.message);
      }
    }

    // 9) Return the booking
    return NextResponse.json({ booking: created }, { status: 201 });
  } catch (err: any) {
    console.error("Booking error:", err?.message || err);
    return bad("Unexpected error", 500);
  }
}
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import { getActorCapabilities } from "@/features/shared/lib/rbac";

type DB = Database;

type PatchBody = {
  status?: "pending" | "confirmed" | "cancelled" | "completed";
  notes?: string | null;
  starts_at?: string;
  ends_at?: string;
};

async function getAuthedContext(supabase: ReturnType<typeof createRouteHandlerClient<DB>>) {
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("id, role, shop_id")
    .eq("id", user.id)
    .single();

  if (profileErr || !profile?.shop_id) {
    return { error: NextResponse.json({ error: "Profile/shop not found" }, { status: 403 }) };
  }

  const actor = getActorCapabilities({ role: profile.role });
  if (!actor.isKnownRole || !actor.canManageScheduling) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return {
    user,
    profile: {
      id: profile.id,
      role: String(profile.role ?? ""),
      shop_id: profile.shop_id,
    },
  };
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctx.params;
    const supabase = createRouteHandlerClient<DB>({ cookies });

    const auth = await getAuthedContext(supabase);
    if ("error" in auth) return auth.error;

    const body = (await req.json().catch(() => ({}))) as PatchBody;

    const { data: booking, error: bookingErr } = await supabase
      .from("bookings")
      .select("id, shop_id")
      .eq("id", id)
      .single();

    if (bookingErr || !booking) {
      return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    }

    if (booking.shop_id !== auth.profile.shop_id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const update: DB["public"]["Tables"]["bookings"]["Update"] = {};

    if (body.status) update.status = body.status;
    if (body.notes !== undefined) update.notes = body.notes;
    if (body.starts_at) update.starts_at = body.starts_at;
    if (body.ends_at) update.ends_at = body.ends_at;

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    const { data: updated, error: updateErr } = await supabase
      .from("bookings")
      .update(update)
      .eq("id", id)
      .eq("shop_id", auth.profile.shop_id)
      .select("id, starts_at, ends_at, status, notes, customer_id, vehicle_id, work_order_id")
      .single();

    if (updateErr || !updated) {
      return NextResponse.json(
        { error: updateErr?.message || "Failed to update booking" },
        { status: 500 }
      );
    }

    return NextResponse.json(updated);
  } catch (err) {
    console.error("portal booking PATCH error", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctx.params;
    const supabase = createRouteHandlerClient<DB>({ cookies });

    const auth = await getAuthedContext(supabase);
    if ("error" in auth) return auth.error;

    const { data: booking, error: bookingErr } = await supabase
      .from("bookings")
      .select("id, shop_id")
      .eq("id", id)
      .single();

    if (bookingErr || !booking) {
      return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    }

    if (booking.shop_id !== auth.profile.shop_id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { error: deleteErr } = await supabase
      .from("bookings")
      .delete()
      .eq("id", id)
      .eq("shop_id", auth.profile.shop_id);

    if (deleteErr) {
      return NextResponse.json(
        { error: deleteErr.message || "Failed to delete booking" },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("portal booking DELETE error", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

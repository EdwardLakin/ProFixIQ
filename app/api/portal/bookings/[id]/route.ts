import { NextResponse } from "next/server";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import type { Database } from "@shared/types/types/supabase";
import { getActorCapabilities } from "@/features/shared/lib/rbac";
import {
  canTransitionBookingStatus,
  normalizeBookingStatus,
} from "@/features/portal/server/bookingLifecycle";
import { notifyBookingConfirmation } from "@/features/portal/server/notifyBookingConfirmation";

type DB = Database;

type PatchBody = {
  status?: "pending" | "confirmed" | "cancelled" | "completed";
  notes?: string | null;
  starts_at?: string;
  ends_at?: string;
};

async function getAuthedContext(supabase: ReturnType<typeof createServerSupabaseRoute>) {
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
    const supabase = createServerSupabaseRoute();

    const auth = await getAuthedContext(supabase);
    if ("error" in auth) return auth.error;

    const body = (await req.json().catch(() => ({}))) as PatchBody;

    const { data: booking, error: bookingErr } = await supabase
      .from("bookings")
      .select("id, shop_id, status, work_order_id")
      .eq("id", id)
      .single();

    if (bookingErr || !booking) {
      return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    }

    if (booking.shop_id !== auth.profile.shop_id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const update: DB["public"]["Tables"]["bookings"]["Update"] = {};
    let statusUpdated = false;

    if (body.status) {
      const nextStatus = normalizeBookingStatus(body.status);
      if (!nextStatus || !canTransitionBookingStatus(booking.status, nextStatus)) {
        return NextResponse.json(
          { error: `Cannot move appointment from ${booking.status ?? "pending"} to ${body.status}` },
          { status: 409 },
        );
      }
      const { error: transitionErr } = await (supabase as never as {
        rpc: (
          fn: "transition_booking_status_by_staff",
          args: { p_booking_id: string; p_status: string },
        ) => Promise<{ data: unknown; error: { message?: string } | null }>;
      }).rpc("transition_booking_status_by_staff", {
        p_booking_id: booking.id,
        p_status: nextStatus,
      });

      if (transitionErr) {
        return NextResponse.json(
          { error: transitionErr.message || "Failed to update appointment status" },
          { status: 409 },
        );
      }
      statusUpdated = true;
    }
    if (body.notes !== undefined) update.notes = body.notes;
    if (body.starts_at) update.starts_at = body.starts_at;
    if (body.ends_at) update.ends_at = body.ends_at;

    if (Object.keys(update).length === 0 && !statusUpdated) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    const updatedQuery = Object.keys(update).length > 0
      ? supabase
          .from("bookings")
          .update(update)
          .eq("id", id)
          .eq("shop_id", auth.profile.shop_id)
          .select("id, shop_id, starts_at, ends_at, status, notes, customer_id, vehicle_id, work_order_id")
          .single()
      : supabase
          .from("bookings")
          .select("id, shop_id, starts_at, ends_at, status, notes, customer_id, vehicle_id, work_order_id")
          .eq("id", id)
          .eq("shop_id", auth.profile.shop_id)
          .single();

    const { data: updated, error: updateErr } = await updatedQuery;

    if (updateErr || !updated) {
      return NextResponse.json(
        { error: updateErr?.message || "Failed to update booking" },
        { status: 500 }
      );
    }

    let confirmationNotification: "not_requested" | "sent" | "skipped" = "not_requested";
    if (body.status === "confirmed") {
      try {
        confirmationNotification = (await notifyBookingConfirmation(supabase, updated))
          ? "sent"
          : "skipped";
      } catch (notificationError) {
        confirmationNotification = "skipped";
        console.error("booking confirmation notification failed", notificationError);
      }
    }

    return NextResponse.json({
      ...updated,
      confirmation_notification: confirmationNotification,
    });
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
    const supabase = createServerSupabaseRoute();

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

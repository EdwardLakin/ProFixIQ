import { NextResponse } from "next/server";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import type { Database } from "@shared/types/types/supabase";
import { requireCanonicalShopOrFieldApiAccess } from "@/features/mobile/service/server/access";
import { notifyBookingConfirmation } from "@/features/portal/server/notifyBookingConfirmation";

type DB = Database;
type RpcError = {
  message: string;
  details?: string | null;
  hint?: string | null;
};
type RpcClient = {
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: RpcError | null }>;
};

type PatchBody = {
  status?: "pending" | "confirmed" | "cancelled" | "completed";
  notes?: string | null;
  starts_at?: string;
  ends_at?: string;
  reason?: string | null;
  customer_id?: string | null;
  idempotencyKey?: string;
};

async function getAuthedContext() {
  const access = await requireCanonicalShopOrFieldApiAccess({
    requiredCapability: "canManageScheduling",
  });
  if (!access.ok) return { error: access.response };
  return {
    supabase: access.supabase,
    user: { id: access.authUserId },
    profile: {
      id: access.profile.id,
      shop_id: access.profile.shop_id,
    },
  };
}

function suppliedOperationKey(req: Request, body?: PatchBody): string {
  return (
    req.headers.get("Idempotency-Key")?.trim() ||
    body?.idempotencyKey?.trim() ||
    ""
  );
}

function lifecycleOperationKey(args: {
  supplied: string;
  shopId: string;
  bookingId: string;
  action: string;
  startsAt?: string | null;
  endsAt?: string | null;
}): string {
  return (
    args.supplied ||
    [
      "compat",
      args.shopId,
      args.bookingId,
      args.action,
      args.startsAt ?? "",
      args.endsAt ?? "",
    ].join(":")
  ).slice(0, 300);
}

function rpcStatus(message: string): number {
  const lower = message.toLowerCase();
  if (lower.includes("not found")) return 404;
  if (
    lower.includes("not authorized") ||
    lower.includes("another shop") ||
    lower.includes("owned by")
  ) {
    return 403;
  }
  if (
    lower.includes("terminal") ||
    lower.includes("overlap") ||
    lower.includes("resource") ||
    lower.includes("available") ||
    lower.includes("only pending")
  ) {
    return 409;
  }
  return 400;
}

async function runLifecycleCommand(args: {
  supabase: ReturnType<typeof createServerSupabaseRoute>;
  bookingId: string;
  actorUserId: string;
  action: "reschedule" | "cancel" | "confirm" | "complete";
  startsAt?: string | null;
  endsAt?: string | null;
  notes?: string | null;
  reason?: string | null;
  operationKey: string;
}) {
  const rpc = args.supabase as unknown as RpcClient;
  return rpc.rpc("apply_portal_booking_command_atomic", {
    p_action: args.action,
    p_booking_id: args.bookingId,
    p_shop_id: null,
    p_customer_id: null,
    p_vehicle_id: null,
    p_starts_at: args.startsAt ?? null,
    p_ends_at: args.endsAt ?? null,
    p_notes: args.notes ?? null,
    p_actor_user_id: args.actorUserId,
    p_actor_mode: "staff",
    p_operation_key: args.operationKey,
    p_reason: args.reason ?? null,
    p_at: new Date().toISOString(),
  });
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  if (!id) {
    return NextResponse.json({ error: "Missing booking id" }, { status: 400 });
  }

  const auth = await getAuthedContext();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const body = (await req.json().catch(() => ({}))) as PatchBody;
  const isReschedule =
    body.starts_at !== undefined || body.ends_at !== undefined;
  const lifecycleAction = isReschedule
    ? "reschedule"
    : body.status === "cancelled"
      ? "cancel"
      : body.status === "confirmed"
        ? "confirm"
        : body.status === "completed"
          ? "complete"
          : null;

  if (lifecycleAction) {
    if (isReschedule && (!body.starts_at || !body.ends_at)) {
      return NextResponse.json(
        { error: "Both starts_at and ends_at are required for rescheduling" },
        { status: 400 },
      );
    }

    const key = lifecycleOperationKey({
      supplied: suppliedOperationKey(req, body),
      shopId: auth.profile.shop_id,
      bookingId: id,
      action: lifecycleAction,
      startsAt: body.starts_at,
      endsAt: body.ends_at,
    });

    const { data, error } = await runLifecycleCommand({
      supabase,
      bookingId: id,
      actorUserId: auth.profile.id,
      action: lifecycleAction,
      startsAt: body.starts_at,
      endsAt: body.ends_at,
      notes: body.notes,
      reason: body.reason,
      operationKey: key,
    });

    if (error) {
      const message = [error.message, error.details, error.hint]
        .filter(Boolean)
        .join(" — ");
      return NextResponse.json(
        { error: message },
        { status: rpcStatus(message) },
      );
    }

    const result = (data ?? {}) as {
      booking?: DB["public"]["Tables"]["bookings"]["Row"];
    };
    const updated = result.booking;
    let confirmationNotification: "not_requested" | "sent" | "skipped" =
      "not_requested";
    if (lifecycleAction === "confirm" && updated) {
      try {
        confirmationNotification = (await notifyBookingConfirmation(
          supabase,
          updated,
        ))
          ? "sent"
          : "skipped";
      } catch (notificationError) {
        confirmationNotification = "skipped";
        console.error(
          "booking confirmation notification failed",
          notificationError,
        );
      }
    }

    return NextResponse.json({
      ...(updated ?? result),
      confirmation_notification: confirmationNotification,
    });
  }

  const { data: existing, error: existingErr } = await supabase
    .from("bookings")
    .select("id,status")
    .eq("id", id)
    .eq("shop_id", auth.profile.shop_id)
    .maybeSingle();
  if (existingErr) {
    return NextResponse.json({ error: existingErr.message }, { status: 500 });
  }
  if (!existing) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }

  const update: DB["public"]["Tables"]["bookings"]["Update"] = {};
  if (body.notes !== undefined) update.notes = body.notes;
  if (body.customer_id !== undefined) {
    if (!body.customer_id) {
      return NextResponse.json(
        { error: "A canonical customer is required" },
        { status: 400 },
      );
    }
    const { data: customer, error: customerErr } = await supabase
      .from("customers")
      .select("id")
      .eq("id", body.customer_id)
      .eq("shop_id", auth.profile.shop_id)
      .maybeSingle();
    if (customerErr) {
      return NextResponse.json({ error: customerErr.message }, { status: 500 });
    }
    if (!customer) {
      return NextResponse.json(
        { error: "Customer does not belong to this shop" },
        { status: 403 },
      );
    }
    update.customer_id = body.customer_id;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json(
      { error: "No valid fields to update" },
      { status: 400 },
    );
  }

  const { data: updated, error: updateErr } = await supabase
    .from("bookings")
    .update(update)
    .eq("id", id)
    .eq("shop_id", auth.profile.shop_id)
    .select(
      "id, shop_id, starts_at, ends_at, status, notes, customer_id, vehicle_id, work_order_id",
    )
    .maybeSingle();

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }
  if (!updated) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }
  return NextResponse.json(updated);
}

export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  if (!id) {
    return NextResponse.json({ error: "Missing booking id" }, { status: 400 });
  }

  const auth = await getAuthedContext();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const key = lifecycleOperationKey({
    supplied: req.headers.get("Idempotency-Key")?.trim() ?? "",
    shopId: auth.profile.shop_id,
    bookingId: id,
    action: "cancel",
  });

  const { data, error } = await runLifecycleCommand({
    supabase,
    bookingId: id,
    actorUserId: auth.profile.id,
    action: "cancel",
    reason: "Cancelled from staff scheduling",
    operationKey: key,
  });

  if (error) {
    const message = [error.message, error.details, error.hint]
      .filter(Boolean)
      .join(" — ");
    return NextResponse.json(
      { error: message },
      { status: rpcStatus(message) },
    );
  }

  return NextResponse.json(data);
}

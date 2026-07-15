import { NextResponse } from "next/server";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import type { Database } from "@shared/types/types/supabase";
import { getActorCapabilities } from "@/features/shared/lib/rbac";

type DB = Database;
type RpcError = { message: string; details?: string | null; hint?: string | null };
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
  idempotencyKey?: string;
};

async function getAuthedContext(
  supabase: ReturnType<typeof createServerSupabaseRoute>,
) {
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
    return {
      error: NextResponse.json({ error: "Profile/shop not found" }, { status: 403 }),
    };
  }

  const actor = getActorCapabilities({ role: profile.role });
  if (!actor.isKnownRole || !actor.canManageScheduling) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return {
    user,
    profile: {
      id: profile.id,
      shop_id: profile.shop_id,
    },
  };
}

function operationKey(req: Request, body?: PatchBody): string {
  return (
    req.headers.get("Idempotency-Key")?.trim() ||
    body?.idempotencyKey?.trim() ||
    ""
  );
}

function rpcStatus(message: string): number {
  const lower = message.toLowerCase();
  if (lower.includes("not found")) return 404;
  if (lower.includes("not authorized") || lower.includes("another shop")) return 403;
  if (
    lower.includes("terminal") ||
    lower.includes("overlap") ||
    lower.includes("work-order-linked")
  ) {
    return 409;
  }
  return 400;
}

async function runLifecycleCommand(args: {
  supabase: ReturnType<typeof createServerSupabaseRoute>;
  bookingId: string;
  actorUserId: string;
  action: "reschedule" | "cancel";
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

  const supabase = createServerSupabaseRoute();
  const auth = await getAuthedContext(supabase);
  if ("error" in auth) return auth.error;

  const body = (await req.json().catch(() => ({}))) as PatchBody;
  const isReschedule = body.starts_at !== undefined || body.ends_at !== undefined;
  const isCancel = body.status === "cancelled";

  if (isReschedule || isCancel) {
    const key = operationKey(req, body);
    if (!key) {
      return NextResponse.json(
        { error: "A stable Idempotency-Key is required." },
        { status: 400 },
      );
    }
    if (isReschedule && (!body.starts_at || !body.ends_at)) {
      return NextResponse.json(
        { error: "Both starts_at and ends_at are required for rescheduling" },
        { status: 400 },
      );
    }

    const { data, error } = await runLifecycleCommand({
      supabase,
      bookingId: id,
      actorUserId: auth.profile.id,
      action: isCancel ? "cancel" : "reschedule",
      startsAt: body.starts_at,
      endsAt: body.ends_at,
      notes: body.notes,
      reason: body.reason,
      operationKey: `${auth.profile.shop_id}:staff-booking:${key}`,
    });

    if (error) {
      const message = [error.message, error.details, error.hint]
        .filter(Boolean)
        .join(" — ");
      return NextResponse.json({ error: message }, { status: rpcStatus(message) });
    }

    return NextResponse.json(data);
  }

  const update: DB["public"]["Tables"]["bookings"]["Update"] = {};
  if (body.status === "pending" || body.status === "confirmed" || body.status === "completed") {
    update.status = body.status;
  }
  if (body.notes !== undefined) update.notes = body.notes;

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const { data: updated, error: updateErr } = await supabase
    .from("bookings")
    .update(update)
    .eq("id", id)
    .eq("shop_id", auth.profile.shop_id)
    .select("id, starts_at, ends_at, status, notes, customer_id, vehicle_id, work_order_id")
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

  const supabase = createServerSupabaseRoute();
  const auth = await getAuthedContext(supabase);
  if ("error" in auth) return auth.error;

  const key = req.headers.get("Idempotency-Key")?.trim() ?? "";
  if (!key) {
    return NextResponse.json(
      { error: "A stable Idempotency-Key is required." },
      { status: 400 },
    );
  }

  const { data, error } = await runLifecycleCommand({
    supabase,
    bookingId: id,
    actorUserId: auth.profile.id,
    action: "cancel",
    reason: "Cancelled from staff scheduling",
    operationKey: `${auth.profile.shop_id}:staff-booking-delete:${key}`,
  });

  if (error) {
    const message = [error.message, error.details, error.hint]
      .filter(Boolean)
      .join(" — ");
    return NextResponse.json({ error: message }, { status: rpcStatus(message) });
  }

  return NextResponse.json(data);
}

import { NextResponse } from "next/server";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import { requirePortalCustomerActor } from "@/features/portal/server/requirePortalActor";
import { PortalAccessError } from "@/features/portal/server/portalAuth";
import { cancelCustomerBooking } from "@/features/portal/server/customerBookings";

type Body = {
  status?: "cancelled";
  reason?: string | null;
  operationKey?: string;
  idempotencyKey?: string;
};

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  if (!id) {
    return NextResponse.json({ error: "Missing booking id" }, { status: 400 });
  }

  const body = (await req.json().catch(() => ({}))) as Body;
  if (body.status !== "cancelled") {
    return NextResponse.json(
      { error: "Only cancellation is allowed" },
      { status: 400 },
    );
  }

  const operationKey =
    req.headers.get("Idempotency-Key")?.trim() ||
    body.operationKey?.trim() ||
    body.idempotencyKey?.trim() ||
    "";
  if (!operationKey) {
    return NextResponse.json(
      { error: "A stable Idempotency-Key is required" },
      { status: 400 },
    );
  }

  const supabase = createServerSupabaseRoute();
  try {
    const actor = await requirePortalCustomerActor(supabase);
    const result = await cancelCustomerBooking({
      supabase,
      bookingId: id,
      customerId: actor.customer.id,
      actorUserId: actor.userId,
      operationKey: `${actor.customer.shop_id ?? "unscoped"}:booking-cancel:${operationKey}`,
      reason: body.reason,
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status },
      );
    }

    return NextResponse.json(result.data);
  } catch (error: unknown) {
    if (error instanceof PortalAccessError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }
    const message =
      error instanceof Error ? error.message : "Unexpected portal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

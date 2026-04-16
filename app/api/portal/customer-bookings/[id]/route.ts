import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import { requirePortalCustomerActor } from "@/features/portal/server/requirePortalActor";
import { cancelCustomerBooking } from "@/features/portal/server/customerBookings";

type DB = Database;

type Body = {
  status?: "cancelled";
};

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: "Missing booking id" }, { status: 400 });

  const body = (await req.json().catch(() => ({}))) as Body;
  if (body.status !== "cancelled") {
    return NextResponse.json({ error: "Only cancellation is allowed" }, { status: 400 });
  }

  const supabase = createRouteHandlerClient<DB>({ cookies });

  try {
    const actor = await requirePortalCustomerActor(supabase);
    const result = await cancelCustomerBooking({
      supabase,
      bookingId: id,
      customerId: actor.customer.id,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json(result.data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Not authenticated";
    const status = message.toLowerCase().includes("not authenticated") ? 401 : 404;
    return NextResponse.json({ error: message }, { status });
  }
}

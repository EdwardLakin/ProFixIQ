import { NextResponse } from "next/server";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import { requirePortalCustomerActor } from "@/features/portal/server/requirePortalActor";
import { PortalAccessError } from "@/features/portal/server/portalAuth";
import { listCustomerBookings } from "@/features/portal/server/customerBookings";


export async function GET() {
  const supabase = createServerSupabaseRoute();

  try {
    const actor = await requirePortalCustomerActor(supabase);
    const bookings = await listCustomerBookings({
      supabase,
      customerId: actor.customer.id,
    });

    if (!bookings.ok) {
      return NextResponse.json({ error: bookings.error }, { status: bookings.status });
    }

    return NextResponse.json(bookings.data);
  } catch (error: unknown) {
    if (error instanceof PortalAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Unexpected portal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

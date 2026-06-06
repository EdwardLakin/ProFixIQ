import { NextResponse } from "next/server";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import { requirePortalCustomerActor } from "@/features/portal/server/requirePortalActor";
import { PortalAccessError } from "@/features/portal/server/portalAuth";
import { listPortalApprovalsForCustomer } from "@/features/portal/server/listPortalApprovals";


export async function GET() {
  const supabase = createServerSupabaseRoute();

  try {
    const actor = await requirePortalCustomerActor(supabase);

    const result = await listPortalApprovalsForCustomer({
      supabase,
      customer: actor.customer,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json(result.data);
  } catch (error: unknown) {
    if (error instanceof PortalAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Unexpected portal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

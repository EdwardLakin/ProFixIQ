import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import { requirePortalCustomerActor } from "@/features/portal/server/requirePortalActor";
import { listPortalApprovalsForCustomer } from "@/features/portal/server/listPortalApprovals";

type DB = Database;

export async function GET() {
  const supabase = createRouteHandlerClient<DB>({ cookies });

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
    const message = error instanceof Error ? error.message : "Not authenticated";
    const status = message.toLowerCase().includes("not authenticated") ? 401 : 404;
    return NextResponse.json({ error: message }, { status });
  }
}

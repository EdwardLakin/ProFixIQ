import { NextResponse } from "next/server";
import {
  createAdminSupabase,
  createServerSupabaseRoute,
} from "@/features/shared/lib/supabase/server";
import { PortalAccessError } from "@/features/portal/server/portalAuth";
import { requirePortalCustomerActor } from "@/features/portal/server/requirePortalActor";
import { listPortalPartsQuotes } from "@/features/portal/server/portalPartsQuotes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function bad(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const supabase = createServerSupabaseRoute();

  try {
    const actor = await requirePortalCustomerActor(supabase);
    const shopId = actor.customer.shop_id;
    if (!shopId) return bad("Customer is not linked to a shop", 409);
    if (!UUID_PATTERN.test(id)) return bad("This quote is unavailable.", 404);

    const { quotes } = await listPortalPartsQuotes({
      admin: createAdminSupabase(),
      shopId,
      customerId: actor.customer.id,
      id,
    });
    const quote = quotes[0];
    if (!quote) return bad("This quote is unavailable.", 404);
    return NextResponse.json({ quote });
  } catch (error: unknown) {
    if (error instanceof PortalAccessError) return bad(error.message, error.status);
    console.error("[portal/parts-quotes/detail] failed", {
      message: error instanceof Error ? error.message : "unknown",
    });
    return bad("This quote could not be loaded.", 500);
  }
}

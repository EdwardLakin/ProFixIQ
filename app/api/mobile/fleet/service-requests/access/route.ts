import { NextResponse } from "next/server";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import { resolveServiceRequestsAccess } from "@/features/fleet/lib/resolveServiceRequestsAccess";

export const dynamic = "force-dynamic";

/**
 * Lightweight access check for nav visibility only (no request data) — e.g.
 * the mobile Resume/Work menu deciding whether to show a "Service Requests"
 * link at all, rather than showing it to every shop-side role and letting
 * the page itself 403. A dedicated, additive endpoint (mirroring how "Field
 * Service" already gates its own tile via /api/mobile/field-service/access)
 * rather than a new method on the existing /api/fleet/service-requests
 * data route, so this never touches that route's established contract.
 * Shares resolveServiceRequestsAccess with the data route's POST handler so
 * this can never authorize something the real endpoint would reject.
 */
export async function GET(request: Request) {
  try {
    const supabase = createServerSupabaseRoute();
    const requestedFleetId = new URL(request.url).searchParams.get("fleetId");
    const access = await resolveServiceRequestsAccess(supabase, {
      requestedFleetId,
    });
    return NextResponse.json({ canAccess: access.ok });
  } catch (error) {
    console.error("[mobile/fleet/service-requests/access] error", error);
    return NextResponse.json({ canAccess: false });
  }
}

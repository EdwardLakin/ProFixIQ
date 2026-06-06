import { NextResponse } from "next/server";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import { getActorCapabilities } from "@/features/shared/lib/rbac";
import {
  createPortalBooking,
  type CreatePortalBookingInput,
} from "@/features/portal/server/createPortalBooking";

export const runtime = "nodejs";

function bad(msg: string, code = 400) {
  return NextResponse.json({ error: msg }, { status: code });
}

export async function POST(req: Request) {
  try {
    const supabase = createServerSupabaseRoute();
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();

    if (authErr || !user) return bad("Not authenticated", 401);

    const { data: profile, error: profileErr } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle<{ role: string | null }>();

    if (profileErr) return bad(profileErr.message, 403);

    const actor = getActorCapabilities({ role: profile?.role ?? null });
    if (!actor.isKnownRole || (!actor.canManageScheduling && !actor.canViewShopWideData)) {
      return bad("This legacy endpoint is staff-only", 403);
    }

    const body = (await req.json()) as CreatePortalBookingInput;
    const result = await createPortalBooking({
      supabase,
      userId: user.id,
      input: body,
      actorMode: "allow-staff",
    });

    if (!result.ok) return bad(result.error, result.status);
    return NextResponse.json({ booking: result.booking }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Booking error:", message);
    return bad("Unexpected error", 500);
  }
}

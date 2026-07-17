import { NextResponse } from "next/server";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import { resolveCurrentActor } from "@/features/shared/lib/currentActor";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const supabase = createServerSupabaseRoute();
  const actor = await resolveCurrentActor(supabase);
  if (!actor.user) {
    return NextResponse.json(
      { error: "Sign in again before syncing saved work." },
      { status: 401 },
    );
  }
  if (!actor.profile || !actor.shopId) {
    return NextResponse.json(
      { error: "Your shop access is no longer available." },
      { status: 403 },
    );
  }

  return NextResponse.json(
    {
      userId: actor.user.id,
      shopId: actor.shopId,
      role: actor.role,
      verifiedAt: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

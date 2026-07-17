import { NextResponse } from "next/server";
import {
  createAdminSupabase,
  createServerSupabaseRoute,
} from "@/features/shared/lib/supabase/server";
import { resolveMessagingActor } from "@/features/ai/lib/chat/authorization";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const userClient = createServerSupabaseRoute();
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const actor = await resolveMessagingActor({
    supabase: createAdminSupabase(),
    actorUserId: user.id,
  });
  if (!actor.ok) {
    return NextResponse.json({ error: actor.error }, { status: actor.status });
  }

  return NextResponse.json({
    userId: user.id,
    shopId: actor.actor.shopId,
    actorKind: actor.actor.kind,
  });
}

import { NextResponse } from "next/server";
import {
  createAdminSupabase,
  createServerSupabaseRoute,
} from "@/features/shared/lib/supabase/server";
import { authorizeConversationActor } from "@/features/ai/lib/chat/authorization";

export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<NextResponse> {
  const userClient = createServerSupabaseRoute();
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as {
    conversationId?: string;
    actor_kind?: "staff" | "customer";
  } | null;
  if (!body?.conversationId)
    return NextResponse.json(
      { error: "conversationId required" },
      { status: 400 },
    );

  const admin = createAdminSupabase();
  const access = await authorizeConversationActor({
    supabase: admin,
    conversationId: body.conversationId,
    actorUserId: user.id,
    preferredKind: body.actor_kind,
  });

  if (!access.ok) {
    return NextResponse.json(
      { error: access.error },
      { status: access.status },
    );
  }

  const readAt = new Date().toISOString();
  const { error: deliveryError } = await admin
    .from("message_deliveries")
    .update({ read_at: readAt })
    .eq("conversation_id", body.conversationId)
    .eq("recipient_participant_id", access.actorParticipant.id)
    .is("read_at", null);

  if (deliveryError) {
    return NextResponse.json({ error: deliveryError.message }, { status: 500 });
  }

  const { error } = await admin.from("message_reads").upsert(
    {
      user_id: user.id,
      conversation_id: body.conversationId,
      last_read_at: readAt,
    },
    { onConflict: "user_id,conversation_id" },
  );

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

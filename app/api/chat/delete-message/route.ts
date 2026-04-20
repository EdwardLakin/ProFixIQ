// app/api/chat/delete-message/route.ts
import { NextResponse } from "next/server";
import { createAdminSupabase, createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import { authorizeConversationActor } from "@/features/ai/lib/chat/authorization";

export const dynamic = "force-dynamic";

/**
 * Delete a message if the authenticated user is its sender and can access the parent conversation.
 * Body: { id: string }
 */
export async function POST(req: Request): Promise<NextResponse> {
  const userClient = createServerSupabaseRoute();

  const {
    data: { user },
  } = await userClient.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as { id?: string } | null;
  const messageId = body?.id;

  if (!messageId) {
    return NextResponse.json({ error: "Message ID required" }, { status: 400 });
  }

  const admin = createAdminSupabase();
  const { data: message, error: fetchError } = await admin
    .from("messages")
    .select("id, sender_id, conversation_id")
    .eq("id", messageId)
    .maybeSingle();

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  if (!message) {
    return NextResponse.json({ error: "Message not found" }, { status: 404 });
  }

  if (!message.conversation_id) {
    return NextResponse.json({ error: "Message has no conversation" }, { status: 400 });
  }

  const access = await authorizeConversationActor({
    supabase: admin,
    conversationId: message.conversation_id,
    actorUserId: user.id,
  });

  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  if (message.sender_id !== user.id) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const { error: deleteError } = await admin
    .from("messages")
    .delete()
    .eq("id", messageId);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

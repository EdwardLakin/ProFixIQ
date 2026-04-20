import { NextResponse } from "next/server";
import {
  createAdminSupabase,
  createServerSupabaseRoute,
} from "@/features/shared/lib/supabase/server";
import { authorizeConversationActor } from "@/features/ai/lib/chat/authorization";

export async function POST(req: Request): Promise<NextResponse> {
  const userClient = createServerSupabaseRoute();
  const {
    data: { user },
  } = await userClient.auth.getUser();

  if (!user) {
    return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as {
    conversationId?: string;
    content?: string;
  } | null;

  const conversationId = body?.conversationId;
  const content = body?.content?.trim() ?? "";

  if (!conversationId || !content) {
    return NextResponse.json({ success: false, error: "Missing fields" }, { status: 400 });
  }

  const admin = createAdminSupabase();
  const access = await authorizeConversationActor({
    supabase: admin,
    conversationId,
    actorUserId: user.id,
  });

  if (!access.ok) {
    return NextResponse.json({ success: false, error: access.error }, { status: access.status });
  }

  const recipients = access.participantUserIds.filter((id) => id !== user.id);

  const { error } = await admin.from("messages").insert({
    conversation_id: conversationId,
    sender_id: user.id,
    recipients,
    content,
    sent_at: new Date().toISOString(),
    attachments: [],
    metadata: {},
  });

  if (error) {
    console.error("Error sending message:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

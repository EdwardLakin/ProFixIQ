import { NextResponse } from "next/server";
import {
  createServerSupabaseRoute,
  createAdminSupabase,
} from "@/features/shared/lib/supabase/server";
import { authorizeConversationActor } from "@/features/ai/lib/chat/authorization";

export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<NextResponse> {
  const userClient = createServerSupabaseRoute();

  const {
    data: { user },
  } = await userClient.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as
    | {
        conversationId?: string;
        content?: string;
        metadata?: Record<string, unknown>;
        clientMessageId?: string;
      }
    | null;

  const conversationId = body?.conversationId;
  const content = body?.content?.trim() ?? "";

  if (!conversationId || !content) {
    return NextResponse.json(
      { error: "conversationId and content are required" },
      { status: 400 },
    );
  }

  if (content.length > 10_000) {
    return NextResponse.json({ error: "Message is too long" }, { status: 400 });
  }

  const clientMessageId = body?.clientMessageId?.trim() ?? null;
  if (
    clientMessageId &&
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clientMessageId)
  ) {
    return NextResponse.json({ error: "clientMessageId must be a UUID" }, { status: 400 });
  }

  const admin = createAdminSupabase();
  const access = await authorizeConversationActor({
    supabase: admin,
    conversationId,
    actorUserId: user.id,
  });

  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const recipients = access.participantUserIds.filter((id) => id !== user.id);

  if (clientMessageId) {
    const { data: existing, error: existingError } = await admin
      .from("messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .eq("sender_id", user.id)
      .eq("client_message_id", clientMessageId)
      .maybeSingle();

    if (existingError) {
      return NextResponse.json({ error: existingError.message }, { status: 500 });
    }
    if (existing) {
      return NextResponse.json(existing, { status: 200 });
    }
  }

  const now = new Date().toISOString();
  const { data: inserted, error: insertErr } = await admin
    .from("messages")
    .insert({
      conversation_id: conversationId,
      sender_id: user.id,
      recipients,
      content,
      sent_at: now,
      attachments: [],
      metadata: body?.metadata ?? {},
      client_message_id: clientMessageId,
    })
    .select("*")
    .maybeSingle();

  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  return NextResponse.json(inserted, { status: 200 });
}

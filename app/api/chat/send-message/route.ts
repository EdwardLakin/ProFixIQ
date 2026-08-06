import { NextResponse } from "next/server";
import {
  createServerSupabaseRoute,
  createAdminSupabase,
} from "@/features/shared/lib/supabase/server";
import { authorizeConversationActor } from "@/features/ai/lib/chat/authorization";
import type { ChatMessage } from "@/features/chat/types";

export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<NextResponse> {
  const userClient = createServerSupabaseRoute();

  const {
    data: { user },
  } = await userClient.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as {
    conversationId?: string;
    content?: string;
    metadata?: Record<string, unknown>;
    clientMessageId?: string;
    actor_kind?: "staff" | "customer";
  } | null;

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
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      clientMessageId,
    )
  ) {
    return NextResponse.json(
      { error: "clientMessageId must be a UUID" },
      { status: 400 },
    );
  }

  const admin = createAdminSupabase();
  const access = await authorizeConversationActor({
    supabase: admin,
    conversationId,
    actorUserId: user.id,
    preferredKind: body?.actor_kind,
  });

  if (!access.ok) {
    return NextResponse.json(
      { error: access.error },
      { status: access.status },
    );
  }

  const recipients = Array.from(
    new Set(
      access.participants
        .filter((participant) => participant.id !== access.actorParticipant.id)
        .map((participant) => participant.user_id),
    ),
  );

  if (clientMessageId) {
    const { data: existing, error: existingError } = await admin
      .from("messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .eq("sender_participant_id", access.actorParticipant.id)
      .eq("client_message_id", clientMessageId)
      .maybeSingle();

    if (existingError) {
      return NextResponse.json(
        { error: existingError.message },
        { status: 500 },
      );
    }
    if (existing) {
      return NextResponse.json<ChatMessage>(
        {
          ...existing,
          sender_kind: access.actor.kind,
          sender_name: null,
          sender_avatar_url: null,
          is_mine: true,
          can_delete: existing.deleted_at == null,
        },
        { status: 200 },
      );
    }
  }

  const now = new Date().toISOString();
  const { data: inserted, error: insertErr } = await admin
    .from("messages")
    .insert({
      conversation_id: conversationId,
      sender_id: user.id,
      sender_participant_id: access.actorParticipant.id,
      sender_kind: access.actor.kind,
      recipients,
      content,
      sent_at: now,
      attachments: [],
      metadata: {
        ...(body?.metadata ?? {}),
        actor_kind: access.actor.kind,
      },
      client_message_id: clientMessageId,
    })
    .select("*")
    .maybeSingle();

  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  return NextResponse.json<ChatMessage>(
    {
      ...inserted,
      sender_kind: access.actor.kind,
      sender_name: null,
      sender_avatar_url: null,
      is_mine: true,
      can_delete: true,
    },
    { status: 200 },
  );
}

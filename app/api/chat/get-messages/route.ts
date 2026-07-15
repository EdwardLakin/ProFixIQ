import { NextResponse } from "next/server";
import {
  createServerSupabaseRoute,
  createAdminSupabase,
} from "@/features/shared/lib/supabase/server";
import { authorizeConversationActor } from "@/features/ai/lib/chat/authorization";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;
type MessageRow = DB["public"]["Tables"]["messages"]["Row"];

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
  } | null;

  const conversationId = body?.conversationId;
  if (!conversationId) {
    return NextResponse.json(
      { error: "conversationId required" },
      { status: 400 },
    );
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

  const { data: messages, error: msgErr } = await admin
    .from("messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("sent_at", { ascending: true })
    .order("created_at", { ascending: true });

  if (msgErr) {
    return NextResponse.json({ error: msgErr.message }, { status: 500 });
  }

  const visibleMessages = (messages ?? []).map((message) =>
    message.deleted_at
      ? {
          ...message,
          content: "Message removed",
          attachments: [],
          metadata: {},
        }
      : message,
  );

  return NextResponse.json<MessageRow[]>(visibleMessages);
}

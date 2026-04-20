import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createAdminSupabase, createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import { authorizeConversationCreate } from "@/features/ai/lib/chat/authorization";

export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<NextResponse> {
  const userClient = createServerSupabaseRoute();
  const {
    data: { user },
  } = await userClient.auth.getUser();

  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as {
    participant_ids?: string[];
    context_type?: string | null;
    context_id?: string | null;
    title?: string | null;
    is_broadcast?: boolean;
  } | null;

  const admin = createAdminSupabase();

  const createAccess = await authorizeConversationCreate({
    supabase: admin,
    actorUserId: user.id,
    participantUserIds: body?.participant_ids ?? [],
  });

  if (!createAccess.ok) {
    return NextResponse.json({ error: createAccess.error }, { status: createAccess.status });
  }

  const { data: me, error: meError } = await admin
    .from("profiles")
    .select("role")
    .or(`user_id.eq.${user.id},id.eq.${user.id}`)
    .maybeSingle();

  if (meError) {
    return NextResponse.json({ error: meError.message }, { status: 500 });
  }

  if (body?.is_broadcast && !["owner", "manager", "admin"].includes(me?.role ?? "")) {
    return NextResponse.json({ error: "Only owner/manager/admin can broadcast" }, { status: 403 });
  }

  const conversationId = randomUUID();
  const { error: convoErr } = await admin.from("conversations").insert({
    id: conversationId,
    created_by: user.id,
    context_type: body?.context_type ?? null,
    context_id: body?.context_id ?? null,
    title: body?.title ?? null,
    is_group: createAccess.recipientUserIds.length > 1 || !!body?.is_broadcast,
  });

  if (convoErr) return NextResponse.json({ error: convoErr.message }, { status: 500 });

  const participants = [user.id, ...createAccess.recipientUserIds].map((id) => ({
    id: randomUUID(),
    conversation_id: conversationId,
    user_id: id,
  }));

  const { error: partErr } = await admin.from("conversation_participants").insert(participants);
  if (partErr) return NextResponse.json({ error: partErr.message }, { status: 500 });

  return NextResponse.json({ id: conversationId }, { status: 200 });
}

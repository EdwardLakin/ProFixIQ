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
    actor_kind?: "staff" | "customer";
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
    preferredKind: body?.actor_kind,
  });

  if (!access.ok) {
    return NextResponse.json(
      { error: access.error },
      { status: access.status },
    );
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

  const profileIds = access.participants
    .map((participant) => participant.profile_id)
    .filter((id): id is string => Boolean(id));
  const customerIds = access.participants
    .map((participant) => participant.customer_id)
    .filter((id): id is string => Boolean(id));
  const [{ data: profiles }, { data: customers }] = await Promise.all([
    profileIds.length
      ? admin
          .from("profiles")
          .select("id, full_name, email, avatar_url")
          .in("id", profileIds)
      : Promise.resolve({ data: [], error: null }),
    customerIds.length
      ? admin
          .from("customers")
          .select("id, name, first_name, last_name, email")
          .in("id", customerIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  const profileById = new Map(
    (profiles ?? []).map((profile) => [profile.id, profile]),
  );
  const customerById = new Map(
    (customers ?? []).map((customer) => [customer.id, customer]),
  );
  const participantById = new Map(
    access.participants.map((participant) => [participant.id, participant]),
  );

  const visibleMessages: ChatMessage[] = (messages ?? []).map((message) => {
    const sender = message.sender_participant_id
      ? participantById.get(message.sender_participant_id)
      : undefined;
    const profile = sender?.profile_id
      ? profileById.get(sender.profile_id)
      : undefined;
    const customer = sender?.customer_id
      ? customerById.get(sender.customer_id)
      : undefined;
    const customerName = customer
      ? customer.name?.trim() ||
        [customer.first_name, customer.last_name]
          .filter(Boolean)
          .join(" ")
          .trim() ||
        customer.email?.trim() ||
        "Customer"
      : null;
    const isMine = message.sender_participant_id === access.actorParticipant.id;
    return {
      ...message,
      ...(message.deleted_at
        ? { content: "Message removed", attachments: [], metadata: {} }
        : {}),
      sender_kind:
        message.sender_kind === "customer"
          ? "customer"
          : message.sender_kind === "staff"
            ? "staff"
            : sender?.participant_kind === "customer"
              ? "customer"
              : "staff",
      sender_name: profile?.full_name ?? profile?.email ?? customerName,
      sender_avatar_url: profile?.avatar_url ?? null,
      is_mine: isMine,
      can_delete: isMine && message.deleted_at == null,
    };
  });

  return NextResponse.json<ChatMessage[]>(visibleMessages);
}

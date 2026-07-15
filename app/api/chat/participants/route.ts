import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import {
  createAdminSupabase,
  createServerSupabaseRoute,
} from "@/features/shared/lib/supabase/server";
import {
  authorizeConversationCreate,
  authorizeConversationLifecycleAction,
} from "@/features/ai/lib/chat/authorization";

export const dynamic = "force-dynamic";

type ParticipantRow = {
  id: string;
  conversation_id: string | null;
  user_id: string | null;
  role: string | null;
  added_at: string | null;
  participant_kind: "staff" | "customer";
};

function normalizeParticipantIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .filter((id): id is string => typeof id === "string")
        .map((id) => id.trim())
        .filter(Boolean),
    ),
  );
}

async function getAuthenticatedUserId(): Promise<string | null> {
  const userClient = createServerSupabaseRoute();
  const {
    data: { user },
  } = await userClient.auth.getUser();

  return user?.id ?? null;
}

export async function GET(req: Request): Promise<NextResponse> {
  const actorUserId = await getAuthenticatedUserId();
  if (!actorUserId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const conversationId = searchParams.get("conversationId")?.trim();

  if (!conversationId) {
    return NextResponse.json({ error: "conversationId required" }, { status: 400 });
  }

  const admin = createAdminSupabase();
  const access = await authorizeConversationLifecycleAction({
    supabase: admin,
    conversationId,
    actorUserId,
    action: "read_participants",
  });

  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const { data: participantRows, error: participantError } = await admin
    .from("conversation_participants")
    .select("id, conversation_id, user_id, role, added_at, participant_kind")
    .eq("conversation_id", conversationId);

  if (participantError) {
    return NextResponse.json({ error: participantError.message }, { status: 500 });
  }

  const userIds = Array.from(
    new Set(
      (participantRows ?? [])
        .map((row) => row.user_id)
        .filter((id): id is string => Boolean(id)),
    ),
  );

  const { data: profiles, error: profileError } = userIds.length
    ? await admin
        .from("profiles")
        .select("id, user_id, full_name, email, avatar_url")
        .or(userIds.map((id) => `user_id.eq.${id},id.eq.${id}`).join(","))
    : { data: [], error: null };

  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  const profileByUserId = new Map<string, { full_name: string | null; email: string | null; avatar_url: string | null }>();
  (profiles ?? []).forEach((profile) => {
    const resolvedUserId = profile.user_id ?? profile.id;
    if (!resolvedUserId) return;

    profileByUserId.set(resolvedUserId, {
      full_name: profile.full_name,
      email: profile.email,
      avatar_url: profile.avatar_url ?? null,
    });
  });

  const payload = (participantRows ?? []).map((row) => {
    const profile = row.user_id ? profileByUserId.get(row.user_id) : undefined;
    return {
      id: row.id,
      conversation_id: row.conversation_id,
      user_id: row.user_id,
      role: row.role,
      added_at: row.added_at,
      participant_kind: row.participant_kind,
      full_name: profile?.full_name ?? null,
      email: profile?.email ?? null,
      avatar_url: profile?.avatar_url ?? null,
    };
  });

  return NextResponse.json(payload, { status: 200 });
}

export async function POST(req: Request): Promise<NextResponse> {
  const actorUserId = await getAuthenticatedUserId();
  if (!actorUserId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as
    | {
        conversationId?: string;
        participant_ids?: unknown;
        role?: string | null;
      }
    | null;

  const conversationId = body?.conversationId?.trim();
  const participantIds = normalizeParticipantIds(body?.participant_ids);

  if (!conversationId || participantIds.length === 0) {
    return NextResponse.json(
      { error: "conversationId and participant_ids are required" },
      { status: 400 },
    );
  }

  const admin = createAdminSupabase();

  const access = await authorizeConversationLifecycleAction({
    supabase: admin,
    conversationId,
    actorUserId,
    action: "manage_participants",
  });

  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const createAccess = await authorizeConversationCreate({
    supabase: admin,
    actorUserId,
    participantUserIds: participantIds,
  });

  if (!createAccess.ok) {
    return NextResponse.json({ error: createAccess.error }, { status: createAccess.status });
  }

  const requestedUserIds = new Set(createAccess.recipientUserIds);
  const existingUserIds = new Set(access.participantUserIds);

  const newUserIds = Array.from(requestedUserIds).filter(
    (userId) => !existingUserIds.has(userId),
  );

  if (newUserIds.length === 0) {
    return NextResponse.json({ inserted: 0 }, { status: 200 });
  }

  const insertRows = newUserIds.map((userId) => ({
    id: randomUUID(),
    conversation_id: conversationId,
    user_id: userId,
    role: body?.role ?? null,
    participant_kind: "staff" as const,
  }));

  const { error: insertError } = await admin
    .from("conversation_participants")
    .insert(insertRows);

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ inserted: insertRows.length }, { status: 200 });
}

export async function PATCH(req: Request): Promise<NextResponse> {
  const actorUserId = await getAuthenticatedUserId();
  if (!actorUserId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as
    | {
        conversationId?: string;
        participantId?: string;
        role?: string | null;
        user_id?: string;
      }
    | null;

  const conversationId = body?.conversationId?.trim();
  const participantId = body?.participantId?.trim();
  const nextUserId = body?.user_id?.trim();

  if (!conversationId || !participantId) {
    return NextResponse.json({ error: "conversationId and participantId are required" }, { status: 400 });
  }

  if (body?.role === undefined && !nextUserId) {
    return NextResponse.json({ error: "No participant updates provided" }, { status: 400 });
  }

  const admin = createAdminSupabase();
  const access = await authorizeConversationLifecycleAction({
    supabase: admin,
    conversationId,
    actorUserId,
    action: "manage_participants",
  });

  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const { data: existingRow, error: existingError } = await admin
    .from("conversation_participants")
    .select("id, conversation_id, user_id, role, added_at, participant_kind")
    .eq("id", participantId)
    .eq("conversation_id", conversationId)
    .maybeSingle();

  if (existingError) {
    return NextResponse.json({ error: existingError.message }, { status: 500 });
  }

  if (!existingRow) {
    return NextResponse.json({ error: "Participant not found" }, { status: 404 });
  }

  if (existingRow.participant_kind === "customer") {
    return NextResponse.json(
      { error: "The customer participant cannot be modified" },
      { status: 400 },
    );
  }

  const updatePayload: { role?: string | null; user_id?: string } = {};

  if (body?.role !== undefined) {
    updatePayload.role = body.role;
  }

  if (nextUserId && nextUserId !== existingRow.user_id) {
    const createAccess = await authorizeConversationCreate({
      supabase: admin,
      actorUserId,
      participantUserIds: [nextUserId],
    });

    if (!createAccess.ok) {
      return NextResponse.json({ error: createAccess.error }, { status: createAccess.status });
    }

    const validatedNextUserId = createAccess.recipientUserIds[0];
    if (!validatedNextUserId) {
      return NextResponse.json({ error: "No valid in-shop recipient found" }, { status: 400 });
    }

    const { data: duplicateParticipant } = await admin
      .from("conversation_participants")
      .select("id")
      .eq("conversation_id", conversationId)
      .eq("user_id", validatedNextUserId)
      .neq("id", participantId)
      .maybeSingle();

    if (duplicateParticipant) {
      return NextResponse.json(
        { error: "User is already a participant in this conversation" },
        { status: 409 },
      );
    }

    updatePayload.user_id = validatedNextUserId;
  }

  const { data: updatedRow, error: updateError } = await admin
    .from("conversation_participants")
    .update(updatePayload)
    .eq("id", participantId)
    .eq("conversation_id", conversationId)
    .select("id, conversation_id, user_id, role, added_at, participant_kind")
    .maybeSingle();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  if (!updatedRow) {
    return NextResponse.json({ error: "Participant not found after update" }, { status: 404 });
  }

  return NextResponse.json(updatedRow satisfies ParticipantRow, { status: 200 });
}

export async function DELETE(req: Request): Promise<NextResponse> {
  const actorUserId = await getAuthenticatedUserId();
  if (!actorUserId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as
    | {
        conversationId?: string;
        participantId?: string;
        participantUserId?: string;
      }
    | null;

  const conversationId = body?.conversationId?.trim();
  const participantId = body?.participantId?.trim();
  const participantUserId = body?.participantUserId?.trim();

  if (!conversationId || (!participantId && !participantUserId)) {
    return NextResponse.json(
      { error: "conversationId and participantId or participantUserId are required" },
      { status: 400 },
    );
  }

  const admin = createAdminSupabase();
  const access = await authorizeConversationLifecycleAction({
    supabase: admin,
    conversationId,
    actorUserId,
    action: "manage_participants",
  });

  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  let targetQuery = admin
    .from("conversation_participants")
    .select("id, user_id, participant_kind")
    .eq("conversation_id", conversationId);

  if (participantId) {
    targetQuery = targetQuery.eq("id", participantId);
  }

  if (participantUserId) {
    targetQuery = targetQuery.eq("user_id", participantUserId);
  }

  const { data: targetRow, error: targetError } = await targetQuery.maybeSingle();

  if (targetError) {
    return NextResponse.json({ error: targetError.message }, { status: 500 });
  }

  if (!targetRow) {
    return NextResponse.json({ error: "Participant not found" }, { status: 404 });
  }

  if (targetRow.user_id === access.conversation.created_by) {
    return NextResponse.json(
      { error: "Conversation creator cannot be removed" },
      { status: 400 },
    );
  }

  if (targetRow.participant_kind === "customer") {
    return NextResponse.json(
      { error: "The customer participant cannot be removed" },
      { status: 400 },
    );
  }

  const deleteQuery = admin
    .from("conversation_participants")
    .delete()
    .eq("conversation_id", conversationId);

  if (participantId) {
    deleteQuery.eq("id", participantId);
  }

  if (participantUserId) {
    deleteQuery.eq("user_id", participantUserId);
  }

  const { data: deletedRows, error: deleteError } = await deleteQuery.select("id");

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  return NextResponse.json({ removed: deletedRows?.length ?? 0 }, { status: 200 });
}

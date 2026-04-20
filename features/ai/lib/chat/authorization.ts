import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";

type ConversationRow = Database["public"]["Tables"]["conversations"]["Row"];

type ProfileRow = Pick<
  Database["public"]["Tables"]["profiles"]["Row"],
  "id" | "user_id" | "shop_id" | "role"
>;

type ActorProfile = Omit<ProfileRow, "shop_id"> & { shop_id: string };

type AccessResult =
  | {
      ok: true;
      conversation: ConversationRow;
      participantUserIds: string[];
    }
  | {
      ok: false;
      status: 403 | 404 | 500;
      error: string;
    };

type LifecycleAction = "delete" | "manage_participants" | "read_participants";

async function getActorProfile({
  supabase,
  actorUserId,
}: {
  supabase: SupabaseClient<Database>;
  actorUserId: string;
}): Promise<{ ok: true; profile: ActorProfile } | { ok: false; status: 403 | 500; error: string }> {
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, user_id, shop_id, role")
    .or(`user_id.eq.${actorUserId},id.eq.${actorUserId}`)
    .maybeSingle();

  if (error) {
    return { ok: false, status: 500, error: error.message };
  }

  if (!profile || !profile.shop_id) {
    return { ok: false, status: 403, error: "Actor must belong to a shop profile" };
  }

  return { ok: true, profile: { ...profile, shop_id: profile.shop_id } };
}

export async function authorizeConversationActor({
  supabase,
  conversationId,
  actorUserId,
}: {
  supabase: SupabaseClient<Database>;
  conversationId: string;
  actorUserId: string;
}): Promise<AccessResult> {
  const { data: conversation, error: conversationError } = await supabase
    .from("conversations")
    .select("id, created_by, context_type, context_id, is_group, title, created_at")
    .eq("id", conversationId)
    .maybeSingle();

  if (conversationError) {
    return { ok: false, status: 500, error: conversationError.message };
  }

  if (!conversation) {
    return { ok: false, status: 404, error: "Conversation not found" };
  }

  const { data: participantRows, error: participantsError } = await supabase
    .from("conversation_participants")
    .select("user_id")
    .eq("conversation_id", conversationId);

  if (participantsError) {
    return { ok: false, status: 500, error: participantsError.message };
  }

  const participantUserIds = (participantRows ?? [])
    .map((row) => row.user_id)
    .filter((userId): userId is string => Boolean(userId));

  const isAllowed =
    conversation.created_by === actorUserId ||
    participantUserIds.includes(actorUserId);

  if (!isAllowed) {
    return {
      ok: false,
      status: 403,
      error: "You are not part of this conversation",
    };
  }

  return { ok: true, conversation, participantUserIds };
}

export async function authorizeConversationLifecycleAction({
  supabase,
  conversationId,
  actorUserId,
  action,
}: {
  supabase: SupabaseClient<Database>;
  conversationId: string;
  actorUserId: string;
  action: LifecycleAction;
}): Promise<
  | {
      ok: true;
      conversation: ConversationRow;
      participantUserIds: string[];
      actorShopId: string;
    }
  | {
      ok: false;
      status: 403 | 404 | 500;
      error: string;
    }
> {
  const actorProfileResult = await getActorProfile({ supabase, actorUserId });
  if (!actorProfileResult.ok) return actorProfileResult;

  const access = await authorizeConversationActor({
    supabase,
    conversationId,
    actorUserId,
  });

  if (!access.ok) {
    return access;
  }

  const participantUserIds = Array.from(new Set(access.participantUserIds));

  let participantProfiles: Array<{ id: string | null; user_id: string | null; shop_id: string | null }> = [];
  if (participantUserIds.length > 0) {
    const { data: profileRows, error: participantProfilesError } = await supabase
      .from("profiles")
      .select("id, user_id, shop_id")
      .or(
        participantUserIds
          .map((id) => `user_id.eq.${id},id.eq.${id}`)
          .join(","),
      );

    if (participantProfilesError) {
      return { ok: false, status: 500, error: participantProfilesError.message };
    }

    participantProfiles = profileRows ?? [];
  }

  const actorShopId = actorProfileResult.profile.shop_id;

  const hasCrossShopParticipant = participantProfiles.some(
    (profile) => profile.shop_id && profile.shop_id !== actorShopId,
  );

  if (hasCrossShopParticipant) {
    return {
      ok: false,
      status: 403,
      error: "Conversation participants must remain in the actor shop",
    };
  }

  if (action === "delete" || action === "manage_participants") {
    if (access.conversation.created_by !== actorUserId) {
      return {
        ok: false,
        status: 403,
        error:
          action === "delete"
            ? "Only the conversation creator can delete this conversation"
            : "Only the conversation creator can manage participants",
      };
    }
  }

  return {
    ok: true,
    conversation: access.conversation,
    participantUserIds,
    actorShopId,
  };
}

export async function authorizeConversationCreate({
  supabase,
  actorUserId,
  participantUserIds,
}: {
  supabase: SupabaseClient<Database>;
  actorUserId: string;
  participantUserIds: string[];
}): Promise<
  | {
      ok: true;
      actorShopId: string;
      recipientUserIds: string[];
    }
  | {
      ok: false;
      status: 400 | 403 | 500;
      error: string;
    }
> {
  const actorProfileResult = await getActorProfile({ supabase, actorUserId });
  if (!actorProfileResult.ok) return actorProfileResult;

  const actorShopId = actorProfileResult.profile.shop_id;

  const uniqueRecipientIds = Array.from(new Set(participantUserIds)).filter(
    (id) => Boolean(id) && id !== actorUserId,
  );

  if (uniqueRecipientIds.length === 0) {
    return { ok: false, status: 400, error: "participant_ids required" };
  }

  const { data: recipients, error: recipientsError } = await supabase
    .from("profiles")
    .select("id, user_id")
    .eq("shop_id", actorShopId)
    .or(uniqueRecipientIds.map((id) => `user_id.eq.${id},id.eq.${id}`).join(","));

  if (recipientsError) {
    return { ok: false, status: 500, error: recipientsError.message };
  }

  const recipientUserIds = Array.from(
    new Set((recipients ?? []).map((recipient) => recipient.user_id ?? recipient.id).filter(Boolean) as string[]),
  ).filter((id) => id !== actorUserId);

  if (recipientUserIds.length === 0) {
    return { ok: false, status: 400, error: "No valid in-shop recipients found" };
  }

  return {
    ok: true,
    actorShopId,
    recipientUserIds,
  };
}

export async function getActorConversationIds({
  supabase,
  actorUserId,
}: {
  supabase: SupabaseClient<Database>;
  actorUserId: string;
}): Promise<{ ids: string[]; error: string | null }> {
  const { data: createdConversations, error: createdError } = await supabase
    .from("conversations")
    .select("id")
    .eq("created_by", actorUserId);

  if (createdError) {
    return { ids: [], error: createdError.message };
  }

  const { data: participantRows, error: participantError } = await supabase
    .from("conversation_participants")
    .select("conversation_id")
    .eq("user_id", actorUserId);

  if (participantError) {
    return { ids: [], error: participantError.message };
  }

  const ids = Array.from(
    new Set([
      ...(createdConversations ?? []).map((row) => row.id),
      ...(participantRows ?? []).map((row) => row.conversation_id),
    ]),
  ).filter((id): id is string => Boolean(id));

  return { ids, error: null };
}

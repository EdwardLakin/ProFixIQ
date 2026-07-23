import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";

type ConversationRow = Database["public"]["Tables"]["conversations"]["Row"];
type MessagingChannel = "internal" | "customer";
type ParticipantKind = "staff" | "customer";
const CUSTOMER_MESSAGING_ROLES = new Set(["owner", "admin", "manager", "advisor"]);

export type MessagingActor =
  | {
      kind: "staff";
      userId: string;
      profileId: string;
      shopId: string;
      role: string | null;
      customerId: null;
    }
  | {
      kind: "customer";
      userId: string;
      customerId: string;
      shopId: string;
      role: null;
      profileId: null;
    };

type AccessFailure = {
  ok: false;
  status: 400 | 403 | 404 | 500;
  error: string;
};

type AccessResult =
  | {
      ok: true;
      actor: MessagingActor;
      conversation: ConversationRow;
      participantUserIds: string[];
    }
  | AccessFailure;

type LifecycleAction = "delete" | "manage_participants" | "read_participants";

export async function resolveMessagingActor({
  supabase,
  actorUserId,
  preferredKind,
}: {
  supabase: SupabaseClient<Database>;
  actorUserId: string;
  preferredKind?: MessagingActor["kind"];
}): Promise<{ ok: true; actor: MessagingActor } | AccessFailure> {
  const [
    { data: profile, error: profileError },
    { data: customer, error: customerError },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, user_id, shop_id, role")
      .or(`user_id.eq.${actorUserId},id.eq.${actorUserId}`)
      .maybeSingle(),
    supabase
      .from("customers")
      .select("id, user_id, shop_id")
      .eq("user_id", actorUserId)
      .maybeSingle(),
  ]);

  const actorError = profileError ?? customerError;
  if (actorError) {
    return { ok: false, status: 500, error: actorError.message };
  }

  const profileRole = (profile?.role ?? "").trim().toLowerCase();
  if (
    customer?.shop_id &&
    (preferredKind === "customer" || profileRole === "customer")
  ) {
    return {
      ok: true,
      actor: {
        kind: "customer",
        userId: actorUserId,
        customerId: customer.id,
        shopId: customer.shop_id,
        role: null,
        profileId: null,
      },
    };
  }

  if (preferredKind === "customer") {
    return {
      ok: false,
      status: 403,
      error: "Messaging requires a customer record linked to this portal account",
    };
  }

  if (profile?.shop_id) {
    return {
      ok: true,
      actor: {
        kind: "staff",
        userId: actorUserId,
        profileId: profile.id,
        shopId: profile.shop_id,
        role: profile.role,
        customerId: null,
      },
    };
  }

  if (customer?.shop_id) {
    return {
      ok: true,
      actor: {
        kind: "customer",
        userId: actorUserId,
        customerId: customer.id,
        shopId: customer.shop_id,
        role: null,
        profileId: null,
      },
    };
  }

  return {
    ok: false,
    status: 403,
    error: "Messaging access requires a shop staff or invited customer account",
  };
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
  const actorResult = await resolveMessagingActor({ supabase, actorUserId });
  if (!actorResult.ok) return actorResult;

  const { data: conversation, error: conversationError } = await supabase
    .from("conversations")
    .select("*")
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

  const participantUserIds = Array.from(
    new Set(
      (participantRows ?? [])
        .map((row) => row.user_id)
        .filter((userId): userId is string => Boolean(userId)),
    ),
  );

  const isMember =
    conversation.created_by === actorUserId ||
    participantUserIds.includes(actorUserId);

  if (!isMember) {
    return { ok: false, status: 403, error: "You are not part of this conversation" };
  }

  if (conversation.shop_id && conversation.shop_id !== actorResult.actor.shopId) {
    return { ok: false, status: 403, error: "Conversation belongs to another shop" };
  }

  if (actorResult.actor.kind === "customer") {
    if (
      conversation.channel !== "customer" ||
      conversation.customer_id !== actorResult.actor.customerId
    ) {
      return { ok: false, status: 403, error: "Conversation is not available in the customer portal" };
    }
  }

  return {
    ok: true,
    actor: actorResult.actor,
    conversation,
    participantUserIds,
  };
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
      actor: MessagingActor;
      conversation: ConversationRow;
      participantUserIds: string[];
      actorShopId: string;
    }
  | AccessFailure
> {
  const access = await authorizeConversationActor({
    supabase,
    conversationId,
    actorUserId,
  });
  if (!access.ok) return access;

  if (action === "delete" || action === "manage_participants") {
    if (access.actor.kind !== "staff") {
      return { ok: false, status: 403, error: "Only shop staff can manage conversations" };
    }
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
    actor: access.actor,
    conversation: access.conversation,
    participantUserIds: access.participantUserIds,
    actorShopId: access.actor.shopId,
  };
}

export async function authorizeConversationCreate({
  supabase,
  actorUserId,
  participantUserIds,
  channel = "internal",
  customerId = null,
  preferredActorKind,
}: {
  supabase: SupabaseClient<Database>;
  actorUserId: string;
  participantUserIds: string[];
  channel?: MessagingChannel;
  customerId?: string | null;
  preferredActorKind?: MessagingActor["kind"];
}): Promise<
  | {
      ok: true;
      actor: MessagingActor;
      actorShopId: string;
      channel: MessagingChannel;
      customerId: string | null;
      recipientUserIds: string[];
      participantKinds: Record<string, ParticipantKind>;
    }
  | AccessFailure
> {
  const actorResult = await resolveMessagingActor({
    supabase,
    actorUserId,
    preferredKind: preferredActorKind,
  });
  if (!actorResult.ok) return actorResult;

  const actor = actorResult.actor;
  if (actor.kind === "customer" && channel !== "customer") {
    return { ok: false, status: 403, error: "Customers can only start customer conversations" };
  }

  const uniqueStaffIds = Array.from(new Set(participantUserIds))
    .map((id) => id.trim())
    .filter((id) => id && id !== actorUserId);

  let staffUserIds: string[] = [];
  if (uniqueStaffIds.length > 0) {
    const { data: staff, error: staffError } = await supabase
      .from("profiles")
      .select("id, user_id")
      .eq("shop_id", actor.shopId)
      .or(uniqueStaffIds.map((id) => `user_id.eq.${id},id.eq.${id}`).join(","));

    if (staffError) {
      return { ok: false, status: 500, error: staffError.message };
    }

    staffUserIds = Array.from(
      new Set(
        (staff ?? [])
          .map((row) => row.user_id ?? row.id)
          .filter((id): id is string => Boolean(id) && id !== actorUserId),
      ),
    );
  }

  if (channel === "internal") {
    if (actor.kind !== "staff") {
      return { ok: false, status: 403, error: "Internal conversations are staff only" };
    }
    if (staffUserIds.length === 0) {
      return { ok: false, status: 400, error: "Select at least one same-shop staff recipient" };
    }
    return {
      ok: true,
      actor,
      actorShopId: actor.shopId,
      channel,
      customerId: null,
      recipientUserIds: staffUserIds,
      participantKinds: Object.fromEntries(staffUserIds.map((id) => [id, "staff"])),
    };
  }

  if (
    actor.kind === "staff" &&
    !CUSTOMER_MESSAGING_ROLES.has((actor.role ?? "").toLowerCase())
  ) {
    return {
      ok: false,
      status: 403,
      error: "Your role cannot start customer conversations",
    };
  }

  const resolvedCustomerId = actor.kind === "customer" ? actor.customerId : customerId;
  if (!resolvedCustomerId) {
    return { ok: false, status: 400, error: "Select a customer for this conversation" };
  }

  const { data: customer, error: customerError } = await supabase
    .from("customers")
    .select("id, user_id, shop_id")
    .eq("id", resolvedCustomerId)
    .eq("shop_id", actor.shopId)
    .maybeSingle();

  if (customerError) {
    return { ok: false, status: 500, error: customerError.message };
  }
  if (!customer?.user_id) {
    return {
      ok: false,
      status: 400,
      error: customer ? "Customer must activate their portal before in-app messaging" : "Customer not found in this shop",
    };
  }
  if (actor.kind === "customer" && customer.user_id !== actorUserId) {
    return { ok: false, status: 403, error: "Customers cannot message on behalf of another customer" };
  }

  if (actor.kind === "customer" && staffUserIds.length === 0) {
    const { data: serviceTeam, error: serviceTeamError } = await supabase
      .from("profiles")
      .select("id, user_id")
      .eq("shop_id", actor.shopId)
      .in("role", ["advisor", "manager", "owner", "admin"])
      .limit(50);

    if (serviceTeamError) {
      return { ok: false, status: 500, error: serviceTeamError.message };
    }
    staffUserIds = Array.from(
      new Set(
        (serviceTeam ?? [])
          .map((row) => row.user_id ?? row.id)
          .filter((id): id is string => Boolean(id) && id !== actorUserId),
      ),
    );
  }

  if (actor.kind === "customer" && staffUserIds.length === 0) {
    return { ok: false, status: 400, error: "No customer-facing shop staff are available" };
  }

  const recipientUserIds = Array.from(
    new Set([
      ...staffUserIds,
      ...(customer.user_id === actorUserId ? [] : [customer.user_id]),
    ]),
  );
  const participantKinds: Record<string, ParticipantKind> = Object.fromEntries(
    staffUserIds.map((id) => [id, "staff"]),
  );
  if (customer.user_id !== actorUserId) participantKinds[customer.user_id] = "customer";

  return {
    ok: true,
    actor,
    actorShopId: actor.shopId,
    channel,
    customerId: resolvedCustomerId,
    recipientUserIds,
    participantKinds,
  };
}

export async function getActorConversationIds({
  supabase,
  actorUserId,
}: {
  supabase: SupabaseClient<Database>;
  actorUserId: string;
}): Promise<{ ids: string[]; error: string | null }> {
  const { data: participantRows, error } = await supabase
    .from("conversation_participants")
    .select("conversation_id")
    .eq("user_id", actorUserId);

  if (error) return { ids: [], error: error.message };

  return {
    ids: Array.from(
      new Set(
        (participantRows ?? [])
          .map((row) => row.conversation_id)
          .filter((id): id is string => Boolean(id)),
      ),
    ),
    error: null,
  };
}

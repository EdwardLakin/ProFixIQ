import { NextResponse } from "next/server";
import { createHash, randomUUID } from "crypto";
import {
  createAdminSupabase,
  createServerSupabaseRoute,
} from "@/features/shared/lib/supabase/server";
import {
  authorizeConversationCreate,
  isCustomerMessagingRole,
  participantSeedForActor,
  type MessagingParticipantSeed,
} from "@/features/ai/lib/chat/authorization";
import { authorizeConversationContext } from "@/features/chat/server/conversationContext";
import type { Database } from "@/features/shared/types/types/supabase";

export const dynamic = "force-dynamic";

type CreateMessagingConversationArgs =
  Database["public"]["Functions"]["create_actor_messaging_conversation"]["Args"];
type NullableConversationArgument =
  | "_booking_id"
  | "_context_id"
  | "_context_type"
  | "_customer_id"
  | "_title"
  | "_vehicle_id"
  | "_work_order_id";
type CreateMessagingConversationInput = Omit<
  CreateMessagingConversationArgs,
  NullableConversationArgument
> &
  Record<NullableConversationArgument, string | null>;

function uniqueParticipants(
  participants: MessagingParticipantSeed[],
): MessagingParticipantSeed[] {
  return participants.filter(
    (participant, index, rows) =>
      rows.findIndex(
        (candidate) =>
          candidate.kind === participant.kind &&
          candidate.userId === participant.userId &&
          candidate.profileId === participant.profileId &&
          candidate.customerId === participant.customerId,
      ) === index,
  );
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

function deterministicUuidFromRequestId(
  requestId: string,
  actorUserId: string,
): string {
  const hex = createHash("sha256")
    .update(`chat:start-conversation:${actorUserId}:${requestId}`)
    .digest("hex");
  const variant = ((parseInt(hex[16] ?? "0", 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export async function POST(req: Request): Promise<NextResponse> {
  const userClient = createServerSupabaseRoute();
  const {
    data: { user },
  } = await userClient.auth.getUser();

  if (!user)
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as {
    participant_ids?: string[];
    channel?: "internal" | "customer";
    customer_id?: string | null;
    context_type?: string | null;
    context_id?: string | null;
    title?: string | null;
    is_broadcast?: boolean;
    request_id?: string;
    actor_kind?: "customer";
  } | null;

  const admin = createAdminSupabase();
  const requestedParticipantIds = body?.participant_ids ?? [];

  const createAccess = await authorizeConversationCreate({
    supabase: admin,
    actorUserId: user.id,
    participantUserIds: requestedParticipantIds,
    channel: body?.channel ?? "internal",
    customerId: body?.customer_id ?? null,
    preferredActorKind:
      body?.actor_kind === "customer" ? "customer" : undefined,
  });

  if (!createAccess.ok) {
    console.warn("[chat/start-conversation] create access denied", {
      status: createAccess.status,
      error: createAccess.error,
      channel: body?.channel ?? "internal",
      actorKind: body?.actor_kind ?? null,
      participantCount: requestedParticipantIds.length,
    });
    return NextResponse.json(
      { error: createAccess.error },
      { status: createAccess.status },
    );
  }

  if (
    body?.is_broadcast &&
    (createAccess.actor.kind !== "staff" ||
      !["owner", "manager", "admin"].includes(createAccess.actor.role ?? ""))
  ) {
    return NextResponse.json(
      { error: "Only owner/manager/admin can broadcast" },
      { status: 403 },
    );
  }

  const context = await authorizeConversationContext({
    supabase: admin,
    shopId: createAccess.actorShopId,
    customerId: createAccess.customerId,
    contextType: body?.context_type,
    contextId: body?.context_id,
  });

  if (!context.ok) {
    console.warn("[chat/start-conversation] context denied", {
      status: context.status,
      error: context.error,
      contextType: body?.context_type ?? null,
      hasContextId: Boolean(body?.context_id),
    });
    return NextResponse.json(
      { error: context.error },
      { status: context.status },
    );
  }

  let recipientParticipants = createAccess.recipientParticipants;

  const requestedWorkOrderId =
    body?.context_type === "work_order" && body?.context_id
      ? body.context_id
      : null;
  const routedWorkOrderId =
    context.anchors.work_order_id ?? requestedWorkOrderId;

  if (
    createAccess.actor.kind === "customer" &&
    createAccess.customerId &&
    routedWorkOrderId &&
    requestedParticipantIds.length === 0
  ) {
    const { data: workOrder, error: workOrderError } = await admin
      .from("work_orders")
      .select("advisor_id")
      .eq("id", routedWorkOrderId)
      .eq("shop_id", createAccess.actorShopId)
      .eq("customer_id", createAccess.customerId)
      .maybeSingle();

    if (workOrderError) {
      return NextResponse.json(
        { error: workOrderError.message },
        { status: 500 },
      );
    }

    const { data: assignedAdvisor, error: advisorError } = workOrder?.advisor_id
      ? await admin
          .from("profiles")
          .select("id,user_id,role")
          .eq("id", workOrder.advisor_id)
          .eq("shop_id", createAccess.actorShopId)
          .maybeSingle()
      : { data: null, error: null };

    const { data: coverage, error: coverageError } = await admin
      .from("profiles")
      .select("id,user_id,role")
      .eq("shop_id", createAccess.actorShopId)
      .in("role", ["owner", "admin", "manager"])
      .limit(100);

    const recipientError = advisorError ?? coverageError;
    if (recipientError) {
      return NextResponse.json(
        { error: recipientError.message },
        { status: 500 },
      );
    }

    const advisorUserId =
      assignedAdvisor && isCustomerMessagingRole(assignedAdvisor.role)
        ? (assignedAdvisor.user_id ?? assignedAdvisor.id)
        : null;
    const routedProfiles = [
      ...(assignedAdvisor && advisorUserId ? [assignedAdvisor] : []),
      ...(coverage ?? []),
    ];

    if (routedProfiles.length > 0) {
      recipientParticipants = uniqueParticipants(
        routedProfiles
          .filter((profile) => isCustomerMessagingRole(profile.role))
          .map((profile) => ({
            userId: profile.user_id ?? profile.id,
            kind: "staff" as const,
            profileId: profile.id,
            customerId: null,
            role: profile.role,
          })),
      );
    }
  }

  const requestedIdRaw = body?.request_id?.trim() ?? "";
  const requestedId = requestedIdRaw
    ? isUuid(requestedIdRaw)
      ? requestedIdRaw
      : deterministicUuidFromRequestId(requestedIdRaw, user.id)
    : undefined;
  if (requestedIdRaw && requestedId !== requestedIdRaw) {
    console.warn("[chat/start-conversation] normalized invalid request_id", {
      actorKind: createAccess.actor.kind,
      channel: createAccess.channel,
      requestIdLength: requestedIdRaw.length,
    });
  }

  const conversationId = requestedId ?? randomUUID();
  if (requestedId) {
    const { data: existing, error: existingError } = await admin
      .from("conversations")
      .select("id, created_by")
      .eq("id", requestedId)
      .maybeSingle();
    if (existingError) {
      return NextResponse.json(
        { error: existingError.message },
        { status: 500 },
      );
    }
    if (existing) {
      if (existing.created_by !== user.id) {
        return NextResponse.json(
          { error: "request_id is already in use" },
          { status: 409 },
        );
      }
      return NextResponse.json(
        { id: existing.id, reused: true },
        { status: 200 },
      );
    }
  }

  const allParticipants = uniqueParticipants([
    participantSeedForActor(createAccess.actor),
    ...recipientParticipants,
  ]);

  const createConversationInput: CreateMessagingConversationInput = {
    _conversation_id: conversationId,
    _created_by: user.id,
    _shop_id: createAccess.actorShopId,
    _channel: createAccess.channel,
    _customer_id: context.anchors.customer_id,
    _work_order_id: routedWorkOrderId,
    _vehicle_id: context.anchors.vehicle_id,
    _booking_id: context.anchors.booking_id,
    _context_type: context.anchors.context_type,
    _context_id: context.anchors.context_id,
    _title: body?.title?.trim().slice(0, 160) || null,
    _participants: allParticipants.map((participant) => ({
      user_id: participant.userId,
      participant_kind: participant.kind,
      profile_id: participant.profileId,
      customer_id: participant.customerId,
      role: participant.role,
    })),
  };

  // PostgreSQL accepts nullable context anchors; the local Supabase generator
  // does not preserve function-argument nullability in its TypeScript output.
  const { data: createdId, error: createError } = await admin.rpc(
    "create_actor_messaging_conversation",
    createConversationInput as CreateMessagingConversationArgs,
  );

  if (createError) {
    console.error("[chat/start-conversation] create rpc failed", {
      code: createError.code ?? null,
      message: createError.message ?? null,
      details: createError.details ?? null,
      hint: createError.hint ?? null,
    });
    return NextResponse.json({ error: createError.message }, { status: 500 });
  }

  return NextResponse.json(
    { id: createdId ?? conversationId },
    { status: 201 },
  );
}

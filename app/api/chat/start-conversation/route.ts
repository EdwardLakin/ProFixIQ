import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import {
  createAdminSupabase,
  createServerSupabaseRoute,
} from "@/features/shared/lib/supabase/server";
import {
  authorizeConversationCreate,
  isCustomerMessagingRole,
} from "@/features/ai/lib/chat/authorization";
import { authorizeConversationContext } from "@/features/chat/server/conversationContext";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID_RE.test(value);
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

  let recipientUserIds = createAccess.recipientUserIds;
  let participantKindByUserId = createAccess.participantKinds;

  if (
    createAccess.actor.kind === "customer" &&
    createAccess.customerId &&
    context.anchors.work_order_id &&
    requestedParticipantIds.length === 0
  ) {
    const { data: workOrder, error: workOrderError } = await admin
      .from("work_orders")
      .select("advisor_id")
      .eq("id", context.anchors.work_order_id)
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
      .limit(100);

    const recipientError = advisorError ?? coverageError;
    if (recipientError) {
      return NextResponse.json(
        { error: recipientError.message },
        { status: 500 },
      );
    }

    const advisorUserId = assignedAdvisor && isCustomerMessagingRole(assignedAdvisor.role)
      ? assignedAdvisor.user_id ?? assignedAdvisor.id
      : null;
    const coverageUserIds = (coverage ?? [])
      .filter((profile) => isCustomerMessagingRole(profile.role))
      .map((profile) => profile.user_id ?? profile.id)
      .filter((id): id is string => Boolean(id) && id !== user.id);

    if (advisorUserId || coverageUserIds.length > 0) {
      recipientUserIds = Array.from(
        new Set([...(advisorUserId ? [advisorUserId] : []), ...coverageUserIds]),
      ).filter((id) => id !== user.id);
      participantKindByUserId = Object.fromEntries(
        recipientUserIds.map((id) => [id, "staff" as const]),
      );
    }
  }

  const requestedIdRaw = body?.request_id?.trim() ?? "";
  const requestedId = requestedIdRaw && isUuid(requestedIdRaw) ? requestedIdRaw : undefined;
  if (requestedIdRaw && !requestedId) {
    console.warn("[chat/start-conversation] ignored invalid request_id", {
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

  const allParticipantIds = Array.from(new Set([user.id, ...recipientUserIds]));
  const participantKindValues = allParticipantIds.map((id) =>
    id === user.id
      ? createAccess.actor.kind
      : (participantKindByUserId[id] ?? "staff"),
  );

  const { data: createdId, error: createError } = await admin.rpc(
    "create_messaging_conversation",
    {
      _conversation_id: conversationId,
      _created_by: user.id,
      _shop_id: createAccess.actorShopId,
      _channel: createAccess.channel,
      _customer_id: context.anchors.customer_id,
      _work_order_id: context.anchors.work_order_id,
      _vehicle_id: context.anchors.vehicle_id,
      _booking_id: context.anchors.booking_id,
      _context_type: context.anchors.context_type,
      _context_id: context.anchors.context_id,
      _title: body?.title?.trim().slice(0, 160) || null,
      _participant_user_ids: allParticipantIds,
      _participant_kinds: participantKindValues,
    },
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

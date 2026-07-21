import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import {
  createAdminSupabase,
  createServerSupabaseRoute,
} from "@/features/shared/lib/supabase/server";
import { authorizeConversationCreate } from "@/features/ai/lib/chat/authorization";
import { authorizeConversationContext } from "@/features/chat/server/conversationContext";

export const dynamic = "force-dynamic";

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
  } | null;

  const admin = createAdminSupabase();

  const createAccess = await authorizeConversationCreate({
    supabase: admin,
    actorUserId: user.id,
    participantUserIds: body?.participant_ids ?? [],
    channel: body?.channel ?? "internal",
    customerId: body?.customer_id ?? null,
  });

  if (!createAccess.ok) {
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
    context.anchors.work_order_id
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

    if (workOrder?.advisor_id) {
      const [
        { data: assignedAdvisor, error: advisorError },
        { data: coverage, error: coverageError },
      ] = await Promise.all([
        admin
          .from("profiles")
          .select("id,user_id")
          .eq("id", workOrder.advisor_id)
          .eq("shop_id", createAccess.actorShopId)
          .maybeSingle(),
        admin
          .from("profiles")
          .select("id,user_id")
          .eq("shop_id", createAccess.actorShopId)
          .in("role", ["owner", "admin", "manager"])
          .limit(25),
      ]);

      const recipientError = advisorError ?? coverageError;
      if (recipientError) {
        return NextResponse.json(
          { error: recipientError.message },
          { status: 500 },
        );
      }

      const advisorUserId =
        assignedAdvisor?.user_id ?? assignedAdvisor?.id ?? null;
      if (advisorUserId) {
        recipientUserIds = Array.from(
          new Set([
            advisorUserId,
            ...(coverage ?? []).map((profile) => profile.user_id ?? profile.id),
          ]),
        ).filter((id) => id !== user.id);
        participantKindByUserId = Object.fromEntries(
          recipientUserIds.map((id) => [id, "staff" as const]),
        );
      }
    }
  }

  const requestedId = body?.request_id?.trim();
  if (
    requestedId &&
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      requestedId,
    )
  ) {
    return NextResponse.json(
      { error: "request_id must be a UUID" },
      { status: 400 },
    );
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
    return NextResponse.json({ error: createError.message }, { status: 500 });
  }

  return NextResponse.json(
    { id: createdId ?? conversationId },
    { status: 201 },
  );
}

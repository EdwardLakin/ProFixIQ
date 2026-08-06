import { NextResponse } from "next/server";
import {
  createServerSupabaseRoute,
  createAdminSupabase,
} from "@/features/shared/lib/supabase/server";
import type { Database } from "@shared/types/types/supabase";
import {
  getActorConversationIds,
  resolveMessagingActor,
} from "@/features/ai/lib/chat/authorization";

export const dynamic = "force-dynamic";

type DB = Database;
type ConversationRow = DB["public"]["Tables"]["conversations"]["Row"];
type MessageRow = DB["public"]["Tables"]["messages"]["Row"];
type ParticipantRow =
  DB["public"]["Tables"]["conversation_participants"]["Row"];

type ParticipantInfo = {
  id: string;
  user_id: string;
  kind: "staff" | "customer";
  full_name: string | null;
  avatar_url: string | null;
  role: string | null;
};

export type ConversationContextPayload = {
  type: string;
  label: string;
  secondary: string | null;
  href: string | null;
};

type ConversationPayload = {
  conversation: ConversationRow;
  latest_message: MessageRow | null;
  participants: ParticipantInfo[];
  unread_count: number;
  context: ConversationContextPayload | null;
  actor_participant_id: string;
};

function customerName(row: {
  name: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
}): string {
  return (
    row.name?.trim() ||
    [row.first_name, row.last_name].filter(Boolean).join(" ").trim() ||
    row.email?.trim() ||
    "Customer"
  );
}

export async function GET(req: Request): Promise<NextResponse> {
  const userClient = createServerSupabaseRoute();
  const {
    data: { user },
  } = await userClient.auth.getUser();

  if (!user)
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const admin = createAdminSupabase();
  const preferredKind =
    new URL(req.url).searchParams.get("actor") === "customer"
      ? "customer"
      : undefined;
  const actorResult = await resolveMessagingActor({
    supabase: admin,
    actorUserId: user.id,
    preferredKind,
  });
  if (!actorResult.ok) {
    return NextResponse.json(
      { error: actorResult.error },
      { status: actorResult.status },
    );
  }

  const { ids: conversationIds, error: accessError } =
    await getActorConversationIds({
      supabase: admin,
      actorUserId: user.id,
      participantKind: actorResult.actor.kind,
    });
  if (accessError)
    return NextResponse.json({ error: accessError }, { status: 500 });
  if (conversationIds.length === 0)
    return NextResponse.json<ConversationPayload[]>([]);

  let conversationQuery = admin
    .from("conversations")
    .select("*")
    .in("id", conversationIds)
    .is("archived_at", null);

  if (actorResult.actor.kind === "customer") {
    conversationQuery = conversationQuery
      .eq("shop_id", actorResult.actor.shopId)
      .eq("channel", "customer")
      .eq("customer_id", actorResult.actor.customerId);
  } else {
    conversationQuery = conversationQuery.or(
      `shop_id.eq.${actorResult.actor.shopId},shop_id.is.null`,
    );
  }

  const { data: conversations, error: conversationError } =
    await conversationQuery;
  if (conversationError) {
    return NextResponse.json(
      { error: conversationError.message },
      { status: 500 },
    );
  }

  const safeConversations = conversations ?? [];
  const safeConversationIds = safeConversations.map((row) => row.id);
  if (safeConversationIds.length === 0)
    return NextResponse.json<ConversationPayload[]>([]);

  const [
    { data: messages, error: messageError },
    { data: participants, error: participantError },
  ] = await Promise.all([
    admin
      .from("messages")
      .select("*")
      .in("conversation_id", safeConversationIds)
      .order("sent_at", { ascending: false })
      .order("created_at", { ascending: false }),
    admin
      .from("conversation_participants")
      .select(
        "id, conversation_id, user_id, participant_kind, role, profile_id, customer_id",
      )
      .in("conversation_id", safeConversationIds),
  ]);

  if (messageError)
    return NextResponse.json({ error: messageError.message }, { status: 500 });
  if (participantError)
    return NextResponse.json(
      { error: participantError.message },
      { status: 500 },
    );

  const participantRows = (participants ?? []) as ParticipantRow[];
  const profileIds = Array.from(
    new Set(
      participantRows
        .map((row) => row.profile_id)
        .filter((id): id is string => Boolean(id)),
    ),
  );
  const participantCustomerIds = Array.from(
    new Set(
      participantRows
        .map((row) => row.customer_id)
        .filter((id): id is string => Boolean(id)),
    ),
  );

  const [{ data: profiles }, { data: customers }] = await Promise.all([
    profileIds.length
      ? admin
          .from("profiles")
          .select("id, user_id, full_name, email, avatar_url, role")
          .in("id", profileIds)
      : Promise.resolve({ data: [], error: null }),
    participantCustomerIds.length
      ? admin
          .from("customers")
          .select("id, user_id, name, first_name, last_name, email")
          .in("id", participantCustomerIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const identityByActorKey = new Map<
    string,
    {
      full_name: string | null;
      avatar_url: string | null;
      role: string | null;
      kind: "staff" | "customer";
    }
  >();
  (profiles ?? []).forEach((profile) => {
    const identity = {
      full_name: profile.full_name ?? profile.email,
      avatar_url: profile.avatar_url ?? null,
      role: profile.role,
      kind: "staff" as const,
    };
    identityByActorKey.set(`staff:${profile.id}`, identity);
  });
  (customers ?? []).forEach((customer) => {
    identityByActorKey.set(`customer:${customer.id}`, {
      full_name: customerName(customer),
      avatar_url: null,
      role: "customer",
      kind: "customer",
    });
  });

  const participantsByConversation = new Map<string, ParticipantInfo[]>();
  participantRows.forEach((row) => {
    const identity = identityByActorKey.get(
      row.participant_kind === "customer"
        ? `customer:${row.customer_id ?? ""}`
        : `staff:${row.profile_id ?? ""}`,
    );
    const list = participantsByConversation.get(row.conversation_id) ?? [];
    list.push({
      id: row.id,
      user_id: row.user_id,
      kind:
        row.participant_kind === "customer"
          ? "customer"
          : (identity?.kind ?? "staff"),
      full_name: identity?.full_name ?? null,
      avatar_url: identity?.avatar_url ?? null,
      role: identity?.role ?? row.role,
    });
    participantsByConversation.set(row.conversation_id, list);
  });

  const latestByConversation = new Map<string, MessageRow>();
  (messages ?? []).forEach((message) => {
    if (
      message.conversation_id &&
      !latestByConversation.has(message.conversation_id)
    ) {
      latestByConversation.set(message.conversation_id, message);
    }
  });
  const actorParticipantIds = participantRows
    .filter(
      (participant) =>
        participant.user_id === user.id &&
        participant.participant_kind === actorResult.actor.kind,
    )
    .map((participant) => participant.id);
  const { data: unreadDeliveries, error: deliveryError } =
    actorParticipantIds.length
      ? await admin
          .from("message_deliveries")
          .select("conversation_id")
          .in("recipient_participant_id", actorParticipantIds)
          .is("read_at", null)
          .in("conversation_id", safeConversationIds)
      : { data: [], error: null };
  if (deliveryError) {
    return NextResponse.json({ error: deliveryError.message }, { status: 500 });
  }
  const unreadByConversation = new Map<string, number>();
  (unreadDeliveries ?? []).forEach((delivery) => {
    unreadByConversation.set(
      delivery.conversation_id,
      (unreadByConversation.get(delivery.conversation_id) ?? 0) + 1,
    );
  });
  const actorParticipantByConversation = new Map(
    participantRows
      .filter(
        (participant) =>
          participant.user_id === user.id &&
          participant.participant_kind === actorResult.actor.kind,
      )
      .map((participant) => [participant.conversation_id, participant.id]),
  );

  const workOrderIds = Array.from(
    new Set(
      safeConversations
        .map((row) => row.work_order_id)
        .filter((id): id is string => Boolean(id)),
    ),
  );
  const vehicleIds = Array.from(
    new Set(
      safeConversations
        .map((row) => row.vehicle_id)
        .filter((id): id is string => Boolean(id)),
    ),
  );
  const bookingIds = Array.from(
    new Set(
      safeConversations
        .map((row) => row.booking_id)
        .filter((id): id is string => Boolean(id)),
    ),
  );
  const customerIds = Array.from(
    new Set(
      safeConversations
        .map((row) => row.customer_id)
        .filter((id): id is string => Boolean(id)),
    ),
  );

  const [
    { data: workOrders },
    { data: vehicles },
    { data: bookings },
    { data: contextCustomers },
  ] = await Promise.all([
    workOrderIds.length
      ? admin
          .from("work_orders")
          .select("id, custom_id, status, customer_name")
          .in("id", workOrderIds)
      : Promise.resolve({ data: [], error: null }),
    vehicleIds.length
      ? admin
          .from("vehicles")
          .select("id, year, make, model, unit_number")
          .in("id", vehicleIds)
      : Promise.resolve({ data: [], error: null }),
    bookingIds.length
      ? admin
          .from("bookings")
          .select("id, starts_at, status")
          .in("id", bookingIds)
      : Promise.resolve({ data: [], error: null }),
    customerIds.length
      ? admin
          .from("customers")
          .select("id, name, first_name, last_name, email")
          .in("id", customerIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const workOrderById = new Map((workOrders ?? []).map((row) => [row.id, row]));
  const vehicleById = new Map((vehicles ?? []).map((row) => [row.id, row]));
  const bookingById = new Map((bookings ?? []).map((row) => [row.id, row]));
  const customerById = new Map(
    (contextCustomers ?? []).map((row) => [row.id, row]),
  );
  const portal = actorResult.actor.kind === "customer";

  const contextFor = (
    conversation: ConversationRow,
  ): ConversationContextPayload | null => {
    if (conversation.work_order_id) {
      const workOrder = workOrderById.get(conversation.work_order_id);
      return {
        type: "work_order",
        label: `Work Order ${workOrder?.custom_id ?? `#${conversation.work_order_id.slice(0, 8)}`}`,
        secondary: workOrder?.status ?? workOrder?.customer_name ?? null,
        href: portal
          ? `/portal/work-orders/view/${conversation.work_order_id}`
          : `/work-orders/${conversation.work_order_id}`,
      };
    }
    if (conversation.booking_id) {
      const booking = bookingById.get(conversation.booking_id);
      const startsAt = booking?.starts_at
        ? new Date(booking.starts_at).toLocaleString()
        : null;
      return {
        type: "booking",
        label: "Appointment",
        secondary: startsAt ?? booking?.status ?? null,
        href: portal ? "/portal/customer-appointments" : "/dashboard/bookings",
      };
    }
    if (conversation.vehicle_id) {
      const vehicle = vehicleById.get(conversation.vehicle_id);
      const description = vehicle
        ? [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ")
        : "Vehicle";
      return {
        type: "vehicle",
        label: description || "Vehicle",
        secondary: vehicle?.unit_number ? `Unit ${vehicle.unit_number}` : null,
        href: portal ? "/portal/vehicles" : "/vehicles",
      };
    }
    if (conversation.customer_id) {
      const customer = customerById.get(conversation.customer_id);
      return {
        type: "customer",
        label: customer ? customerName(customer) : "Customer",
        secondary: null,
        href: portal ? null : `/customers/${conversation.customer_id}`,
      };
    }
    if (conversation.context_type && conversation.context_id) {
      return {
        type: conversation.context_type,
        label:
          conversation.title ?? conversation.context_type.replaceAll("_", " "),
        secondary: null,
        href:
          !portal && conversation.context_type === "inspection"
            ? `/inspections/${conversation.context_id}`
            : null,
      };
    }
    return null;
  };

  const payload: ConversationPayload[] = safeConversations.map(
    (conversation) => {
      const latest = latestByConversation.get(conversation.id) ?? null;
      const unreadCount = unreadByConversation.get(conversation.id) ?? 0;
      const actorParticipantId = actorParticipantByConversation.get(
        conversation.id,
      );
      if (!actorParticipantId) {
        throw new Error(
          `Missing actor participant for conversation ${conversation.id}`,
        );
      }

      return {
        conversation,
        latest_message: latest,
        participants: participantsByConversation.get(conversation.id) ?? [],
        unread_count: unreadCount,
        context: contextFor(conversation),
        actor_participant_id: actorParticipantId,
      };
    },
  );

  payload.sort((a, b) => {
    const aTime =
      a.conversation.last_message_at ??
      a.latest_message?.sent_at ??
      a.conversation.created_at ??
      "";
    const bTime =
      b.conversation.last_message_at ??
      b.latest_message?.sent_at ??
      b.conversation.created_at ??
      "";
    return bTime.localeCompare(aTime);
  });

  return NextResponse.json(payload);
}

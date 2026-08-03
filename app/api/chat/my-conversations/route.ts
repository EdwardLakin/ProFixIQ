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
type ParticipantRow = DB["public"]["Tables"]["conversation_participants"]["Row"];
type MessageReadRow = DB["public"]["Tables"]["message_reads"]["Row"];

type ParticipantInfo = {
  id: string;
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

  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

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
    return NextResponse.json({ error: actorResult.error }, { status: actorResult.status });
  }

  const { ids: conversationIds, error: accessError } = await getActorConversationIds({
    supabase: admin,
    actorUserId: user.id,
  });
  if (accessError) return NextResponse.json({ error: accessError }, { status: 500 });
  if (conversationIds.length === 0) return NextResponse.json<ConversationPayload[]>([]);

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

  const { data: conversations, error: conversationError } = await conversationQuery;
  if (conversationError) {
    return NextResponse.json({ error: conversationError.message }, { status: 500 });
  }

  const safeConversations = conversations ?? [];
  const safeConversationIds = safeConversations.map((row) => row.id);
  if (safeConversationIds.length === 0) return NextResponse.json<ConversationPayload[]>([]);

  const [{ data: messages, error: messageError }, { data: participants, error: participantError }] =
    await Promise.all([
      admin
        .from("messages")
        .select("*")
        .in("conversation_id", safeConversationIds)
        .order("sent_at", { ascending: false })
        .order("created_at", { ascending: false }),
      admin
        .from("conversation_participants")
        .select("conversation_id, user_id, participant_kind, role")
        .in("conversation_id", safeConversationIds),
    ]);

  if (messageError) return NextResponse.json({ error: messageError.message }, { status: 500 });
  if (participantError) return NextResponse.json({ error: participantError.message }, { status: 500 });

  const participantRows = (participants ?? []) as ParticipantRow[];
  const participantUserIds = Array.from(
    new Set(participantRows.map((row) => row.user_id).filter(Boolean)),
  );

  const [{ data: profiles }, { data: customers }, { data: readRows }] = await Promise.all([
    participantUserIds.length
      ? admin
          .from("profiles")
          .select("id, user_id, full_name, email, avatar_url, role")
          .or(participantUserIds.map((id) => `user_id.eq.${id},id.eq.${id}`).join(","))
      : Promise.resolve({ data: [], error: null }),
    participantUserIds.length
      ? admin
          .from("customers")
          .select("id, user_id, name, first_name, last_name, email")
          .in("user_id", participantUserIds)
      : Promise.resolve({ data: [], error: null }),
    admin
      .from("message_reads")
      .select("conversation_id, last_read_at")
      .eq("user_id", user.id)
      .in("conversation_id", safeConversationIds),
  ]);

  const identityByUserId = new Map<
    string,
    { full_name: string | null; avatar_url: string | null; role: string | null; kind: "staff" | "customer" }
  >();
  (profiles ?? []).forEach((profile) => {
    const identity = {
      full_name: profile.full_name ?? profile.email,
      avatar_url: profile.avatar_url ?? null,
      role: profile.role,
      kind: "staff" as const,
    };
    identityByUserId.set(profile.user_id ?? profile.id, identity);
    identityByUserId.set(profile.id, identity);
  });
  (customers ?? []).forEach((customer) => {
    if (!customer.user_id) return;
    identityByUserId.set(customer.user_id, {
      full_name: customerName(customer),
      avatar_url: null,
      role: "customer",
      kind: "customer",
    });
  });

  const participantsByConversation = new Map<string, ParticipantInfo[]>();
  participantRows.forEach((row) => {
    const identity = identityByUserId.get(row.user_id);
    const list = participantsByConversation.get(row.conversation_id) ?? [];
    list.push({
      id: row.user_id,
      kind: row.participant_kind === "customer" ? "customer" : identity?.kind ?? "staff",
      full_name: identity?.full_name ?? null,
      avatar_url: identity?.avatar_url ?? null,
      role: identity?.role ?? row.role,
    });
    participantsByConversation.set(row.conversation_id, list);
  });

  const latestByConversation = new Map<string, MessageRow>();
  (messages ?? []).forEach((message) => {
    if (message.conversation_id && !latestByConversation.has(message.conversation_id)) {
      latestByConversation.set(message.conversation_id, message);
    }
  });
  const readByConversation = new Map(
    ((readRows ?? []) as MessageReadRow[]).map((row) => [row.conversation_id, row.last_read_at]),
  );

  const workOrderIds = Array.from(new Set(safeConversations.map((row) => row.work_order_id).filter((id): id is string => Boolean(id))));
  const vehicleIds = Array.from(new Set(safeConversations.map((row) => row.vehicle_id).filter((id): id is string => Boolean(id))));
  const bookingIds = Array.from(new Set(safeConversations.map((row) => row.booking_id).filter((id): id is string => Boolean(id))));
  const customerIds = Array.from(new Set(safeConversations.map((row) => row.customer_id).filter((id): id is string => Boolean(id))));

  const [{ data: workOrders }, { data: vehicles }, { data: bookings }, { data: contextCustomers }] = await Promise.all([
    workOrderIds.length
      ? admin.from("work_orders").select("id, custom_id, status, customer_name").in("id", workOrderIds)
      : Promise.resolve({ data: [], error: null }),
    vehicleIds.length
      ? admin.from("vehicles").select("id, year, make, model, unit_number").in("id", vehicleIds)
      : Promise.resolve({ data: [], error: null }),
    bookingIds.length
      ? admin.from("bookings").select("id, starts_at, status").in("id", bookingIds)
      : Promise.resolve({ data: [], error: null }),
    customerIds.length
      ? admin.from("customers").select("id, name, first_name, last_name, email").in("id", customerIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const workOrderById = new Map((workOrders ?? []).map((row) => [row.id, row]));
  const vehicleById = new Map((vehicles ?? []).map((row) => [row.id, row]));
  const bookingById = new Map((bookings ?? []).map((row) => [row.id, row]));
  const customerById = new Map((contextCustomers ?? []).map((row) => [row.id, row]));
  const portal = actorResult.actor.kind === "customer";

  const contextFor = (conversation: ConversationRow): ConversationContextPayload | null => {
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
      const startsAt = booking?.starts_at ? new Date(booking.starts_at).toLocaleString() : null;
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
        label: conversation.title ?? conversation.context_type.replaceAll("_", " "),
        secondary: null,
        href:
          !portal && conversation.context_type === "inspection"
            ? `/inspections/${conversation.context_id}`
            : null,
      };
    }
    return null;
  };

  const payload: ConversationPayload[] = safeConversations.map((conversation) => {
    const latest = latestByConversation.get(conversation.id) ?? null;
    const lastReadAt = readByConversation.get(conversation.id);
    const unreadCount = (messages ?? []).filter((message) => {
      if (message.conversation_id !== conversation.id || message.sender_id === user.id) return false;
      const sentAt = message.sent_at ?? message.created_at;
      return !lastReadAt || sentAt > lastReadAt;
    }).length;

    return {
      conversation,
      latest_message: latest,
      participants: participantsByConversation.get(conversation.id) ?? [],
      unread_count: unreadCount,
      context: contextFor(conversation),
    };
  });

  payload.sort((a, b) => {
    const aTime = a.conversation.last_message_at ?? a.latest_message?.sent_at ?? a.conversation.created_at ?? "";
    const bTime = b.conversation.last_message_at ?? b.latest_message?.sent_at ?? b.conversation.created_at ?? "";
    return bTime.localeCompare(aTime);
  });

  return NextResponse.json(payload);
}

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  ShopAssistantContext,
  ShopAssistantMessage,
  ShopAssistantMessageKind,
  ShopAssistantMessageRole,
  ShopAssistantThread,
  ShopAssistantThreadContext,
} from "@/features/shop-assistant/types";
import type { ShopAssistantActor } from "./requireShopAssistantActor";
import { ShopAssistantHttpError } from "./requireShopAssistantActor";

type AssistantDb = SupabaseClient<any>;

type ThreadRow = {
  id: string;
  shop_id: string;
  user_id: string;
  title: string;
  context: unknown;
  last_message_at: string;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

type MessageRow = {
  id: string;
  thread_id: string;
  shop_id: string;
  user_id: string | null;
  role: string;
  kind: string;
  content: string;
  payload: unknown;
  client_message_id: string | null;
  created_at: string;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function normalizeThreadContext(
  value: unknown,
): ShopAssistantThreadContext {
  const record = asRecord(value);
  const domain = optionalString(record.lastDomain);

  return {
    activeWorkOrderId: optionalString(record.activeWorkOrderId),
    activeVehicleId: optionalString(record.activeVehicleId),
    activeCustomerId: optionalString(record.activeCustomerId),
    activeBookingId: optionalString(record.activeBookingId),
    activeInvoiceId: optionalString(record.activeInvoiceId),
    lastDomain:
      domain === "work_orders" ||
      domain === "scheduling" ||
      domain === "inventory" ||
      domain === "customer_communications" ||
      domain === "customers" ||
      domain === "inspections" ||
      domain === "invoices" ||
      domain === "workforce" ||
      domain === "reporting" ||
      domain === "business_analytics"
        ? domain
        : undefined,
    lastIntent: optionalString(record.lastIntent),
  };
}

export function threadContextFromPage(
  context?: ShopAssistantContext,
): ShopAssistantThreadContext {
  return {
    activeWorkOrderId: optionalString(context?.workOrderId),
    activeVehicleId: optionalString(context?.vehicleId),
    activeCustomerId: optionalString(context?.customerId),
    activeBookingId: optionalString(context?.bookingId),
    activeInvoiceId: optionalString(context?.invoiceId),
  };
}

export function mergeThreadContext(
  current: ShopAssistantThreadContext,
  next: ShopAssistantThreadContext,
): ShopAssistantThreadContext {
  return Object.fromEntries(
    Object.entries({ ...current, ...next }).filter(([, value]) => value !== undefined),
  ) as ShopAssistantThreadContext;
}

export function mapThread(row: ThreadRow): ShopAssistantThread {
  return {
    id: row.id,
    title: row.title,
    context: normalizeThreadContext(row.context),
    lastMessageAt: row.last_message_at,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeRole(value: string): ShopAssistantMessageRole {
  if (value === "user" || value === "system" || value === "tool") return value;
  return "assistant";
}

function normalizeKind(value: string): ShopAssistantMessageKind {
  if (
    value === "confirmation" ||
    value === "action_result" ||
    value === "error" ||
    value === "state_update"
  ) {
    return value;
  }
  return "text";
}

export function mapMessage(row: MessageRow): ShopAssistantMessage {
  return {
    id: row.id,
    threadId: row.thread_id,
    role: normalizeRole(row.role),
    kind: normalizeKind(row.kind),
    content: row.content,
    payload: asRecord(row.payload),
    clientMessageId: row.client_message_id,
    createdAt: row.created_at,
  };
}

function dbFor(actor: ShopAssistantActor): AssistantDb {
  return actor.supabase as unknown as AssistantDb;
}

export async function listShopAssistantThreads(
  actor: ShopAssistantActor,
  limit = 20,
): Promise<ShopAssistantThread[]> {
  const { data, error } = await dbFor(actor)
    .from("shop_assistant_threads")
    .select(
      "id, shop_id, user_id, title, context, last_message_at, archived_at, created_at, updated_at",
    )
    .eq("shop_id", actor.shopId)
    .eq("user_id", actor.userId)
    .is("archived_at", null)
    .order("last_message_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 50));

  if (error) throw new Error(error.message);
  return ((data ?? []) as ThreadRow[]).map(mapThread);
}

export async function createShopAssistantThread(
  actor: ShopAssistantActor,
  pageContext?: ShopAssistantContext,
): Promise<ShopAssistantThread> {
  const context = threadContextFromPage(pageContext);
  const { data, error } = await dbFor(actor)
    .from("shop_assistant_threads")
    .insert({
      shop_id: actor.shopId,
      user_id: actor.userId,
      context,
    })
    .select(
      "id, shop_id, user_id, title, context, last_message_at, archived_at, created_at, updated_at",
    )
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to create shop assistant thread");
  }

  return mapThread(data as ThreadRow);
}

export async function getShopAssistantThread(
  actor: ShopAssistantActor,
  threadId: string,
): Promise<ShopAssistantThread> {
  const { data, error } = await dbFor(actor)
    .from("shop_assistant_threads")
    .select(
      "id, shop_id, user_id, title, context, last_message_at, archived_at, created_at, updated_at",
    )
    .eq("id", threadId)
    .eq("shop_id", actor.shopId)
    .eq("user_id", actor.userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new ShopAssistantHttpError(404, "Shop assistant thread not found");
  return mapThread(data as ThreadRow);
}

export async function getOrCreateShopAssistantThread(
  actor: ShopAssistantActor,
  threadId?: string,
  pageContext?: ShopAssistantContext,
): Promise<ShopAssistantThread> {
  if (threadId?.trim()) {
    return getShopAssistantThread(actor, threadId.trim());
  }

  const existing = await listShopAssistantThreads(actor, 1);
  if (existing[0]) return existing[0];
  return createShopAssistantThread(actor, pageContext);
}

export async function loadShopAssistantMessages(
  actor: ShopAssistantActor,
  threadId: string,
  limit = 80,
): Promise<ShopAssistantMessage[]> {
  await getShopAssistantThread(actor, threadId);

  const { data, error } = await dbFor(actor)
    .from("shop_assistant_messages")
    .select(
      "id, thread_id, shop_id, user_id, role, kind, content, payload, client_message_id, created_at",
    )
    .eq("thread_id", threadId)
    .eq("shop_id", actor.shopId)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(Math.min(Math.max(limit, 1), 200));

  if (error) throw new Error(error.message);
  return ((data ?? []) as MessageRow[]).map(mapMessage);
}

export async function insertUserMessageIdempotent(params: {
  actor: ShopAssistantActor;
  threadId: string;
  content: string;
  clientMessageId: string;
  payload?: Record<string, unknown>;
}): Promise<{ message: ShopAssistantMessage; created: boolean }> {
  const { actor, threadId, content, clientMessageId, payload = {} } = params;
  const db = dbFor(actor);

  const { data, error } = await db
    .from("shop_assistant_messages")
    .insert({
      thread_id: threadId,
      shop_id: actor.shopId,
      user_id: actor.userId,
      role: "user",
      kind: "text",
      content,
      payload,
      client_message_id: clientMessageId,
    })
    .select(
      "id, thread_id, shop_id, user_id, role, kind, content, payload, client_message_id, created_at",
    )
    .maybeSingle();

  if (!error && data) {
    return { message: mapMessage(data as MessageRow), created: true };
  }

  if (error?.code !== "23505") {
    throw new Error(error?.message ?? "Failed to save shop assistant message");
  }

  const { data: existing, error: existingError } = await db
    .from("shop_assistant_messages")
    .select(
      "id, thread_id, shop_id, user_id, role, kind, content, payload, client_message_id, created_at",
    )
    .eq("thread_id", threadId)
    .eq("client_message_id", clientMessageId)
    .maybeSingle();

  if (existingError || !existing) {
    throw new Error(
      existingError?.message ?? "Failed to restore idempotent shop assistant message",
    );
  }

  return { message: mapMessage(existing as MessageRow), created: false };
}

export async function findAssistantReply(
  actor: ShopAssistantActor,
  threadId: string,
  clientMessageId: string,
): Promise<ShopAssistantMessage | null> {
  const { data, error } = await dbFor(actor)
    .from("shop_assistant_messages")
    .select(
      "id, thread_id, shop_id, user_id, role, kind, content, payload, client_message_id, created_at",
    )
    .eq("thread_id", threadId)
    .eq("role", "assistant")
    .contains("payload", { requestClientMessageId: clientMessageId })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data ? mapMessage(data as MessageRow) : null;
}

export async function insertAssistantMessage(params: {
  actor: ShopAssistantActor;
  threadId: string;
  content: string;
  kind?: ShopAssistantMessageKind;
  payload?: Record<string, unknown>;
}): Promise<ShopAssistantMessage> {
  const {
    actor,
    threadId,
    content,
    kind = "text",
    payload = {},
  } = params;

  const { data, error } = await dbFor(actor)
    .from("shop_assistant_messages")
    .insert({
      thread_id: threadId,
      shop_id: actor.shopId,
      user_id: null,
      role: "assistant",
      kind,
      content,
      payload,
    })
    .select(
      "id, thread_id, shop_id, user_id, role, kind, content, payload, client_message_id, created_at",
    )
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to save shop assistant reply");
  }

  return mapMessage(data as MessageRow);
}

export async function updateShopAssistantThreadContext(params: {
  actor: ShopAssistantActor;
  thread: ShopAssistantThread;
  context: ShopAssistantThreadContext;
  title?: string;
}): Promise<ShopAssistantThread> {
  const merged = mergeThreadContext(params.thread.context, params.context);
  const update: Record<string, unknown> = { context: merged };
  if (params.title?.trim()) update.title = params.title.trim().slice(0, 120);

  const { data, error } = await dbFor(params.actor)
    .from("shop_assistant_threads")
    .update(update)
    .eq("id", params.thread.id)
    .eq("shop_id", params.actor.shopId)
    .eq("user_id", params.actor.userId)
    .select(
      "id, shop_id, user_id, title, context, last_message_at, archived_at, created_at, updated_at",
    )
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to update shop assistant thread");
  }

  return mapThread(data as ThreadRow);
}

import "server-only";

import {
  buildDispatchNotifications,
  type DispatchParticipant,
  type DispatchWorkOrderInput,
  type FieldCallInput,
} from "@/features/equipment/dispatch/lib/equipmentDispatch";
import { createNotificationAdmin } from "@/features/notifications/server/db";
import { createNotification } from "@/features/notifications/server/notificationStore";

type RpcError = { message?: string | null; details?: string | null; code?: string | null };
type RpcClient = {
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: RpcError | null }>;
};

export class EquipmentDispatchError extends Error {
  constructor(
    message: string,
    readonly code: string | null,
    readonly detail: string | null,
  ) {
    super(message);
    this.name = "EquipmentDispatchError";
  }
}

export function equipmentDispatchHttpStatus(error: EquipmentDispatchError): number {
  const message = error.message;
  if (error.code === "RETRYABLE") return 503;
  // Database-level one-executing-visit-per-work-order guarantee.
  if (message.includes("service_visits_one_executing_per_work_order_uniq")) return 409;
  if (error.code === "42501" || message.toLowerCase().includes("denied")) return 403;
  if (
    message.includes("ACTIVE_SERVICE_VISIT_EXISTS") ||
    message.includes("OPERATION_KEY_CONFLICT") ||
    error.code === "40001"
  ) {
    return 409;
  }
  if (message.toLowerCase().includes("not available") || message.toLowerCase().includes("does not belong")) {
    return 422;
  }
  return error.code === "P0001" || error.code === "22023" || error.code === "23503" ? 400 : 500;
}

export type EquipmentDispatchResult = {
  ok: true;
  workOrderId: string;
  workOrder?: { id: string; customId: string | null };
  visit: { id: string; status?: string; version?: number } & Record<string, unknown>;
  participants: DispatchParticipant[];
  idempotent: boolean;
  notificationsQueued: number;
};

async function callRpc(supabase: unknown, name: string, args: Record<string, unknown>) {
  const { data, error } = await (supabase as RpcClient).rpc(name, args);
  if (error) {
    throw new EquipmentDispatchError(
      error.message || "Dispatch failed.",
      error.code ?? null,
      error.details ?? null,
    );
  }
  return data as Record<string, unknown>;
}

function visitArgs(input: DispatchWorkOrderInput | FieldCallInput) {
  return {
    p_service_address_id: input.serviceAddressId ?? null,
    p_scheduled_start: input.scheduledStart ?? null,
    p_scheduled_end: input.scheduledEnd ?? null,
    p_lead_user_id: input.leadUserId ?? null,
    p_support_user_ids: input.supportUserIds,
    p_service_vehicle_id: input.serviceVehicleId ?? null,
    p_dispatch_notes: input.dispatchNotes ?? null,
    p_dispatch_now: input.dispatchNow,
  };
}

/**
 * Notification fan-out runs on every call, including idempotent replays: the
 * notification store de-duplicates per (visit, technician) and repairs missing
 * push deliveries, so a request that committed but crashed before notifying is
 * completed by the client's retry.
 */
async function notifyParticipants(input: {
  shopId: string;
  actorProfileId: string;
  workOrderId: string;
  workOrderLabel: string | null;
  visitId: string;
  participants: DispatchParticipant[];
  dispatchedNow: boolean;
}): Promise<number> {
  const admin = createNotificationAdmin();
  const notifications = buildDispatchNotifications({
    visitId: input.visitId,
    workOrderId: input.workOrderId,
    workOrderLabel: input.workOrderLabel,
    participants: input.participants,
    actorProfileId: input.actorProfileId,
    dispatchedNow: input.dispatchedNow,
  });
  let queued = 0;
  let failed = 0;
  for (const n of notifications) {
    const result = await createNotification({
      admin,
      shopId: input.shopId,
      recipientUserId: n.recipientUserId,
      eventType: n.eventType,
      dedupeKey: n.dedupeKey,
      title: n.title,
      body: n.body,
      targetPath: n.targetPath,
      priority: n.priority,
    });
    if (result.ok) queued += 1;
    else {
      failed += 1;
      console.error("[equipment-dispatch] notification failed", result.reason);
    }
  }
  if (failed > 0) {
    // The dispatch is committed and idempotent: surface a retryable failure so
    // the client replays the same key, which re-runs this idempotent fan-out.
    throw new EquipmentDispatchError(
      "Dispatch saved, but some technicians could not be notified. Retry to finish.",
      "RETRYABLE",
      null,
    );
  }
  return queued;
}

function normalize(data: Record<string, unknown>) {
  const visit = (data.visit ?? {}) as EquipmentDispatchResult["visit"];
  const participants = Array.isArray(data.participants)
    ? (data.participants as DispatchParticipant[])
    : [];
  return { visit, participants, idempotent: Boolean(data.idempotent) };
}

export async function dispatchExistingWorkOrder(input: {
  supabase: unknown;
  shopId: string;
  actorUserId: string;
  actorProfileId: string;
  operationKey: string;
  request: DispatchWorkOrderInput;
}): Promise<EquipmentDispatchResult> {
  const data = await callRpc(input.supabase, "equipment_dispatch_visit_atomic", {
    p_shop_id: input.shopId,
    p_work_order_id: input.request.workOrderId,
    p_mode: input.request.mode,
    ...visitArgs(input.request),
    p_actor_user_id: input.actorUserId,
    p_operation_key: input.operationKey,
  });
  const { visit, participants, idempotent } = normalize(data);
  const notificationsQueued = await notifyParticipants({
    shopId: input.shopId,
    actorProfileId: input.actorProfileId,
    workOrderId: input.request.workOrderId,
    workOrderLabel: null,
    visitId: visit.id,
    participants,
    dispatchedNow: input.request.dispatchNow,
  });
  return { ok: true, workOrderId: input.request.workOrderId, visit, participants, idempotent, notificationsQueued };
}

export async function createFieldCall(input: {
  supabase: unknown;
  shopId: string;
  actorUserId: string;
  actorProfileId: string;
  operationKey: string;
  request: FieldCallInput;
}): Promise<EquipmentDispatchResult> {
  const data = await callRpc(input.supabase, "equipment_create_field_call_atomic", {
    p_shop_id: input.shopId,
    p_customer_id: input.request.customerId,
    p_vehicle_id: input.request.vehicleId,
    p_complaint: input.request.complaint,
    p_priority: input.request.priority,
    ...visitArgs(input.request),
    p_actor_user_id: input.actorUserId,
    p_operation_key: input.operationKey,
  });
  const { visit, participants, idempotent } = normalize(data);
  const workOrder = (data.workOrder ?? undefined) as EquipmentDispatchResult["workOrder"];
  const workOrderId = String(data.workOrderId ?? workOrder?.id ?? "");
  const notificationsQueued = await notifyParticipants({
    shopId: input.shopId,
    actorProfileId: input.actorProfileId,
    workOrderId,
    workOrderLabel: workOrder?.customId ?? null,
    visitId: visit.id,
    participants,
    dispatchedNow: input.request.dispatchNow,
  });
  return { ok: true, workOrderId, workOrder, visit, participants, idempotent, notificationsQueued };
}

export async function acknowledgeVisit(input: {
  supabase: unknown;
  shopId: string;
  actorUserId: string;
  actorProfileId: string;
  visitId: string;
}): Promise<{ ok: true; acknowledgedAt: string; idempotent: boolean }> {
  const data = await callRpc(input.supabase, "equipment_acknowledge_visit_atomic", {
    p_shop_id: input.shopId,
    p_visit_id: input.visitId,
    p_actor_user_id: input.actorUserId,
  });
  // Acknowledgement is its own record; also settle the in-app notification so
  // push/in-app prompts for this assignment stop.
  const admin = createNotificationAdmin();
  const now = new Date().toISOString();
  const settled = await admin
    .from("app_notifications")
    .update({ acknowledged_at: now, read_at: now })
    .eq("shop_id", input.shopId)
    .eq("recipient_user_id", input.actorProfileId)
    .eq("dedupe_key", `equipment:dispatch.assigned:${input.visitId}:${input.actorProfileId}`)
    .is("acknowledged_at", null);
  if (settled.error) {
    // The acknowledgement itself is recorded and replays idempotently; ask the
    // client to retry so the notification is settled too.
    throw new EquipmentDispatchError(
      "Acknowledged, but the alert could not be cleared. Retry to finish.",
      "RETRYABLE",
      null,
    );
  }
  return {
    ok: true,
    acknowledgedAt: String(data.acknowledgedAt),
    idempotent: Boolean(data.idempotent),
  };
}

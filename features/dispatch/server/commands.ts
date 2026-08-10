import "server-only";

import type {
  DispatchBoardSnapshot,
  DispatchMutationResult,
  DispatchVisitHistoryEvent,
  MobileActiveJobContract,
} from "@/features/dispatch/lib/contracts";
import type {
  ServiceVisitMode,
  ServiceVisitStatus,
} from "@/features/scheduling/lib/service-visit-contract";

type RpcError = {
  message?: string | null;
  details?: string | null;
  hint?: string | null;
  code?: string | null;
};

type RpcClient = {
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: RpcError | null }>;
};

export class DispatchCommandError extends Error {
  constructor(
    message: string,
    readonly code?: string | null,
  ) {
    super(message);
    this.name = "DispatchCommandError";
  }
}

export function dispatchRpcMessage(error: RpcError): string {
  return [error.message, error.details, error.hint].filter(Boolean).join(" — ");
}

function throwRpc(error: RpcError | null): void {
  if (!error) return;
  throw new DispatchCommandError(
    dispatchRpcMessage(error) || "Dispatch operation failed.",
    error.code,
  );
}

async function rpc<T>(
  supabase: unknown,
  name: string,
  args: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await (supabase as RpcClient).rpc(name, args);
  throwRpc(error);
  return data as T;
}

export async function createServiceVisit(input: {
  supabase: unknown;
  shopId: string;
  actorUserId: string;
  operationKey: string;
  bookingId?: string | null;
  workOrderId?: string | null;
  mode: ServiceVisitMode;
  serviceAddressId?: string | null;
  scheduledStart?: string | null;
  scheduledEnd?: string | null;
  assignedUserId?: string | null;
  serviceVehicleId?: string | null;
  dispatchNotes?: string | null;
  estimatedTravelMinutes?: number | null;
  estimatedDistanceKm?: number | null;
}): Promise<DispatchMutationResult> {
  return rpc<DispatchMutationResult>(input.supabase, "dispatch_create_service_visit_atomic", {
    p_shop_id: input.shopId,
    p_booking_id: input.bookingId ?? null,
    p_work_order_id: input.workOrderId ?? null,
    p_mode: input.mode,
    p_service_address_id: input.serviceAddressId ?? null,
    p_scheduled_start: input.scheduledStart ?? null,
    p_scheduled_end: input.scheduledEnd ?? null,
    p_assigned_user_id: input.assignedUserId ?? null,
    p_service_vehicle_id: input.serviceVehicleId ?? null,
    p_dispatch_notes: input.dispatchNotes ?? null,
    p_estimated_travel_minutes: input.estimatedTravelMinutes ?? null,
    p_estimated_distance_km: input.estimatedDistanceKm ?? null,
    p_actor_user_id: input.actorUserId,
    p_operation_key: input.operationKey,
  });
}

export async function updateServiceVisit(input: {
  supabase: unknown;
  shopId: string;
  visitId: string;
  actorUserId: string;
  operationKey: string;
  expectedVersion?: number | null;
  workOrderId?: string | null;
  serviceAddressId?: string | null;
  dispatchNotes?: string | null;
  estimatedTravelMinutes?: number | null;
  estimatedDistanceKm?: number | null;
}): Promise<DispatchMutationResult> {
  return rpc<DispatchMutationResult>(input.supabase, "dispatch_update_service_visit_atomic", {
    p_shop_id: input.shopId,
    p_visit_id: input.visitId,
    p_work_order_id: input.workOrderId ?? null,
    p_service_address_id: input.serviceAddressId ?? null,
    p_dispatch_notes: input.dispatchNotes ?? null,
    p_estimated_travel_minutes: input.estimatedTravelMinutes ?? null,
    p_estimated_distance_km: input.estimatedDistanceKm ?? null,
    p_expected_version: input.expectedVersion ?? null,
    p_actor_user_id: input.actorUserId,
    p_operation_key: input.operationKey,
  });
}

export async function rescheduleServiceVisit(input: {
  supabase: unknown;
  shopId: string;
  visitId: string;
  actorUserId: string;
  operationKey: string;
  startsAt: string;
  endsAt: string;
  expectedVersion?: number | null;
}): Promise<DispatchMutationResult> {
  return rpc<DispatchMutationResult>(input.supabase, "dispatch_reschedule_service_visit_atomic", {
    p_shop_id: input.shopId,
    p_visit_id: input.visitId,
    p_starts_at: input.startsAt,
    p_ends_at: input.endsAt,
    p_expected_version: input.expectedVersion ?? null,
    p_actor_user_id: input.actorUserId,
    p_operation_key: input.operationKey,
  });
}

export async function assignServiceVisit(input: {
  supabase: unknown;
  shopId: string;
  visitId: string;
  actorUserId: string;
  operationKey: string;
  assignedUserId?: string | null;
  serviceVehicleId?: string | null;
  expectedVersion?: number | null;
}): Promise<DispatchMutationResult> {
  return rpc<DispatchMutationResult>(input.supabase, "dispatch_assign_service_visit_atomic", {
    p_shop_id: input.shopId,
    p_visit_id: input.visitId,
    p_assigned_user_id: input.assignedUserId ?? null,
    p_service_vehicle_id: input.serviceVehicleId ?? null,
    p_expected_version: input.expectedVersion ?? null,
    p_actor_user_id: input.actorUserId,
    p_operation_key: input.operationKey,
  });
}

export async function transitionServiceVisit(input: {
  supabase: unknown;
  shopId: string;
  visitId: string;
  actorUserId: string;
  operationKey: string;
  toStatus: ServiceVisitStatus;
  actualTravelMinutes?: number | null;
  actualDistanceKm?: number | null;
  expectedVersion?: number | null;
}): Promise<DispatchMutationResult> {
  return rpc<DispatchMutationResult>(input.supabase, "dispatch_transition_service_visit_atomic", {
    p_shop_id: input.shopId,
    p_visit_id: input.visitId,
    p_to_status: input.toStatus,
    p_actual_travel_minutes: input.actualTravelMinutes ?? null,
    p_actual_distance_km: input.actualDistanceKm ?? null,
    p_expected_version: input.expectedVersion ?? null,
    p_actor_user_id: input.actorUserId,
    p_operation_key: input.operationKey,
  });
}

export async function getDispatchBoard(input: {
  supabase: unknown;
  shopId: string;
  actorUserId: string;
  startsAt: string;
  endsAt: string;
}): Promise<DispatchBoardSnapshot> {
  return rpc<DispatchBoardSnapshot>(input.supabase, "dispatch_board_snapshot", {
    p_shop_id: input.shopId,
    p_actor_user_id: input.actorUserId,
    p_window_start: input.startsAt,
    p_window_end: input.endsAt,
  });
}

export async function getVisitHistory(input: {
  supabase: unknown;
  shopId: string;
  visitId: string;
  actorUserId: string;
}): Promise<DispatchVisitHistoryEvent[]> {
  const data = await rpc<unknown>(input.supabase, "dispatch_visit_history", {
    p_shop_id: input.shopId,
    p_visit_id: input.visitId,
    p_actor_user_id: input.actorUserId,
  });
  return Array.isArray(data) ? (data as DispatchVisitHistoryEvent[]) : [];
}

export async function getMobileActiveJobs(input: {
  supabase: unknown;
  shopId: string;
  actorUserId: string;
}): Promise<MobileActiveJobContract> {
  return rpc<MobileActiveJobContract>(input.supabase, "dispatch_mobile_active_snapshot", {
    p_shop_id: input.shopId,
    p_actor_user_id: input.actorUserId,
  });
}

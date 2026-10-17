import "server-only";

import type { PunchOffInput, PunchOffResult } from "@/features/equipment/dispatch/lib/punchOff";
import {
  EquipmentDispatchError,
} from "@/features/equipment/dispatch/server/equipmentDispatchService";

type RpcClient = {
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{
    data: unknown;
    error: { message?: string | null; details?: string | null; code?: string | null } | null;
  }>;
};

/**
 * Punches the calling technician off a line. The database command ends only
 * that technician's labor, and completes the line only when nobody else is
 * still on it; the canonical punch transition does the actual work.
 */
export async function punchOffLine(input: {
  supabase: unknown;
  shopId: string;
  technicianId: string;
  actorUserId: string;
  operationKey: string;
  request: PunchOffInput;
}): Promise<PunchOffResult> {
  const { data, error } = await (input.supabase as RpcClient).rpc("equipment_punch_off_line_atomic", {
    p_shop_id: input.shopId,
    p_work_order_line_id: input.request.lineId,
    p_technician_id: input.technicianId,
    p_actor_user_id: input.actorUserId,
    p_operation_key: input.operationKey,
    p_cause: input.request.cause ?? null,
    p_correction: input.request.correction ?? null,
    p_notes: input.request.notes ?? null,
  });
  if (error) {
    throw new EquipmentDispatchError(
      error.message || "Punch-off failed.",
      error.code ?? null,
      error.details ?? null,
    );
  }
  const row = (data ?? {}) as Record<string, unknown>;
  return {
    ok: true,
    lineId: String(row.lineId ?? input.request.lineId),
    lineClosed: Boolean(row.lineClosed),
    remaining: Array.isArray(row.remaining) ? (row.remaining as PunchOffResult["remaining"]) : [],
    idempotent: Boolean(row.idempotent),
  };
}

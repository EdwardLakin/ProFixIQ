import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@shared/types/types/supabase";

type DB = Database;

type RpcError = { message: string; details?: string | null; hint?: string | null };
type RpcResult = { data: unknown; error: RpcError | null };
type RpcClient = {
  rpc: (name: string, args: Record<string, unknown>) => PromiseLike<RpcResult>;
};

export type WorkOrderCorrectionScope =
  | "operational_correction"
  | "invoice_adjustment"
  | "void_and_reissue"
  | "data_repair";

export type WorkOrderCorrectionSession = {
  id: string;
  shop_id: string;
  work_order_id: string;
  invoice_version_id: string | null;
  operation_key: string;
  reason: string;
  scope: WorkOrderCorrectionScope;
  status: "open" | "closed" | "cancelled";
  opened_by: string | null;
  opened_at: string;
  closed_by: string | null;
  closed_at: string | null;
  metadata: Json;
};

function rpcClient(supabase: SupabaseClient<DB>): RpcClient {
  return supabase as unknown as RpcClient;
}

function normalizeSession(value: unknown): WorkOrderCorrectionSession {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Correction session response was invalid");
  }
  return value as WorkOrderCorrectionSession;
}

function throwRpcError(error: RpcError): never {
  const detail = error.details?.trim();
  const hint = error.hint?.trim();
  throw new Error([error.message, detail, hint].filter(Boolean).join(" — "));
}

export async function openWorkOrderCorrection(input: {
  supabase: SupabaseClient<DB>;
  shopId: string;
  workOrderId: string;
  actorUserId: string;
  reason: string;
  scope: WorkOrderCorrectionScope;
  operationKey: string;
  metadata?: Json;
}): Promise<WorkOrderCorrectionSession> {
  const { data, error } = await rpcClient(input.supabase).rpc(
    "open_work_order_correction_session",
    {
      p_shop_id: input.shopId,
      p_work_order_id: input.workOrderId,
      p_actor_user_id: input.actorUserId,
      p_reason: input.reason,
      p_scope: input.scope,
      p_operation_key: input.operationKey,
      p_metadata: input.metadata ?? {},
    },
  );
  if (error) throwRpcError(error);
  return normalizeSession(data);
}

export async function closeWorkOrderCorrection(input: {
  supabase: SupabaseClient<DB>;
  shopId: string;
  workOrderId: string;
  correctionSessionId: string;
  actorUserId: string;
  metadata?: Json;
}): Promise<WorkOrderCorrectionSession> {
  const { data, error } = await rpcClient(input.supabase).rpc(
    "close_work_order_correction_session",
    {
      p_shop_id: input.shopId,
      p_work_order_id: input.workOrderId,
      p_correction_session_id: input.correctionSessionId,
      p_actor_user_id: input.actorUserId,
      p_metadata: input.metadata ?? {},
    },
  );
  if (error) throwRpcError(error);
  return normalizeSession(data);
}

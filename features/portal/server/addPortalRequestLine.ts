import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;
type RpcError = { message: string; details?: string | null; hint?: string | null };
type RpcClient = SupabaseClient<DB> & {
  rpc(
    fn: string,
    args: Record<string, unknown>,
  ): Promise<{ data: unknown; error: RpcError | null }>;
};

export type PortalRequestLineKind = "custom" | "menu" | "inspection";

export async function addPortalRequestLine(args: {
  supabase: SupabaseClient<DB>;
  shopId: string;
  customerId: string;
  workOrderId: string;
  actorUserId: string;
  kind: PortalRequestLineKind;
  sourceId?: string | null;
  description?: string | null;
  notes?: string | null;
  lineType?: "job" | "info";
  operationKey: string;
  diagnostic?: boolean;
}): Promise<Record<string, unknown>> {
  const diagnostic = args.kind === "custom" && args.diagnostic === true;
  const { data, error } = await (args.supabase as RpcClient).rpc(
    diagnostic ? "add_portal_diagnostic_line_atomic" : "add_portal_request_line_atomic",
    diagnostic
      ? {
          p_shop_id: args.shopId,
          p_customer_id: args.customerId,
          p_work_order_id: args.workOrderId,
          p_actor_user_id: args.actorUserId,
          p_description: args.description ?? null,
          p_notes: args.notes ?? null,
          p_operation_key: args.operationKey,
          p_at: new Date().toISOString(),
        }
      : {
      p_shop_id: args.shopId,
      p_customer_id: args.customerId,
      p_work_order_id: args.workOrderId,
      p_actor_user_id: args.actorUserId,
      p_line_kind: args.kind,
      p_source_id: args.sourceId ?? null,
      p_description: args.description ?? null,
      p_notes: args.notes ?? null,
      p_line_type: args.lineType ?? null,
      p_operation_key: args.operationKey,
      p_at: new Date().toISOString(),
        },
  );

  if (error) {
    const message = [error.message, error.details, error.hint]
      .filter(Boolean)
      .join(" â€” ");
    throw new Error(message);
  }

  return (data ?? { ok: true }) as Record<string, unknown>;
}


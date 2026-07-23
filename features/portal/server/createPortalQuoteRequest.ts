import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;
type RpcError = { message: string; details?: string | null; hint?: string | null };
type RpcClient = SupabaseClient<DB> & {
  rpc(
    fn: "create_portal_quote_request_atomic",
    args: Record<string, unknown>,
  ): Promise<{ data: unknown; error: RpcError | null }>;
};

export type PortalQuoteRequestKind = "repair" | "parts_only";

export type PortalQuoteRequestResult = {
  ok: true;
  workOrderId: string;
  quoteLineId: string;
  partRequestId: string | null;
  requestKind: PortalQuoteRequestKind;
  idempotent: boolean;
};

export async function createPortalQuoteRequest(args: {
  supabase: SupabaseClient<DB>;
  shopId: string;
  customerId: string;
  vehicleId: string;
  workOrderId?: string | null;
  actorUserId: string;
  requestKind: PortalQuoteRequestKind;
  description: string;
  notes?: string | null;
  qty?: number;
  operationKey: string;
}): Promise<PortalQuoteRequestResult> {
  const { data, error } = await (args.supabase as RpcClient).rpc(
    "create_portal_quote_request_atomic",
    {
      p_shop_id: args.shopId,
      p_customer_id: args.customerId,
      p_vehicle_id: args.vehicleId,
      p_work_order_id: args.workOrderId ?? null,
      p_actor_user_id: args.actorUserId,
      p_request_kind: args.requestKind,
      p_description: args.description,
      p_notes: args.notes ?? null,
      p_qty: Math.max(1, Math.min(99, Math.trunc(args.qty ?? 1))),
      p_fulfillment: args.requestKind === "parts_only" ? "pickup" : "appointment",
      p_operation_key: args.operationKey,
      p_at: new Date().toISOString(),
    },
  );

  if (error) {
    throw new Error([error.message, error.details, error.hint].filter(Boolean).join(" â€” "));
  }

  const result = data as Partial<PortalQuoteRequestResult> | null;
  if (!result?.ok || !result.workOrderId || !result.quoteLineId) {
    throw new Error("Quote request did not return its work order and quote line.");
  }

  return {
    ok: true,
    workOrderId: result.workOrderId,
    quoteLineId: result.quoteLineId,
    partRequestId: result.partRequestId ?? null,
    requestKind: result.requestKind === "parts_only" ? "parts_only" : "repair",
    idempotent: result.idempotent === true,
  };
}


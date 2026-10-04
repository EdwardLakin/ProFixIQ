import "server-only";

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

export type PortalPartsQuoteRequestResult = {
  ok: true;
  requestId: string;
  partRequestId: string | null;
  status: string;
  idempotent: boolean;
};

function rpcMessage(error: RpcError): string {
  return [error.message, error.details, error.hint].filter(Boolean).join(" — ");
}

/**
 * Creates a parts-only quote request for the verified portal customer. No work
 * order and no service quote line is created; the request is priced through
 * the shop Parts system.
 */
export async function createPortalPartsQuoteRequest(args: {
  supabase: SupabaseClient<DB>;
  shopId: string;
  customerId: string;
  vehicleId: string;
  actorUserId: string;
  description: string;
  notes?: string | null;
  qty?: number;
  operationKey: string;
}): Promise<PortalPartsQuoteRequestResult> {
  const { data, error } = await (args.supabase as RpcClient).rpc(
    "create_portal_parts_quote_request_atomic",
    {
      p_shop_id: args.shopId,
      p_customer_id: args.customerId,
      p_vehicle_id: args.vehicleId,
      p_actor_user_id: args.actorUserId,
      p_description: args.description,
      p_notes: args.notes ?? null,
      p_qty: Math.max(1, Math.min(99, Math.trunc(args.qty ?? 1))),
      p_operation_key: args.operationKey,
      p_at: new Date().toISOString(),
    },
  );
  if (error) throw new Error(rpcMessage(error));

  const result = (data ?? {}) as Record<string, unknown>;
  if (result.ok !== true || typeof result.requestId !== "string") {
    throw new Error("The parts quote request could not be created.");
  }
  return {
    ok: true,
    requestId: result.requestId,
    partRequestId: typeof result.partRequestId === "string" ? result.partRequestId : null,
    status: typeof result.status === "string" ? result.status : "requested",
    idempotent: result.idempotent === true,
  };
}

export type PortalPartsQuoteDecision = "approve" | "decline";

export async function decidePortalPartsQuoteRequest(args: {
  supabase: SupabaseClient<DB>;
  requestId: string;
  customerId: string;
  actorUserId: string;
  decision: PortalPartsQuoteDecision;
  choice?: "order_parts" | "book_install" | null;
}): Promise<{ status: string; choice: string | null; idempotent: boolean }> {
  const { data, error } = await (args.supabase as RpcClient).rpc(
    "decide_portal_parts_quote_request_atomic",
    {
      p_request_id: args.requestId,
      p_customer_id: args.customerId,
      p_actor_user_id: args.actorUserId,
      p_decision: args.decision,
      p_choice: args.choice ?? null,
      p_at: new Date().toISOString(),
    },
  );
  if (error) throw new Error(rpcMessage(error));

  const result = (data ?? {}) as Record<string, unknown>;
  if (result.ok === false) {
    throw new Error(
      result.error === "quote_changed"
        ? "The shop updated this quote after sending it. A corrected quote will be sent to you shortly."
        : "Your decision could not be recorded.",
    );
  }
  return {
    status: typeof result.status === "string" ? result.status : "",
    choice: typeof result.choice === "string" ? result.choice : null,
    idempotent: result.idempotent === true,
  };
}

import "server-only";

import crypto from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import { isQuotePricingQuarantineError } from "@/features/work-orders/lib/quotes/quotePricingQuarantine";
import { checkQuotePricingQuarantine } from "@/features/work-orders/server/quotePricingQuarantine";

type DB = Database;

export type QuoteApprovalDecision = "approve" | "decline" | "defer";
export type QuoteDecisionSource = "customer" | "shop";
export type QuoteDecisionContactMethod =
  | "phone"
  | "in_person"
  | "email"
  | "other";

export type RelinkQuoteLinePartsResult = {
  partRequestsRelinked: number;
  partRequestItemsRelinked: number;
  partRequestsAlreadyLinked: number;
  partRequestItemsAlreadyLinked: number;
  conflicts: Array<{
    table: "part_requests" | "part_request_items";
    id: string;
    currentWorkOrderLineId: string;
    targetWorkOrderLineId: string;
  }>;
};

type RpcError = {
  message: string;
  details?: string | null;
  hint?: string | null;
};
type RpcClient = {
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: RpcError | null }>;
};

type RpcResult = {
  ok?: boolean;
  quote_line_ids?: string[];
  work_order_line_ids?: string[];
  declined_remaining_quote_line_ids?: string[];
  approval_state?: string | null;
  part_relink?: Partial<RelinkQuoteLinePartsResult>;
  idempotent?: boolean;
  expired?: boolean;
  error?: string;
};

type DecisionResult = {
  ok: boolean;
  workOrderLineIds: string[];
  declinedRemainingQuoteLineIds: string[];
  approvalState: string | null;
  partRelink: RelinkQuoteLinePartsResult;
  idempotent?: boolean;
  expired?: boolean;
  pricingQuarantined?: boolean;
  error?: string;
};

function emptyPartRelinkResult(): RelinkQuoteLinePartsResult {
  return {
    partRequestsRelinked: 0,
    partRequestItemsRelinked: 0,
    partRequestsAlreadyLinked: 0,
    partRequestItemsAlreadyLinked: 0,
    conflicts: [],
  };
}

function stableDecisionKey(input: {
  quoteLineIds: string[];
  workOrderId: string;
  shopId: string;
  customerId: string | null;
  actorUserId: string;
  decision: QuoteApprovalDecision;
  declineRemaining: boolean;
}): string {
  const payload = JSON.stringify({
    shopId: input.shopId,
    workOrderId: input.workOrderId,
    quoteLineIds: [...input.quoteLineIds].sort(),
    customerId: input.customerId,
    actorUserId: input.actorUserId,
    decision: input.decision,
    declineRemaining: input.declineRemaining,
  });
  return crypto.createHash("sha256").update(payload).digest("hex");
}

function messageFromRpcError(error: RpcError): string {
  return [error.message, error.details, error.hint].filter(Boolean).join(" — ");
}

function decisionResultFromData(
  data: unknown,
  forceIdempotent = false,
): DecisionResult {
  const result = data && typeof data === "object" ? (data as RpcResult) : {};
  const workOrderLineIds = Array.isArray(result.work_order_line_ids)
    ? result.work_order_line_ids.filter(
        (id): id is string => typeof id === "string",
      )
    : [];
  const declinedRemainingQuoteLineIds = Array.isArray(
    result.declined_remaining_quote_line_ids,
  )
    ? result.declined_remaining_quote_line_ids.filter(
        (id): id is string => typeof id === "string",
      )
    : [];
  const partRelink: RelinkQuoteLinePartsResult = {
    ...emptyPartRelinkResult(),
    ...(result.part_relink ?? {}),
    conflicts: Array.isArray(result.part_relink?.conflicts)
      ? result.part_relink.conflicts
      : [],
  };

  return {
    ok: result.ok !== false,
    workOrderLineIds,
    declinedRemainingQuoteLineIds,
    approvalState:
      typeof result.approval_state === "string" ? result.approval_state : null,
    partRelink,
    idempotent: forceIdempotent || result.idempotent === true,
    expired: result.expired === true,
    error:
      result.ok === false && typeof result.error === "string"
        ? result.error
        : undefined,
  };
}

async function readDecisionReplay(params: {
  supabase: SupabaseClient<DB>;
  shopId: string;
  operationName: "customer_quote_decision" | "shop_quote_decision";
  operationKey: string;
}): Promise<DecisionResult | null> {
  const { data, error } = await params.supabase
    .from("quote_lifecycle_operation_keys")
    .select("result")
    .eq("shop_id", params.shopId)
    .eq("operation_name", params.operationName)
    .eq("operation_key", params.operationKey)
    .maybeSingle<{ result: unknown }>();

  if (error || !data) return null;
  return decisionResultFromData(data.result, true);
}

export async function applyWorkOrderQuoteLineDecision(params: {
  supabase: SupabaseClient<DB>;
  quoteLineIds: string[];
  workOrderId: string;
  shopId: string;
  customerId: string | null;
  actorUserId: string;
  decision: QuoteApprovalDecision;
  decisionSource?: QuoteDecisionSource;
  contactMethod?: QuoteDecisionContactMethod;
  decisionNote?: string | null;
  declineRemaining?: boolean;
  operationKey?: string;
  quarantineCheckSupabase?: SupabaseClient<DB>;
  operationReceiptSupabase?: SupabaseClient<DB>;
}): Promise<DecisionResult> {
  const quoteLineIds = [
    ...new Set(params.quoteLineIds.map((id) => id.trim()).filter(Boolean)),
  ];
  if (quoteLineIds.length === 0) {
    return {
      ok: false,
      workOrderLineIds: [],
      declinedRemainingQuoteLineIds: [],
      approvalState: null,
      partRelink: emptyPartRelinkResult(),
      error: "No quote line ids supplied",
    };
  }

  const declineRemaining = params.declineRemaining === true;
  const rawOperationKey =
    params.operationKey?.trim() ||
    stableDecisionKey({
      quoteLineIds,
      workOrderId: params.workOrderId,
      shopId: params.shopId,
      customerId: params.customerId,
      actorUserId: params.actorUserId,
      decision: params.decision,
      declineRemaining,
    });
  const isShopDecision = params.decisionSource === "shop";
  const durableOperationKey = isShopDecision
    ? `${params.shopId}:shop-quote-decision:${rawOperationKey}`
    : `${params.shopId}:quote-decision:${rawOperationKey}`;
  const replay = await readDecisionReplay({
    supabase: params.operationReceiptSupabase ?? createAdminSupabase(),
    shopId: params.shopId,
    operationName: isShopDecision
      ? "shop_quote_decision"
      : "customer_quote_decision",
    operationKey: durableOperationKey,
  });
  if (replay) return replay;

  const quarantineCheck = await checkQuotePricingQuarantine({
    supabase: params.quarantineCheckSupabase ?? params.supabase,
    shopId: params.shopId,
    workOrderId: params.workOrderId,
    quoteLineIds,
    includeSentRemaining: declineRemaining && params.decision === "approve",
    requireDecisionEligible: true,
  });
  if (!quarantineCheck.ok) {
    return {
      ok: false,
      workOrderLineIds: [],
      declinedRemainingQuoteLineIds: [],
      approvalState: null,
      partRelink: emptyPartRelinkResult(),
      pricingQuarantined: quarantineCheck.reason === "quarantined",
      error: quarantineCheck.error,
    };
  }

  const rpc = params.supabase as unknown as RpcClient;
  const rpcResult = isShopDecision
    ? await rpc.rpc("apply_shop_quote_decision_atomic", {
        p_shop_id: params.shopId,
        p_work_order_id: params.workOrderId,
        p_quote_line_ids: quoteLineIds,
        p_decision: params.decision,
        p_actor_user_id: params.actorUserId,
        p_contact_method: params.contactMethod ?? "other",
        p_note: params.decisionNote?.trim() || null,
        p_operation_key: durableOperationKey,
        p_at: new Date().toISOString(),
      })
    : await rpc.rpc("apply_portal_quote_decision_atomic", {
        p_shop_id: params.shopId,
        p_work_order_id: params.workOrderId,
        p_quote_line_ids: quoteLineIds,
        p_decision: params.decision,
        p_decline_remaining: declineRemaining,
        p_operation_key: durableOperationKey,
        p_at: new Date().toISOString(),
      });
  const { data, error } = rpcResult;

  if (error) {
    const message = messageFromRpcError(error);
    return {
      ok: false,
      workOrderLineIds: [],
      declinedRemainingQuoteLineIds: [],
      approvalState: null,
      partRelink: emptyPartRelinkResult(),
      pricingQuarantined: isQuotePricingQuarantineError(message),
      error: message,
    };
  }

  return decisionResultFromData(data);
}

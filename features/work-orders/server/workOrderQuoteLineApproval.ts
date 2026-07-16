import "server-only";

import crypto from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";
import {
  upsertMenuRepairItemFromQuoteLine,
  type UpsertMenuRepairItemFromQuoteLineResult,
} from "@/features/menu-repair-items/server/upsertMenuRepairItemFromQuoteLine";

type DB = Database;

export type QuoteApprovalDecision = "approve" | "decline" | "defer";

export type QuoteLineLearningResult = {
  quoteLineId: string;
  workOrderLineId: string;
  result: UpsertMenuRepairItemFromQuoteLineResult | null;
  error: string | null;
};

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

type RpcError = { message: string; details?: string | null; hint?: string | null };
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

export async function applyWorkOrderQuoteLineDecision(params: {
  supabase: SupabaseClient<DB>;
  quoteLineIds: string[];
  workOrderId: string;
  shopId: string;
  customerId: string | null;
  actorUserId: string;
  decision: QuoteApprovalDecision;
  declineRemaining?: boolean;
  operationKey?: string;
}): Promise<{
  ok: boolean;
  workOrderLineIds: string[];
  declinedRemainingQuoteLineIds: string[];
  approvalState: string | null;
  partRelink: RelinkQuoteLinePartsResult;
  menuRepairLearning: QuoteLineLearningResult[];
  idempotent?: boolean;
  error?: string;
}> {
  const quoteLineIds = [...new Set(params.quoteLineIds.map((id) => id.trim()).filter(Boolean))];
  if (quoteLineIds.length === 0) {
    return {
      ok: false,
      workOrderLineIds: [],
      declinedRemainingQuoteLineIds: [],
      approvalState: null,
      partRelink: emptyPartRelinkResult(),
      menuRepairLearning: [],
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

  const rpc = params.supabase as unknown as RpcClient;
  const { data, error } = await rpc.rpc("apply_customer_quote_decision_atomic", {
    p_shop_id: params.shopId,
    p_work_order_id: params.workOrderId,
    p_quote_line_ids: quoteLineIds,
    p_decision: params.decision,
    p_decline_remaining: declineRemaining,
    p_customer_id: params.customerId,
    p_actor_user_id: params.actorUserId,
    p_operation_key: `${params.shopId}:quote-decision:${rawOperationKey}`,
    p_at: new Date().toISOString(),
  });

  if (error) {
    return {
      ok: false,
      workOrderLineIds: [],
      declinedRemainingQuoteLineIds: [],
      approvalState: null,
      partRelink: emptyPartRelinkResult(),
      menuRepairLearning: [],
      error: messageFromRpcError(error),
    };
  }

  const result = data && typeof data === "object" ? (data as RpcResult) : {};
  const workOrderLineIds = Array.isArray(result.work_order_line_ids)
    ? result.work_order_line_ids.filter((id): id is string => typeof id === "string")
    : [];
  const committedQuoteLineIds = Array.isArray(result.quote_line_ids)
    ? result.quote_line_ids.filter((id): id is string => typeof id === "string")
    : quoteLineIds;
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

  const menuRepairLearning: QuoteLineLearningResult[] = [];
  if (params.decision === "approve" && workOrderLineIds.length > 0) {
    const { data: mappings } = await params.supabase
      .from("work_order_quote_lines")
      .select("id, work_order_line_id")
      .eq("shop_id", params.shopId)
      .eq("work_order_id", params.workOrderId)
      .in("id", committedQuoteLineIds);

    for (const mapping of mappings ?? []) {
      if (!mapping.work_order_line_id) continue;
      try {
        const learningResult = await upsertMenuRepairItemFromQuoteLine({
          supabase: params.supabase,
          shopId: params.shopId,
          workOrderId: params.workOrderId,
          quoteLineId: mapping.id,
          workOrderLineId: mapping.work_order_line_id,
          actorUserId: params.actorUserId,
        });
        menuRepairLearning.push({
          quoteLineId: mapping.id,
          workOrderLineId: mapping.work_order_line_id,
          result: learningResult,
          error: null,
        });
      } catch (learningError) {
        menuRepairLearning.push({
          quoteLineId: mapping.id,
          workOrderLineId: mapping.work_order_line_id,
          result: null,
          error:
            learningError instanceof Error
              ? learningError.message
              : "Unknown menu repair learning error",
        });
      }
    }
  }

  return {
    ok: result.ok !== false,
    workOrderLineIds,
    declinedRemainingQuoteLineIds,
    approvalState:
      typeof result.approval_state === "string" ? result.approval_state : null,
    partRelink,
    menuRepairLearning,
    idempotent: result.idempotent === true,
  };
}

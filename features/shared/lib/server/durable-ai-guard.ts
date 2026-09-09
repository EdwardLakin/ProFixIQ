import "server-only";

import type { createAdminSupabase } from "@/features/shared/lib/supabase/server";

// Every value here must also be present in the receipts table CHECK and in
// both quota RPCs, or a claim is rejected as AI_ROUTE_QUOTA_INPUT_INVALID at
// runtime while typechecking cleanly. See
// 20260909050000_extend_ai_route_quota_to_copilot.sql.
export type DurableAIFeature =
  | "dtc_suggest"
  | "inspection_interpret"
  | "technician_copilot_text";

type AdminClient = ReturnType<typeof createAdminSupabase>;

type DurablePolicy = {
  actorMax: number;
  shopMax: number;
  windowSeconds: number;
  hardBudgetUsd: number;
  reservationCostUsd: number;
};

const DURABLE_POLICIES: Record<DurableAIFeature, DurablePolicy> = {
  dtc_suggest: {
    actorMax: 20,
    shopMax: 80,
    windowSeconds: 5 * 60,
    hardBudgetUsd: 75,
    reservationCostUsd: 0.1,
  },
  // One claim per CoPilot turn, covering both model calls that turn makes.
  // 120 turns / 5 min per technician is far above any human conversational
  // rate, so this bounds a runaway without touching ordinary use. The budget
  // is the real per-shop monthly ceiling.
  technician_copilot_text: {
    actorMax: 120,
    shopMax: 480,
    windowSeconds: 5 * 60,
    hardBudgetUsd: 600,
    reservationCostUsd: 0.02,
  },
  inspection_interpret: {
    actorMax: 60,
    shopMax: 240,
    windowSeconds: 5 * 60,
    hardBudgetUsd: 50,
    reservationCostUsd: 0.03,
  },
};

type QuotaRow = {
  allowed: boolean;
  denial_reason: string | null;
  retry_after_seconds: number;
  receipt_id: string | null;
};

export type DurableAIClaim =
  | { allowed: true; receiptId: string }
  | {
      allowed: false;
      reason: "rate_limited" | "hard_budget_exceeded";
      retryAfterSeconds: number;
    };

export async function claimDurableAIRouteQuota(input: {
  admin: AdminClient;
  feature: DurableAIFeature;
  shopId: string;
  actorId: string;
}): Promise<DurableAIClaim> {
  const policy = DURABLE_POLICIES[input.feature];
  const { data, error } = await input.admin.rpc("consume_ai_route_quota", {
    p_actor_id: input.actorId,
    p_actor_max: policy.actorMax,
    p_feature: input.feature,
    p_hard_budget_usd: policy.hardBudgetUsd,
    p_reservation_cost_usd: policy.reservationCostUsd,
    p_shop_id: input.shopId,
    p_shop_max: policy.shopMax,
    p_window_seconds: policy.windowSeconds,
  });

  if (error) {
    throw new Error(`AI route quota unavailable (${error.code ?? "unknown"})`);
  }

  const row = Array.isArray(data) ? (data[0] as QuotaRow | undefined) : undefined;
  if (row?.allowed && row.receipt_id) {
    return { allowed: true, receiptId: row.receipt_id };
  }

  return {
    allowed: false,
    reason:
      row?.denial_reason === "hard_budget_exceeded"
        ? "hard_budget_exceeded"
        : "rate_limited",
    retryAfterSeconds: Math.max(1, row?.retry_after_seconds ?? 60),
  };
}

export async function completeDurableAIRouteQuota(input: {
  admin: AdminClient;
  feature: DurableAIFeature;
  shopId: string;
  actorId: string;
  receiptId: string;
  actualCostUsd: number;
  succeeded: boolean;
}): Promise<void> {
  const { data, error } = await input.admin.rpc("complete_ai_route_quota", {
    p_actor_id: input.actorId,
    p_actual_cost_usd: Math.max(0, input.actualCostUsd),
    p_feature: input.feature,
    p_receipt_id: input.receiptId,
    p_shop_id: input.shopId,
    p_succeeded: input.succeeded,
  });

  if (error || data !== true) {
    console.error("ai_route_quota_completion_failed", {
      actorId: input.actorId,
      feature: input.feature,
      shopId: input.shopId,
      code: error?.code ?? "receipt_not_reserved",
    });
  }
}

import "server-only";

import { estimateCopilotTurnCostUsd } from "@/features/shared/lib/server/ai-ops-guard";
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

function envNum(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

function copilotPolicy(): DurablePolicy {
  const actorMax = Math.max(
    1,
    Math.floor(envNum("AI_RATE_LIMIT_COPILOT_TEXT_MAX", 120)),
  );
  const shopMax = Math.max(
    actorMax,
    Math.floor(envNum("AI_RATE_LIMIT_COPILOT_TEXT_SHOP_MAX", 480)),
  );
  const windowMs = Math.max(
    1000,
    envNum("AI_RATE_LIMIT_COPILOT_TEXT_WINDOW_MS", 5 * 60 * 1000),
  );

  return {
    actorMax,
    shopMax,
    windowSeconds: Math.max(1, Math.ceil(windowMs / 1000)),
    hardBudgetUsd: Math.max(
      0.01,
      envNum("AI_BUDGET_HARD_USD_COPILOT_TEXT", 600),
    ),
    reservationCostUsd: Math.max(0, estimateCopilotTurnCostUsd()),
  };
}

function durablePolicy(feature: DurableAIFeature): DurablePolicy {
  if (feature === "technician_copilot_text") return copilotPolicy();
  if (feature === "dtc_suggest") {
    return {
      actorMax: 20,
      shopMax: 80,
      windowSeconds: 5 * 60,
      hardBudgetUsd: 75,
      reservationCostUsd: 0.1,
    };
  }
  return {
    actorMax: 60,
    shopMax: 240,
    windowSeconds: 5 * 60,
    hardBudgetUsd: 50,
    reservationCostUsd: 0.03,
  };
}

export function getDurableAIReservationCostUsd(
  feature: DurableAIFeature,
): number {
  return durablePolicy(feature).reservationCostUsd;
}

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
  const policy = durablePolicy(input.feature);
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

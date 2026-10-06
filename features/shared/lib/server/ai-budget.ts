import "server-only";

import { estimateMaxOpenAITextCostUsd } from "@/features/shared/lib/server/ai-cost";
import type { createAdminSupabase } from "@/features/shared/lib/supabase/server";

/**
 * Funded shop AI budget: atomic, durable reservations.
 *
 * A call reserves an upper-bound cost before it reaches the provider, then
 * commits the actual cost (or releases the hold if the provider was never
 * called). The balance, subpool caps and idempotency all live in Postgres
 * (reserve_ai_budget / commit_ai_budget / release_ai_budget), so parallel
 * serverless instances cannot overspend a shared balance.
 *
 * Nothing calls this yet. Every shop starts in 'shadow' mode, where decisions
 * are recorded (wouldDeny) but never block a call.
 */

type AdminClient = ReturnType<typeof createAdminSupabase>;

/** Used when a model has no rate card, so an unpriced call still holds budget. */
export const AI_BUDGET_UNPRICED_RESERVATION_USD = 0.25;

const POOL_BY_FEATURE: Record<string, string> = {
  technician_copilot_text: "copilot",
  technician_copilot_documentation: "copilot",
  technician_copilot_speech: "voice",
  inspection_voice_speech: "voice",
  openai_realtime_token: "voice",
  inspection_interpret: "inspection",
  inspection_template_generate: "inspection",
  inspection_template_build_from_prompt: "inspection",
  inspection_form_import_page: "inspection",
  work_order_documentation_rewrite: "documentation",
  assistant_export_documentation: "documentation",
  shop_assistant_planner: "assistant",
  shop_assistant_diagnostic_answer: "assistant",
  shop_assistant_daily_summary: "assistant",
  branding_generate_logo: "branding",
};

/** Subpool for a feature. Unlisted features share the `general` pool. */
export function aiBudgetPoolForFeature(feature: string): string {
  return POOL_BY_FEATURE[feature] ?? "general";
}

/**
 * Upper-bound hold for one text call. Falls back to a fixed hold when the model
 * is unpriced, so a call with no rate card still reserves something.
 */
export function estimateAIBudgetReservationUsd(input: {
  model: string | null;
  maxPromptTokens: number;
  maxCompletionTokens: number;
}): number {
  return (
    estimateMaxOpenAITextCostUsd(input) ?? AI_BUDGET_UNPRICED_RESERVATION_USD
  );
}

export type AIBudgetDenialReason = "insufficient_balance" | "pool_cap_exceeded";

export type AIBudgetReservation = {
  reservationId: string;
  /** 'shadow_allowed' means a real denial would have happened but is not enforced. */
  decision: "allowed" | "shadow_allowed";
  wouldDeny: boolean;
  reason: AIBudgetDenialReason | null;
  availableUsd: number;
  poolRemainingUsd: number | null;
  replayed: boolean;
};

export class AIBudgetDeniedError extends Error {
  constructor(
    public readonly reason: AIBudgetDenialReason,
    public readonly availableUsd: number,
    public readonly poolRemainingUsd: number | null,
  ) {
    super(`AI budget denied: ${reason}`);
    this.name = "AIBudgetDeniedError";
  }
}

export class AIBudgetUnavailableError extends Error {
  constructor(public readonly code: string) {
    super(`AI budget unavailable (${code})`);
    this.name = "AIBudgetUnavailableError";
  }
}

/** The provider was never called, so the hold can be released in full. */
export class AIProviderNotCalledError extends Error {
  constructor(cause?: unknown) {
    super("AI provider was not called");
    this.name = "AIProviderNotCalledError";
    this.cause = cause;
  }
}

type ReserveRow = {
  decision: string;
  denial_reason: string | null;
  reservation_id: string | null;
  available_usd: number | string | null;
  pool_remaining_usd: number | string | null;
  replayed: boolean | null;
};

type SettleRow = { settled: boolean | null };

function numberOrNull(value: unknown): number | null {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function denialReason(value: unknown): AIBudgetDenialReason | null {
  return value === "pool_cap_exceeded" || value === "insufficient_balance"
    ? value
    : null;
}

export async function reserveAIBudget(input: {
  admin: AdminClient;
  shopId: string;
  feature: string;
  amountUsd: number;
  idempotencyKey: string;
  pool?: string;
  actorId?: string | null;
  ttlSeconds?: number;
}): Promise<AIBudgetReservation> {
  const { data, error } = await input.admin.rpc("reserve_ai_budget", {
    p_shop_id: input.shopId,
    p_pool: input.pool ?? aiBudgetPoolForFeature(input.feature),
    p_feature: input.feature,
    p_amount_usd: Math.max(0, input.amountUsd),
    p_idempotency_key: input.idempotencyKey,
    p_actor_id: input.actorId ?? undefined,
    p_ttl_seconds: input.ttlSeconds ?? undefined,
  });

  if (error) throw new AIBudgetUnavailableError(error.code ?? "unknown");

  const row = Array.isArray(data) ? (data[0] as ReserveRow | undefined) : undefined;
  if (!row?.reservation_id) throw new AIBudgetUnavailableError("empty_result");

  const availableUsd = numberOrNull(row.available_usd) ?? 0;
  const poolRemainingUsd = numberOrNull(row.pool_remaining_usd);
  const reason = denialReason(row.denial_reason);

  if (row.decision === "denied" && reason) {
    throw new AIBudgetDeniedError(reason, availableUsd, poolRemainingUsd);
  }
  if (row.decision !== "allowed" && row.decision !== "shadow_allowed") {
    // A replay of a released/denied key, or an unknown decision: do not run the call.
    throw new AIBudgetUnavailableError(`unexpected_decision_${row.decision}`);
  }

  return {
    reservationId: row.reservation_id,
    decision: row.decision,
    wouldDeny: reason !== null,
    reason,
    availableUsd,
    poolRemainingUsd,
    replayed: Boolean(row.replayed),
  };
}

/**
 * Settle a hold. `actualCostUsd: null` means the provider returned no billable
 * usage; the reservation is then kept as the cost rather than treated as $0.
 * Returns false (and logs) instead of throwing, so settlement never fails a
 * call that already succeeded.
 */
export async function commitAIBudget(input: {
  admin: AdminClient;
  shopId: string;
  reservationId: string;
  actualCostUsd: number | null;
}): Promise<boolean> {
  const { data, error } = await input.admin.rpc("commit_ai_budget", {
    p_reservation_id: input.reservationId,
    p_shop_id: input.shopId,
    p_actual_usd: input.actualCostUsd == null ? (null as never) : Math.max(0, input.actualCostUsd),
  });
  if (error) {
    console.error("ai_budget_commit_failed", {
      shopId: input.shopId,
      reservationId: input.reservationId,
      code: error.code ?? "unknown",
    });
    return false;
  }
  return Array.isArray(data) ? Boolean((data[0] as SettleRow | undefined)?.settled) : false;
}

export async function releaseAIBudget(input: {
  admin: AdminClient;
  shopId: string;
  reservationId: string;
}): Promise<boolean> {
  const { data, error } = await input.admin.rpc("release_ai_budget", {
    p_reservation_id: input.reservationId,
    p_shop_id: input.shopId,
  });
  if (error) {
    console.error("ai_budget_release_failed", {
      shopId: input.shopId,
      reservationId: input.reservationId,
      code: error.code ?? "unknown",
    });
    return false;
  }
  return Array.isArray(data) ? Boolean((data[0] as SettleRow | undefined)?.settled) : false;
}

export type AIBudgetOperationResult<T> = {
  output: T;
  /** Actual cost from the ledger rate card, or null when usage/pricing is unknown. */
  actualCostUsd: number | null;
};

/**
 * Reserve, run the provider call, then settle.
 *
 * - Denied: throws AIBudgetDeniedError before the call.
 * - Budget service down: `onUnavailable` decides. 'deny' throws; 'allow' runs
 *   the call unbudgeted (log only), which is the shadow-rollout choice.
 * - Call throws AIProviderNotCalledError: hold released in full.
 * - Call throws anything else: the provider may have billed, so the hold is
 *   committed at the reserved amount and the error is re-thrown.
 */
export async function withAIBudget<T>(
  config: {
    admin: AdminClient;
    shopId: string;
    feature: string;
    amountUsd: number;
    idempotencyKey: string;
    pool?: string;
    actorId?: string | null;
    onUnavailable: "allow" | "deny";
  },
  operation: (reservation: AIBudgetReservation | null) => Promise<AIBudgetOperationResult<T>>,
): Promise<T> {
  let reservation: AIBudgetReservation | null = null;
  try {
    reservation = await reserveAIBudget(config);
  } catch (error) {
    if (error instanceof AIBudgetDeniedError) throw error;
    if (config.onUnavailable === "deny") throw error;
    console.error("ai_budget_unavailable_allowing_call", {
      shopId: config.shopId,
      feature: config.feature,
      code: error instanceof AIBudgetUnavailableError ? error.code : "unknown",
    });
  }

  try {
    const result = await operation(reservation);
    if (reservation) {
      await commitAIBudget({
        admin: config.admin,
        shopId: config.shopId,
        reservationId: reservation.reservationId,
        actualCostUsd: result.actualCostUsd,
      });
    }
    return result.output;
  } catch (error) {
    if (reservation) {
      if (error instanceof AIProviderNotCalledError) {
        await releaseAIBudget({
          admin: config.admin,
          shopId: config.shopId,
          reservationId: reservation.reservationId,
        });
      } else {
        await commitAIBudget({
          admin: config.admin,
          shopId: config.shopId,
          reservationId: reservation.reservationId,
          actualCostUsd: null,
        });
      }
    }
    throw error;
  }
}

export async function getAIBudgetStatus(input: {
  admin: AdminClient;
  shopId: string;
}): Promise<Record<string, unknown> | null> {
  const { data, error } = await input.admin.rpc("get_ai_budget_status", {
    p_shop_id: input.shopId,
  });
  if (error || !data || typeof data !== "object") return null;
  return data as Record<string, unknown>;
}

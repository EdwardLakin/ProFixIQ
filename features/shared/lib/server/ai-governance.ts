import "server-only";

import { randomUUID } from "node:crypto";

import {
  estimateOpenAIEmbeddingCostUsd,
  estimateOpenAITextCostUsd,
} from "@/features/shared/lib/server/ai-cost";
import {
  AIBudgetDeniedError,
  AIBudgetUnavailableError,
  AIProviderNotCalledError,
  aiBudgetPoolForFeature,
  estimateAIBudgetReservationUsd,
  withAIBudget,
} from "@/features/shared/lib/server/ai-budget";
import { readOpenAIUsage } from "@/features/shared/lib/server/ai-usage-reader";
import { getAIPolicy, type AIFeature } from "@/features/shared/lib/server/ai-policy";
import { getAITelemetryContext } from "@/features/shared/lib/server/ai-telemetry-context";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";

/**
 * Spend governance for non-voice AI provider calls.
 *
 * Every governed call reserves an upper-bound cost against the shop's funded
 * budget before it reaches the provider, then settles the real cost. A shop in
 * `shadow` mode (the default) is never blocked; the decision is recorded so the
 * would-deny rate can be reviewed before enforcement is switched on.
 *
 * Controls (environment):
 *   AI_BUDGET_GOVERNANCE=off        skip governance entirely (kill switch).
 *   AI_GOVERNANCE_FAIL_CLOSED=1     refuse a call when the budget service is
 *                                   down, instead of running it ungoverned.
 */

export type AIGovernanceContext = {
  feature: string;
  endpoint: string;
  /**
   * Omit to inherit the ambient `withAITelemetryContext` shop. A call with no
   * shop (null or no ambient context) is ungoverned: budgets are per shop.
   */
  shopId?: string | null;
  userId?: string | null;
  model: string | null;
  modality?: "text" | "speech" | "image" | "embedding" | "other";
  /** Override the hold, in USD. */
  amountUsd?: number;
  /** Token ceilings used to size the hold when `amountUsd` is not given. */
  maxPromptTokens?: number;
  maxCompletionTokens?: number;
  /** Stable key when the caller can retry the same logical call. */
  idempotencyKey?: string;
};

const DEFAULT_MAX_PROMPT_TOKENS = 8_000;
const DEFAULT_MAX_COMPLETION_TOKENS = 1_500;
/** Vision and document features send images, which cost far more input. */
const VISION_MAX_PROMPT_TOKENS = 16_000;
const EMBEDDING_HOLD_USD = 0.01;

/** HTTP statuses on which a provider does not bill the request. */
const NOT_BILLED_STATUSES = new Set([400, 401, 403, 404, 409, 422, 429]);

export function isAIGovernanceEnabled(): boolean {
  return process.env.AI_BUDGET_GOVERNANCE?.trim().toLowerCase() !== "off";
}

export function isAIGovernanceFailClosed(): boolean {
  const value = process.env.AI_GOVERNANCE_FAIL_CLOSED?.trim().toLowerCase();
  return value === "1" || value === "true";
}

function policyMaxTokens(feature: string): number | null {
  try {
    const policy = getAIPolicy(feature as AIFeature);
    return policy?.feature === feature && policy.maxTokens > 0 ? policy.maxTokens : null;
  } catch {
    return null;
  }
}

/** Upper-bound hold for one call. Exported for tests and callers that size their own. */
export function estimateAIGovernanceHoldUsd(context: AIGovernanceContext): number {
  if (context.amountUsd != null) return context.amountUsd;
  if (context.modality === "embedding") return EMBEDDING_HOLD_USD;
  if (context.modality === "image" || context.modality === "speech") {
    return estimateAIBudgetReservationUsd({
      model: null,
      maxPromptTokens: 0,
      maxCompletionTokens: 0,
    });
  }
  return estimateAIBudgetReservationUsd({
    model: context.model,
    maxPromptTokens:
      context.maxPromptTokens ??
      (/vision|ocr|import|image|photo/i.test(context.feature)
        ? VISION_MAX_PROMPT_TOKENS
        : DEFAULT_MAX_PROMPT_TOKENS),
    maxCompletionTokens:
      context.maxCompletionTokens ??
      policyMaxTokens(context.feature) ??
      DEFAULT_MAX_COMPLETION_TOKENS,
  });
}

/**
 * Real cost of a provider response, or null when it cannot be priced (unknown
 * model, or usage not returned). Null makes settlement keep the reservation.
 */
export function actualAICostUsd(
  context: Pick<AIGovernanceContext, "model" | "modality">,
  response: unknown,
): number | null {
  const usage = readOpenAIUsage(response);
  if (context.modality === "embedding") {
    return estimateOpenAIEmbeddingCostUsd(context.model, usage.promptTokens);
  }
  if (context.modality && context.modality !== "text") return null;
  return estimateOpenAITextCostUsd({
    model: context.model,
    promptTokens: usage.promptTokens,
    cachedPromptTokens: usage.cachedPromptTokens,
    completionTokens: usage.completionTokens,
  });
}

function providerStatus(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;
  const status = (error as { status?: unknown }).status;
  return typeof status === "number" ? status : null;
}

export function isAIBudgetDenied(error: unknown): error is AIBudgetDeniedError {
  return error instanceof AIBudgetDeniedError;
}

/**
 * Run one provider call under budget governance.
 *
 * - No shop, governance off: the call runs untouched.
 * - Shadow shop: the call always runs; the decision is recorded.
 * - Enforcing shop out of budget: throws AIBudgetDeniedError before the call.
 * - Budget service down: runs the call ungoverned, unless AI_GOVERNANCE_FAIL_CLOSED.
 * - Provider error that proves nothing was billed (400/401/403/404/409/422/429):
 *   the hold is released. Any other error keeps the hold, because the provider
 *   may have billed. The original error is always the one re-thrown.
 */
export async function governAICall<R>(
  context: AIGovernanceContext,
  call: () => Promise<R>,
  options?: {
    /** Real cost of the result when it is not a raw provider response. */
    actualCostUsd?: (result: R) => number | null;
  },
): Promise<R> {
  if (!isAIGovernanceEnabled()) return call();

  const ambient = getAITelemetryContext();
  const shopId = context.shopId === undefined ? (ambient?.shopId ?? null) : context.shopId;
  if (!shopId) return call();

  const userId = context.userId === undefined ? (ambient?.userId ?? null) : context.userId;
  const hold = estimateAIGovernanceHoldUsd(context);

  // Governance infrastructure must never take the AI call down. If the budget
  // client cannot even be built (for example a missing service credential),
  // treat it exactly like the budget service being unavailable.
  let admin: ReturnType<typeof createAdminSupabase>;
  try {
    admin = createAdminSupabase();
  } catch (error) {
    if (isAIGovernanceFailClosed()) {
      throw new AIBudgetUnavailableError("admin_client_unavailable");
    }
    console.error("ai_budget_unavailable_allowing_call", {
      shopId,
      feature: context.feature,
      code: "admin_client_unavailable",
      error: error instanceof Error ? error.message.slice(0, 120) : "unknown_error",
    });
    return call();
  }

  try {
    return await withAIBudget<R>(
      {
        admin,
        shopId,
        feature: context.feature,
        pool: aiBudgetPoolForFeature(context.feature),
        amountUsd: hold,
        idempotencyKey: context.idempotencyKey ?? `gov:${context.feature}:${randomUUID()}`,
        actorId: userId,
        onUnavailable: isAIGovernanceFailClosed() ? "deny" : "allow",
      },
      async (reservation) => {
        if (reservation?.wouldDeny) {
          console.warn(
            JSON.stringify({
              type: "ai_budget_shadow_would_deny",
              feature: context.feature,
              endpoint: context.endpoint,
              shop_id: shopId,
              reason: reservation.reason,
              hold_usd: hold,
            }),
          );
        }
        let response: R;
        try {
          response = await call();
        } catch (error) {
          const status = providerStatus(error);
          if (status != null && NOT_BILLED_STATUSES.has(status)) {
            throw new AIProviderNotCalledError(error);
          }
          throw error;
        }
        return {
          output: response,
          actualCostUsd: options?.actualCostUsd
            ? options.actualCostUsd(response)
            : actualAICostUsd(context, response),
        };
      },
    );
  } catch (error) {
    // withAIBudget re-throws AIProviderNotCalledError after releasing the hold;
    // callers must see the provider's own error, not the governance wrapper.
    if (error instanceof AIProviderNotCalledError && error.cause) throw error.cause;
    throw error;
  }
}

/**
 * JSON body for an out-of-budget response (HTTP 402). Reasons are stable codes;
 * the message never exposes balances.
 */
export function aiBudgetDeniedBody(error: AIBudgetDeniedError): {
  error: string;
  code: "ai_budget_exceeded";
  reason: AIBudgetDeniedError["reason"];
} {
  return {
    error:
      error.reason === "pool_cap_exceeded"
        ? "This shop has reached its AI limit for this feature."
        : "This shop's AI budget is used up.",
    code: "ai_budget_exceeded",
    reason: error.reason,
  };
}

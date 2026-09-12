import "server-only";

import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import {
  estimateCopilotTurnCostUsd,
  registerAIUsageEvent,
} from "@/features/shared/lib/server/ai-ops-guard";
import {
  claimDurableAIRouteQuota,
  completeDurableAIRouteQuota,
} from "@/features/shared/lib/server/durable-ai-guard";
import { withAITelemetryContext } from "@/features/shared/lib/server/ai-telemetry-context";
import { runTechnicianCopilotTurn } from "./chat";
import { sendCopilotServerCommand } from "./transport";

export class TechnicianCopilotQuotaError extends Error {
  readonly status: 402 | 429;

  constructor(
    public readonly code: "rate_limited" | "hard_budget_exceeded",
    public readonly retryAfterSeconds: number,
  ) {
    super(
      code === "hard_budget_exceeded"
        ? "This shop has reached its monthly CoPilot budget."
        : "CoPilot is temporarily rate limited. Retry shortly.",
    );
    this.name = "TechnicianCopilotQuotaError";
    this.status = code === "hard_budget_exceeded" ? 402 : 429;
  }
}

type TurnInput = Parameters<typeof runTechnicianCopilotTurn>[0];
type TurnResult = Awaited<ReturnType<typeof runTechnicianCopilotTurn>>;

type ReplayEvent = {
  eventType: string;
  payload?: Record<string, unknown> | null;
};

type ReplayEnvelope = {
  session: { id: string; status: string } | null;
  events: ReplayEvent[];
  documentationTurns?: string[];
};

function storedActionForTurn(events: readonly ReplayEvent[], turnId: string) {
  return events.find(
    (event) =>
      event.eventType === "action.pending" && event.payload?.turnId === turnId,
  );
}

function successfulCompletionForTurn(
  events: readonly ReplayEvent[],
  turnId: string,
): boolean {
  const pending = storedActionForTurn(events, turnId);
  const request = pending?.payload?.request;
  if (!request || typeof request !== "object" || Array.isArray(request)) return false;
  if ((request as Record<string, unknown>).type !== "job.complete") return false;
  const key = typeof pending?.payload?.key === "string" ? pending.payload.key : null;
  if (!key) return false;
  return events.some(
    (event) =>
      event.eventType === "action.completed" &&
      event.payload?.turnId === turnId &&
      event.payload?.key === key &&
      event.payload?.ok === true,
  );
}

function recordDurableDenial(input: {
  endpoint: string;
  shopId: string;
  actorId: string;
  turnId: string;
  reason: "rate_limited" | "hard_budget_exceeded";
  retryAfterSeconds: number;
}) {
  // Durable quota decisions happen in Postgres, while ai-ops-guard's anomaly
  // buckets are intentionally per-instance. Emit the same structured alert
  // envelope here so an actual durable denial is never invisible merely
  // because the in-memory guard was not the enforcing layer.
  console.warn(
    JSON.stringify({
      type: "ai_anomaly_alert",
      alert_type:
        input.reason === "hard_budget_exceeded"
          ? "hard_budget_denial"
          : "rate_limit_exceeded",
      feature: "technician_copilot_text",
      endpoint: input.endpoint,
      shop_id: input.shopId,
      actor_id: input.actorId,
      turn_id: input.turnId,
      emitted_at: new Date().toISOString(),
      details: {
        source: "durable_quota",
        retryAfterSeconds: input.retryAfterSeconds,
      },
    }),
  );
}

/**
 * The canonical turn service has deliberate replay exits before either provider
 * call. Check those persisted facts before reserving quota so a browser/mobile
 * retry with the same turnId cannot consume another rate/budget slot when no
 * OpenAI work will run.
 */
async function turnMayCallProvider(input: TurnInput): Promise<boolean> {
  try {
    const envelope = await sendCopilotServerCommand<ReplayEnvelope>({
      authUserId: input.identity.authUserId,
      profileId: input.identity.profileId,
      shopId: input.identity.shopId,
      action: "session.read",
      args: { sessionId: input.sessionId ?? null },
    });

    if (!envelope.session) return true;
    if (envelope.session.status === "closed") return false;

    const assistantExists = envelope.events.some(
      (event) =>
        event.eventType === "conversation.assistant" &&
        event.payload?.turnId === input.turnId,
    );
    const documentationFinalized =
      envelope.documentationTurns?.includes(input.turnId) ?? false;
    const storedAction = storedActionForTurn(envelope.events, input.turnId);

    if (!input.identity.documentationEnabled) {
      return !assistantExists && !storedAction;
    }

    if (
      assistantExists &&
      documentationFinalized &&
      !successfulCompletionForTurn(envelope.events, input.turnId)
    ) {
      return false;
    }

    return true;
  } catch (error) {
    console.warn("technician_copilot_replay_preflight_unavailable", {
      shopId: input.identity.shopId,
      turnId: input.turnId,
      error: error instanceof Error ? error.message.slice(0, 200) : "unknown_error",
    });
    return true;
  }
}

export async function runGovernedTechnicianCopilotTurn(input: {
  endpoint: string;
  turn: TurnInput;
}): Promise<TurnResult> {
  const { turn } = input;
  const mayCallProvider = await turnMayCallProvider(turn);

  if (!mayCallProvider) {
    return withAITelemetryContext(
      {
        endpoint: input.endpoint,
        shopId: turn.identity.shopId,
        userId: turn.identity.profileId,
      },
      () => runTechnicianCopilotTurn(turn),
    );
  }

  const admin = createAdminSupabase();
  const turnCostUsd = estimateCopilotTurnCostUsd();
  let receiptId: string | null = null;
  try {
    const claim = await claimDurableAIRouteQuota({
      admin,
      feature: "technician_copilot_text",
      shopId: turn.identity.shopId,
      actorId: turn.identity.profileId,
    });
    if (!claim.allowed) {
      recordDurableDenial({
        endpoint: input.endpoint,
        shopId: turn.identity.shopId,
        actorId: turn.identity.profileId,
        turnId: turn.turnId,
        reason: claim.reason,
        retryAfterSeconds: claim.retryAfterSeconds,
      });
      throw new TechnicianCopilotQuotaError(
        claim.reason,
        claim.retryAfterSeconds,
      );
    }
    receiptId = claim.receiptId;
  } catch (error) {
    if (error instanceof TechnicianCopilotQuotaError) throw error;
    console.error("technician_copilot_quota_unavailable", {
      shopId: turn.identity.shopId,
      turnId: turn.turnId,
      error: error instanceof Error ? error.message.slice(0, 200) : "unknown_error",
    });
  }

  try {
    const result = await withAITelemetryContext(
      {
        endpoint: input.endpoint,
        shopId: turn.identity.shopId,
        userId: turn.identity.profileId,
      },
      () => runTechnicianCopilotTurn(turn),
    );

    // A turn that short-circuited on persisted replay state reached no
    // provider, so it must not consume the reservation's proxy cost: a client
    // retrying one turnId would otherwise inflate the shop's monthly budget
    // without any spend behind it. Any turn that did call a provider still
    // settles the full conservative proxy, so this can only ever bill less
    // than the work performed, never more.
    const settledCostUsd = result.modelCalls > 0 ? turnCostUsd : 0;

    if (receiptId) {
      await completeDurableAIRouteQuota({
        admin,
        feature: "technician_copilot_text",
        shopId: turn.identity.shopId,
        actorId: turn.identity.profileId,
        receiptId,
        actualCostUsd: settledCostUsd,
        succeeded: true,
      });
    }

    registerAIUsageEvent({
      feature: "technician_copilot_text",
      endpoint: input.endpoint,
      shopId: turn.identity.shopId,
      model: null,
      totalTokens: null,
      estimatedCostUsd: settledCostUsd,
      status: "success",
      errorCode: null,
    });

    return result;
  } catch (error) {
    if (receiptId) {
      // Keep the reservation's conservative per-turn proxy in the monthly
      // budget on failure. OpenAI may already have returned billable tokens
      // before JSON parsing/validation failed, and settling at $0 would let
      // repeated malformed responses bypass the hard spend ceiling.
      await completeDurableAIRouteQuota({
        admin,
        feature: "technician_copilot_text",
        shopId: turn.identity.shopId,
        actorId: turn.identity.profileId,
        receiptId,
        actualCostUsd: turnCostUsd,
        succeeded: false,
      });
    }
    registerAIUsageEvent({
      feature: "technician_copilot_text",
      endpoint: input.endpoint,
      shopId: turn.identity.shopId,
      model: null,
      totalTokens: null,
      estimatedCostUsd: turnCostUsd,
      status: "error",
      errorCode: error instanceof Error ? error.name : "unknown_error",
    });
    throw error;
  }
}

import "server-only";

import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import {
  estimateCopilotTurnCostUsd,
  registerAIUsageEvent,
} from "@/features/shared/lib/server/ai-ops-guard";
import {
  claimDurableAIRouteQuota,
  completeDurableAIRouteQuota,
  DurableAIQuotaUnavailableError,
} from "@/features/shared/lib/server/durable-ai-guard";
import { withAITelemetryContext } from "@/features/shared/lib/server/ai-telemetry-context";
import { runTechnicianCopilotTurn } from "./chat";
import { sendCopilotServerCommand } from "./transport";

const QUOTA_ERROR_MESSAGES = {
  hard_budget_exceeded:
    "This shop has reached its monthly AI fair-use limit. Core shop workflows remain available.",
  rate_limited: "CoPilot is temporarily rate limited. Retry shortly.",
  governance_unavailable:
    "CoPilot spend controls are unavailable. Retry shortly.",
} as const;

export type TechnicianCopilotQuotaCode = keyof typeof QUOTA_ERROR_MESSAGES;

/** Seconds to advertise when spend governance itself is the blocker. */
export const GOVERNANCE_UNAVAILABLE_RETRY_SECONDS = 60;

export class TechnicianCopilotQuotaError extends Error {
  readonly status: 402 | 429;

  constructor(
    public readonly code: TechnicianCopilotQuotaCode,
    public readonly retryAfterSeconds: number,
  ) {
    super(QUOTA_ERROR_MESSAGES[code]);
    this.name = "TechnicianCopilotQuotaError";
    // Only an exhausted monthly ceiling is terminal. A throttle and a missing
    // governance layer both clear on their own, and the client preserves the
    // technician's pending intent for 429 while discarding it for anything
    // else, so neither may be surfaced as terminal.
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
  reason: TechnicianCopilotQuotaCode;
  retryAfterSeconds: number;
}) {
  console.warn(
    JSON.stringify({
      type: "ai_anomaly_alert",
      alert_type:
        input.reason === "hard_budget_exceeded"
          ? "hard_budget_denial"
          : input.reason === "governance_unavailable"
            ? "governance_unavailable"
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

    // Fair-use accounting is a financial safety boundary. If that boundary is
    // unavailable, do not send an unmetered provider request. The AI surface
    // fails retryably while the technician's non-AI workflow remains usable.
    console.error("technician_copilot_quota_unavailable", {
      shopId: turn.identity.shopId,
      turnId: turn.turnId,
      code:
        error instanceof DurableAIQuotaUnavailableError
          ? error.code
          : "fair_use_governance_error",
      error: error instanceof Error ? error.message.slice(0, 200) : "unknown_error",
    });
    recordDurableDenial({
      endpoint: input.endpoint,
      shopId: turn.identity.shopId,
      actorId: turn.identity.profileId,
      turnId: turn.turnId,
      reason: "governance_unavailable",
      retryAfterSeconds: GOVERNANCE_UNAVAILABLE_RETRY_SECONDS,
    });
    throw new TechnicianCopilotQuotaError(
      "governance_unavailable",
      GOVERNANCE_UNAVAILABLE_RETRY_SECONDS,
    );
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

export type AgentRequestRetryAction = "resubmit" | "resume" | "synchronize";

type RetryState = {
  requestStatus: string;
  caseStatus?: string | null;
  stepStatus?: string | null;
};

export type AgentRequestRetryDecision = {
  allowed: boolean;
  action: AgentRequestRetryAction | null;
  reason: string;
};

/**
 * Keep retry decisions explicit so a double click or stale console projection
 * cannot duplicate active Agent work.
 */
export function decideAgentRequestRetry(
  state: RetryState,
): AgentRequestRetryDecision {
  const requestStatus = state.requestStatus.trim().toLowerCase();
  const caseStatus = state.caseStatus?.trim().toLowerCase() || null;
  const stepStatus = state.stepStatus?.trim().toLowerCase() || null;

  if (!caseStatus) {
    return requestStatus === "failed" || requestStatus === "submitted"
      ? {
          allowed: true,
          action: "resubmit",
          reason: "The durable request has no engineering case and can be dispatched idempotently.",
        }
      : {
          allowed: false,
          action: null,
          reason: "Only failed or undispatched submitted requests can be resubmitted.",
        };
  }

  if (caseStatus === "blocked") {
    return {
      allowed: true,
      action: "resume",
      reason: "The engineering case is blocked and can resume its current stage.",
    };
  }

  if (caseStatus === "active" && stepStatus === "failed") {
    return {
      allowed: true,
      action: "resume",
      reason: "The active engineering case has a failed current stage.",
    };
  }

  if (requestStatus === "failed" && caseStatus === "active") {
    return {
      allowed: true,
      action: "synchronize",
      reason: "Agent work is already active; refresh the stale local projection only.",
    };
  }

  return {
    allowed: false,
    action: null,
    reason: `The engineering case cannot be retried from ${caseStatus}.`,
  };
}

export function isAgentRequestRetryVisible(state: RetryState): boolean {
  return state.requestStatus === "failed"
    || (state.requestStatus === "submitted" && !state.caseStatus)
    || state.caseStatus === "blocked";
}

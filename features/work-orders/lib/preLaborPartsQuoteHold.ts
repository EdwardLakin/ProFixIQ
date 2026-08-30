export const PRE_LABOR_PARTS_QUOTE_HOLD_REASON = "Awaiting parts quote";

type PartsWaitingLineState = {
  approval_state?: unknown;
  hold_reason?: unknown;
  status?: unknown;
};

export type OfflineMutationIdentitySource = {
  actionType: unknown;
  clientMutationId: unknown;
  payload: unknown;
  shopId?: unknown;
  userId?: unknown;
};

export type QueuedPartsQuoteHoldIdentity = {
  lineId: string;
  operationKey: string;
};

function normalize(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function getQueuedPartsQuoteHoldIdentity(
  mutation: OfflineMutationIdentitySource,
): QueuedPartsQuoteHoldIdentity | null {
  if (mutation.actionType !== "job:punch-transition") return null;
  if (!isRecord(mutation.payload)) return null;

  const lineId =
    typeof mutation.payload.lineId === "string"
      ? mutation.payload.lineId.trim()
      : "";
  const operationKey =
    typeof mutation.payload.operationKey === "string"
      ? mutation.payload.operationKey.trim()
      : "";
  const action = mutation.payload.action;
  const body = mutation.payload.body;

  if (
    !lineId ||
    !operationKey ||
    action !== "pause" ||
    !isRecord(body) ||
    body.transitionIntent !== "parts_quote_hold" ||
    mutation.clientMutationId !==
      `pre_labor_parts_quote_hold:${operationKey}`
  ) {
    return null;
  }

  return { lineId, operationKey };
}

/**
 * The task-owned pre-labor hold is active only while customer approval is
 * still pending. The legacy portal decision RPC always changes that approval
 * state, so even its direct decline entry point durably terminates this hold.
 */
export function isCanonicalPreLaborPartsQuoteHold(
  line: PartsWaitingLineState,
): boolean {
  return (
    normalize(line.approval_state) === "pending" &&
    normalize(line.status) === "on_hold" &&
    normalize(line.hold_reason) ===
      PRE_LABOR_PARTS_QUOTE_HOLD_REASON.toLowerCase()
  );
}

/**
 * Preserve established waiting-parts reasons while preventing a stale exact
 * pre-labor reason from overriding a completed customer decision. Word
 * boundaries also keep unrelated reasons such as "Department approval" from
 * being mistaken for a parts signal.
 */
export function hasActivePartsWaitingSignal(
  line: PartsWaitingLineState,
): boolean {
  const status = normalize(line.status);
  const holdReason = normalize(line.hold_reason);

  if (holdReason === PRE_LABOR_PARTS_QUOTE_HOLD_REASON.toLowerCase()) {
    return isCanonicalPreLaborPartsQuoteHold(line);
  }

  return (
    status === "waiting_parts" ||
    /\bparts?\b/.test(holdReason) ||
    /\bquotes?\b/.test(holdReason)
  );
}

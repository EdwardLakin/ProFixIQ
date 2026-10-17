import {
  getSessionMatchedOfflineScope,
  runMutationWithOfflineQueue,
} from "@/features/shared/lib/offline/mutations";

export type JobPunchAction = "start" | "pause" | "resume" | "finish";

type TransitionBody = {
  allowConcurrentJobPunches?: boolean;
  expectedLineUpdatedAt?: string;
  holdReason?: string;
  notes?: string | null;
  transitionIntent?:
    | "parts_quote_hold";
  toAwaiting?: boolean;
  cause?: string | null;
  correction?: string | null;
};

type JobPunchTransitionOptions = {
  operationKey?: string;
};

type ApiError = { error?: string };

/**
 * What the server reported for a transition. Only Equipment shops set
 * `lineClosed` on finish: false means the technician punched off while others
 * are still working, so the line stays open. Absent for every other case
 * (and when the request was queued offline), which callers treat as before.
 */
export type JobPunchTransitionResult = {
  lineClosed?: boolean;
  remaining?: Array<{ technicianId: string; state: string }>;
};

function buildTransitionPath(lineId: string, action: JobPunchAction): string {
  return `/api/work-orders/lines/${lineId}/${action}`;
}

export function createJobPunchOperationKey(
  lineId: string,
  action: JobPunchAction,
): string {
  const randomId =
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `job-punch:${lineId}:${action}:${randomId}`;
}

export async function runJobPunchTransition(
  lineId: string,
  action: JobPunchAction,
  body?: TransitionBody,
  options?: JobPunchTransitionOptions,
): Promise<JobPunchTransitionResult | void> {
  const suppliedKey = options?.operationKey?.trim();
  const operationKey =
    suppliedKey || createJobPunchOperationKey(lineId, action);
  const offlineMutationNamespace =
    body?.transitionIntent === "parts_quote_hold"
      ? "pre_labor_parts_quote_hold"
      : `job_punch:${action}`;
  const clientMutationId = `${offlineMutationNamespace}:${operationKey}`;
  const occurredAt = new Date().toISOString();
  const payload = {
    ...(body ?? {}),
    operationKey,
    idempotencyKey: operationKey,
    occurredAt,
  };

  const post = async (): Promise<JobPunchTransitionResult | void> => {
    const res = await fetch(buildTransitionPath(lineId, action), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": operationKey,
      },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      // The body is optional: callers that ignore it behave exactly as before.
      try {
        const body = (await res.json()) as JobPunchTransitionResult | null;
        return body && typeof body === "object" ? body : undefined;
      } catch {
        return undefined;
      }
    }
    const responsePayload = (await res
      .json()
      .catch(() => null)) as ApiError | null;
    const error = new Error(
      responsePayload?.error ?? `Failed to ${action} job`,
    ) as Error & {
      status?: number;
    };
    error.status = res.status;
    throw error;
  };

  const scope = await getSessionMatchedOfflineScope();
  if (!scope) {
    return post();
  }
  // The queue's runner cannot return a value, so keep the server's answer here.
  // It is only reported when the request actually ran online and was neither
  // queued nor conflicted; queued or replayed requests have no answer yet.
  let serverResult: JobPunchTransitionResult | undefined;
  const outcome = await runMutationWithOfflineQueue({
    clientMutationId,
    actionType: "job:punch-transition",
    payload: { lineId, action, body: payload, operationKey, occurredAt },
    orderKey: `${lineId}:job-punch:${operationKey}`,
    scope,
    runner: async () => {
      serverResult = (await post()) ?? undefined;
    },
  });
  if (outcome?.queued || outcome?.conflicted) return undefined;
  return serverResult;
}

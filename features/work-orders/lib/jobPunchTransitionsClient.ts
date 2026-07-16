import {
  getOfflineMutationScope,
  runMutationWithOfflineQueue,
} from "@/features/shared/lib/offline/mutations";

export type JobPunchAction = "start" | "pause" | "resume" | "finish";

type TransitionBody = {
  allowConcurrentJobPunches?: boolean;
  holdReason?: string;
  notes?: string | null;
  toAwaiting?: boolean;
  cause?: string | null;
  correction?: string | null;
};

type JobPunchTransitionOptions = {
  operationKey?: string;
};

type ApiError = { error?: string };

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
): Promise<void> {
  const suppliedKey = options?.operationKey?.trim();
  const operationKey =
    suppliedKey || createJobPunchOperationKey(lineId, action);
  const occurredAt = new Date().toISOString();
  const payload = {
    ...(body ?? {}),
    operationKey,
    idempotencyKey: operationKey,
    occurredAt,
  };

  const post = async () => {
    const res = await fetch(buildTransitionPath(lineId, action), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": operationKey,
      },
      body: JSON.stringify(payload),
    });
    if (res.ok) return;
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

  const scope = getOfflineMutationScope();
  if (!scope) {
    await post();
    return;
  }
  await runMutationWithOfflineQueue({
    clientMutationId: operationKey,
    actionType: "job:punch-transition",
    payload: { lineId, action, body: payload, operationKey, occurredAt },
    orderKey: `${lineId}:job-punch:${operationKey}`,
    scope,
    runner: post,
  });
}

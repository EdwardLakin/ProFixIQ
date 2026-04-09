export type JobPunchAction = "start" | "pause" | "resume" | "finish";

type TransitionBody = {
  allowConcurrentJobPunches?: boolean;
  holdReason?: string;
  notes?: string | null;
  toAwaiting?: boolean;
  cause?: string | null;
  correction?: string | null;
};

type ApiError = { error?: string };

function buildTransitionPath(lineId: string, action: JobPunchAction): string {
  return `/api/work-orders/lines/${lineId}/${action}`;
}

export async function runJobPunchTransition(
  lineId: string,
  action: JobPunchAction,
  body?: TransitionBody,
): Promise<void> {
  const res = await fetch(buildTransitionPath(lineId, action), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.ok) return;

  const payload = (await res.json().catch(() => null)) as ApiError | null;
  throw new Error(payload?.error ?? `Failed to ${action} job`);
}

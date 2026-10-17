import { JOB_FINISH_REPLAYED_EVENT } from "@/features/shared/lib/offline/jobFinishEvents";
import type { OfflineMutationRunner } from "@/features/shared/lib/offline/mutations";

type ReplayPayload = Record<string, unknown>;

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Like apiPost, but hands back the response body for the few callers that need it. */
async function apiPostJson(
  path: string,
  body: unknown,
  operationKey?: string,
): Promise<Record<string, unknown> | null> {
  const response = await fetch(path, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(operationKey ? { "Idempotency-Key": operationKey } : {}),
    },
    body: JSON.stringify(body),
  });
  if (response.ok) {
    const json = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    return json && typeof json === "object" ? json : null;
  }
  const json = (await response.json().catch(() => null)) as {
    error?: string;
  } | null;
  const error = new Error(
    json?.error ?? "Offline update was rejected",
  ) as Error & {
    status?: number;
  };
  error.status = response.status;
  throw error;
}

export const replayJobPunchTransition: OfflineMutationRunner = async (mutation) => {
  const payload = mutation.payload as ReplayPayload;
  const lineId = text(payload.lineId);
  const action = text(payload.action);
  const operationKey = text(payload.operationKey);
  if (
    !lineId ||
    !["start", "pause", "resume", "finish"].includes(action) ||
    !operationKey
  ) {
    return { conflicted: "Job transition is missing required offline data." };
  }
  const result = await apiPostJson(
    `/api/work-orders/lines/${lineId}/${action}`,
    payload.body ?? {},
    operationKey,
  );
  const equipmentClass = text(payload.equipmentClass);
  if (
    action === "finish" &&
    equipmentClass !== "" &&
    equipmentClass !== "standard" &&
    typeof window !== "undefined"
  ) {
    window.dispatchEvent(
      new CustomEvent(JOB_FINISH_REPLAYED_EVENT, {
        detail: {
          lineId,
          // Only the Equipment path reports lineClosed. A finish without it
          // went through the standard path, which completes the line.
          lineClosed: typeof result?.lineClosed === "boolean" ? result.lineClosed : true,
        },
      }),
    );
  }
};

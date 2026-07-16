"use client";

type OfflineServerMutationAction =
  | "update_work_order_line_notes"
  | "save_story_draft"
  | "upload_job_photo";

type ApiError = { error?: string };

export async function postOfflineServerMutation(args: {
  actionType: OfflineServerMutationAction;
  operationKey: string;
  payload: Record<string, unknown>;
}): Promise<unknown> {
  const response = await fetch("/api/offline/mutations", {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": args.operationKey,
    },
    body: JSON.stringify({
      actionType: args.actionType,
      payload: args.payload,
    }),
  });
  const result = (await response.json().catch(() => null)) as ApiError | null;
  if (!response.ok) {
    const error = new Error(
      result?.error ?? "Offline mutation was rejected",
    ) as Error & {
      status?: number;
    };
    error.status = response.status;
    throw error;
  }
  return result;
}

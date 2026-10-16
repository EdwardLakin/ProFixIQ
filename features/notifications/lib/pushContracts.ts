import { createHash } from "node:crypto";

import { isSafeNotificationTargetPath } from "@/features/notifications/lib/pushClientContracts";

export { isSafeNotificationTargetPath };

export const PUSH_MAX_ATTEMPTS = 5;
/** Seconds to wait before attempt N+1 after a transient failure on attempt N. */
export const PUSH_RETRY_DELAYS_SECONDS = [60, 300, 1800, 7200] as const;

export type PushSubscriptionInput = {
  endpoint: string;
  p256dh: string;
  authSecret: string;
  expiresAt: string | null;
};

export function hashPushEndpoint(endpoint: string): string {
  return createHash("sha256").update(endpoint).digest("hex");
}

export function parsePushSubscriptionInput(
  value: unknown,
): PushSubscriptionInput | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const keys =
    raw.keys && typeof raw.keys === "object"
      ? (raw.keys as Record<string, unknown>)
      : null;
  const endpoint = raw.endpoint;
  if (typeof endpoint !== "string" || endpoint.length > 2000) return null;
  try {
    if (new URL(endpoint).protocol !== "https:") return null;
  } catch {
    return null;
  }
  const p256dh = keys?.p256dh;
  const authSecret = keys?.auth;
  if (
    typeof p256dh !== "string" ||
    typeof authSecret !== "string" ||
    !p256dh ||
    !authSecret ||
    p256dh.length > 200 ||
    authSecret.length > 100
  ) {
    return null;
  }
  let expiresAt: string | null = null;
  if (typeof raw.expirationTime === "number" && Number.isFinite(raw.expirationTime)) {
    expiresAt = new Date(raw.expirationTime).toISOString();
  }
  return { endpoint, p256dh, authSecret, expiresAt };
}

/**
 * The only content that leaves our servers for a push. It is deliberately
 * generic: lock screens must not reveal customer, machine or job details. The
 * app re-authorizes the target path and loads details after the user opens it.
 */
export function buildPushPayload(notification: {
  id: string;
  target_path: string;
  priority?: string | null;
}) {
  return {
    v: 1 as const,
    id: notification.id,
    title: "ProFixIQ",
    body: "You have a new update. Open the app to view it.",
    path: isSafeNotificationTargetPath(notification.target_path)
      ? notification.target_path
      : "/",
    urgent: notification.priority === "high",
  };
}

export type PushFailureKind = "gone" | "transient" | "permanent";

export function classifyPushFailure(statusCode: number | null): PushFailureKind {
  if (statusCode === 404 || statusCode === 410) return "gone";
  if (statusCode === null || statusCode === 429 || statusCode >= 500 || statusCode === 408) {
    return "transient";
  }
  return "permanent";
}

export function nextRetryDelaySeconds(attemptsMade: number): number | null {
  if (attemptsMade >= PUSH_MAX_ATTEMPTS) return null;
  const index = Math.min(Math.max(attemptsMade, 1), PUSH_RETRY_DELAYS_SECONDS.length) - 1;
  return PUSH_RETRY_DELAYS_SECONDS[index] ?? null;
}

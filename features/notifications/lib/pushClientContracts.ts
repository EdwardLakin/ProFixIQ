/** Browser/service-worker safe helpers (no Node imports). */

export const PUSH_SUBSCRIPTION_CHANGED_MESSAGE = "profixiq:push-subscription-changed";

/** Notifications may only deep-link to same-origin relative paths. */
export function isSafeNotificationTargetPath(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= 500 &&
    value.startsWith("/") &&
    !value.startsWith("//") &&
    !value.includes("\\") &&
    !/[\u0000-\u001f]/.test(value)
  );
}

export type ParsedPushPayload = {
  id: string | null;
  title: string;
  body: string;
  path: string;
};

const FALLBACK_BODY = "You have a new update. Open the app to view it.";

/** Never trusts payload text beyond bounded strings; path is validated. */
export function parsePushEventPayload(raw: string | null): ParsedPushPayload {
  let data: Record<string, unknown> = {};
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (parsed && typeof parsed === "object") data = parsed as Record<string, unknown>;
  } catch {
    data = {};
  }
  return {
    id: typeof data.id === "string" ? data.id.slice(0, 64) : null,
    title: typeof data.title === "string" && data.title ? data.title.slice(0, 80) : "ProFixIQ",
    body: typeof data.body === "string" && data.body ? data.body.slice(0, 160) : FALLBACK_BODY,
    path: isSafeNotificationTargetPath(data.path) ? data.path : "/",
  };
}

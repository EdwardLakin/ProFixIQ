"use client";

import type { OfflineMutationScope } from "@/features/shared/lib/offline/mutations";

export type OfflineReplayBlockCode =
  | "reauthenticate"
  | "access_revoked"
  | "scope_changed"
  | "verification_unavailable";

export type OfflineSessionHealth =
  | { status: "offline"; message: string }
  | { status: "verified"; message: string; verifiedAt: string }
  | { status: "blocked"; code: OfflineReplayBlockCode; message: string };

export class OfflineReplayBlockedError extends Error {
  readonly code: OfflineReplayBlockCode;

  constructor(code: OfflineReplayBlockCode, message: string) {
    super(message);
    this.name = "OfflineReplayBlockedError";
    this.code = code;
  }
}

export async function checkOfflineReplaySession(
  scope: OfflineMutationScope | null,
): Promise<OfflineSessionHealth> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return {
      status: "offline",
      message: "Session verification will run after reconnection.",
    };
  }
  if (!scope) {
    return {
      status: "blocked",
      code: "reauthenticate",
      message: "Sign in again to identify the saved work on this device.",
    };
  }

  try {
    const response = await fetch("/api/offline/session-check", {
      credentials: "include",
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    const body = (await response.json().catch(() => null)) as {
      userId?: string;
      shopId?: string;
      verifiedAt?: string;
      error?: string;
    } | null;
    if (response.status === 401) {
      return {
        status: "blocked",
        code: "reauthenticate",
        message: body?.error ?? "Sign in again before syncing saved work.",
      };
    }
    if (response.status === 403) {
      return {
        status: "blocked",
        code: "access_revoked",
        message: body?.error ?? "Your shop access is no longer available.",
      };
    }
    if (!response.ok || !body?.userId || !body.shopId) {
      return {
        status: "blocked",
        code: "verification_unavailable",
        message: "The server could not verify this device. Saved work was not sent.",
      };
    }
    if (body.userId !== scope.userId || body.shopId !== scope.shopId) {
      return {
        status: "blocked",
        code: "scope_changed",
        message:
          "This device's saved work belongs to a different user or shop. Sign in with the original account.",
      };
    }
    return {
      status: "verified",
      message: "User and shop access verified for sync.",
      verifiedAt: body.verifiedAt ?? new Date().toISOString(),
    };
  } catch {
    return {
      status: "blocked",
      code: "verification_unavailable",
      message: "The server could not verify this device. Saved work was not sent.",
    };
  }
}

export async function assertOfflineReplaySession(
  scope: OfflineMutationScope | null,
): Promise<void> {
  const health = await checkOfflineReplaySession(scope);
  if (health.status === "blocked") {
    throw new OfflineReplayBlockedError(health.code, health.message);
  }
}

"use client";

import type { OfflineMutationScope } from "@/features/shared/lib/offline/mutations";

export const FIELD_SURFACE_SESSION_KEY = "profixiq:field-surface:v1";

type SessionStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function browserSessionStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function readFieldSurfaceSession(
  storage: SessionStorage | null = browserSessionStorage(),
): OfflineMutationScope | null {
  if (!storage) return null;
  try {
    const parsed = JSON.parse(
      storage.getItem(FIELD_SURFACE_SESSION_KEY) ?? "null",
    ) as Record<string, unknown> | null;
    const userId = clean(parsed?.userId);
    const shopId = clean(parsed?.shopId);
    if (parsed?.version !== 1 || !userId || !shopId) {
      storage.removeItem(FIELD_SURFACE_SESSION_KEY);
      return null;
    }
    return { userId, shopId };
  } catch {
    try {
      storage.removeItem(FIELD_SURFACE_SESSION_KEY);
    } catch {
      // Invalid session state is ignored when storage cannot be repaired.
    }
    return null;
  }
}

export function writeFieldSurfaceSession(
  scope: OfflineMutationScope,
  storage: SessionStorage | null = browserSessionStorage(),
): void {
  const userId = clean(scope.userId);
  const shopId = clean(scope.shopId);
  if (!storage || !userId || !shopId) return;
  try {
    storage.setItem(
      FIELD_SURFACE_SESSION_KEY,
      JSON.stringify({ version: 1, userId, shopId }),
    );
  } catch {
    // Session persistence is an optimization; server verification is authoritative.
  }
}

export function clearFieldSurfaceSession(
  storage: Pick<Storage, "removeItem"> | null = browserSessionStorage(),
): void {
  if (!storage) return;
  try {
    storage.removeItem(FIELD_SURFACE_SESSION_KEY);
  } catch {
    // Explicit denial remains authoritative even if storage cleanup fails.
  }
}

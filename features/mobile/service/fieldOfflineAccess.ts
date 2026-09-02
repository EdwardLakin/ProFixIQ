"use client";

import type { FieldExistingSessionAccess } from "@/features/auth/lib/accessSurfaceRouting";
import type { OfflineMutationScope } from "@/features/shared/lib/offline/mutations";
import {
  normalizeFieldWorkspaceCapabilities,
  type FieldWorkspaceCapabilities,
} from "./fieldWorkspaceCapabilities";

export const FIELD_SERVICE_OFFLINE_ACCESS_CACHE_PREFIX =
  "profixiq:field-service:access:v1";
export const FIELD_SERVICE_OFFLINE_ACCESS_MAX_AGE_MS = 12 * 60 * 60 * 1000;

type StorageReader = Pick<Storage, "getItem">;
type StorageWriter = Pick<Storage, "setItem" | "removeItem">;

export type FieldServiceAccessPayload = FieldExistingSessionAccess & {
  userId?: string;
  shopId?: string;
  productEntitled?: boolean;
  configurationComplete?: boolean;
  standaloneFieldWorkspace?: boolean;
  workspaceCapabilities?: unknown;
};

export type FieldServiceOfflineAccessSnapshot = {
  version: 1;
  userId: string;
  shopId: string;
  decision: "ready";
  canAccessFieldService: true;
  canConfigure: boolean;
  mustChangePassword: false;
  workspaceCapabilities: FieldWorkspaceCapabilities;
  validatedAt: string;
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function browserStorage(): Storage | null {
  if (typeof window === "undefined") return null;

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function getFieldServiceOfflineAccessCacheKey(
  scope: OfflineMutationScope,
): string | null {
  const userId = clean(scope.userId);
  const shopId = clean(scope.shopId);
  if (!userId || !shopId) return null;

  return `${FIELD_SERVICE_OFFLINE_ACCESS_CACHE_PREFIX}:${encodeURIComponent(shopId)}:${encodeURIComponent(userId)}`;
}

export function resolveFieldServiceAccessScope(
  access: FieldServiceAccessPayload | null,
  authUserId: string,
): OfflineMutationScope | null {
  const userId = clean(access?.userId);
  const shopId = clean(access?.shopId);
  const expectedUserId = clean(authUserId);
  if (!userId || !shopId || !expectedUserId || userId !== expectedUserId) {
    return null;
  }

  return { userId, shopId };
}

export function readFieldServiceOfflineAccess(
  scope: OfflineMutationScope,
  storage: StorageReader | null = browserStorage(),
  nowMs: number = Date.now(),
): FieldServiceOfflineAccessSnapshot | null {
  const key = getFieldServiceOfflineAccessCacheKey(scope);
  if (!key || !storage) return null;

  try {
    const parsed = JSON.parse(storage.getItem(key) ?? "null") as Record<
      string,
      unknown
    > | null;
    const validatedAt = clean(parsed?.validatedAt);
    const validatedAtMs = Date.parse(validatedAt);
    const snapshotAgeMs = nowMs - validatedAtMs;
    if (
      !parsed ||
      parsed.version !== 1 ||
      clean(parsed.userId) !== clean(scope.userId) ||
      clean(parsed.shopId) !== clean(scope.shopId) ||
      parsed.canAccessFieldService !== true ||
      parsed.mustChangePassword !== false ||
      !Number.isFinite(validatedAtMs) ||
      !Number.isFinite(snapshotAgeMs) ||
      snapshotAgeMs < 0 ||
      snapshotAgeMs > FIELD_SERVICE_OFFLINE_ACCESS_MAX_AGE_MS
    ) {
      return null;
    }

    return {
      version: 1,
      userId: clean(parsed.userId),
      shopId: clean(parsed.shopId),
      decision: "ready",
      canAccessFieldService: true,
      canConfigure: parsed.canConfigure === true,
      mustChangePassword: false,
      workspaceCapabilities: normalizeFieldWorkspaceCapabilities(
        parsed.workspaceCapabilities,
      ),
      validatedAt,
    };
  } catch {
    return null;
  }
}

export function writeFieldServiceOfflineAccess(
  scope: OfflineMutationScope,
  access: FieldServiceAccessPayload,
  storage: StorageWriter | null = browserStorage(),
): FieldServiceOfflineAccessSnapshot | null {
  const key = getFieldServiceOfflineAccessCacheKey(scope);
  if (!key || !storage) return null;

  const verifiedScope = resolveFieldServiceAccessScope(access, scope.userId);

  if (
    verifiedScope?.shopId !== scope.shopId.trim() ||
    (access.decision != null && access.decision !== "ready") ||
    access.canAccessFieldService !== true ||
    access.mustChangePassword === true
  ) {
    try {
      storage.removeItem(key);
    } catch {
      // Storage can be unavailable in private browsing or under quota pressure.
    }
    return null;
  }

  const snapshot: FieldServiceOfflineAccessSnapshot = {
    version: 1,
    userId: scope.userId.trim(),
    shopId: scope.shopId.trim(),
    decision: "ready",
    canAccessFieldService: true,
    canConfigure: access.canConfigure === true,
    mustChangePassword: false,
    workspaceCapabilities: normalizeFieldWorkspaceCapabilities(
      access.workspaceCapabilities,
    ),
    validatedAt: new Date().toISOString(),
  };

  try {
    storage.setItem(key, JSON.stringify(snapshot));
    return snapshot;
  } catch {
    return null;
  }
}

export function clearFieldServiceOfflineAccess(
  scope: OfflineMutationScope,
  storage: StorageWriter | null = browserStorage(),
): void {
  const key = getFieldServiceOfflineAccessCacheKey(scope);
  if (!key || !storage) return;

  try {
    storage.removeItem(key);
  } catch {
    // An explicit server denial remains authoritative even if cache cleanup fails.
  }
}

import type { MobileActiveJobContract } from "@/features/dispatch/lib/contracts";
import type { OfflineMutationScope } from "@/features/shared/lib/offline/mutations";

export const FIELD_ACTIVE_SNAPSHOT_LEGACY_KEY =
  "profixiq:mobile-service:active:v1";

const FIELD_ACTIVE_SNAPSHOT_PREFIX = "profixiq:mobile-service:active:v2";

type SnapshotScope = Pick<OfflineMutationScope, "userId" | "shopId">;
type SnapshotStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

type FieldActiveSnapshotRecord = {
  userId: string;
  shopId: string;
  snapshot: MobileActiveJobContract;
};

function normalizedScope(scope: SnapshotScope): SnapshotScope | null {
  const userId = String(scope.userId ?? "").trim();
  const shopId = String(scope.shopId ?? "").trim();
  return userId && shopId ? { userId, shopId } : null;
}

function browserStorage(storage?: SnapshotStorage): SnapshotStorage | null {
  if (storage) return storage;
  return typeof window === "undefined" ? null : window.localStorage;
}

function isVisitForShop(value: unknown, shopId: string): boolean {
  return (
    value === null ||
    (typeof value === "object" &&
      !Array.isArray(value) &&
      (value as { shopId?: unknown }).shopId === shopId)
  );
}

function isActiveSnapshot(
  value: unknown,
  shopId: string,
): value is MobileActiveJobContract {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const snapshot = value as Partial<MobileActiveJobContract>;
  return (
    typeof snapshot.serverNow === "string" &&
    isVisitForShop(snapshot.activeJob, shopId) &&
    isVisitForShop(snapshot.nextJob, shopId)
  );
}

export function isFieldActiveSnapshotForScope(
  value: unknown,
  scope: SnapshotScope,
): value is MobileActiveJobContract {
  const normalized = normalizedScope(scope);
  return Boolean(normalized && isActiveSnapshot(value, normalized.shopId));
}

export function getFieldActiveSnapshotCacheKey(
  scope: SnapshotScope,
): string | null {
  const normalized = normalizedScope(scope);
  if (!normalized) return null;
  return `${FIELD_ACTIVE_SNAPSHOT_PREFIX}:${encodeURIComponent(normalized.userId)}:${encodeURIComponent(normalized.shopId)}`;
}

export function writeFieldActiveSnapshot(
  scope: SnapshotScope,
  snapshot: MobileActiveJobContract,
  storage?: SnapshotStorage,
): void {
  const normalized = normalizedScope(scope);
  const key = normalized ? getFieldActiveSnapshotCacheKey(normalized) : null;
  const target = browserStorage(storage);
  if (
    !normalized ||
    !key ||
    !target ||
    !isActiveSnapshot(snapshot, normalized.shopId)
  ) {
    return;
  }

  target.setItem(
    key,
    JSON.stringify({
      userId: normalized.userId,
      shopId: normalized.shopId,
      snapshot,
    } satisfies FieldActiveSnapshotRecord),
  );
  target.removeItem(FIELD_ACTIVE_SNAPSHOT_LEGACY_KEY);
}

export function readFieldActiveSnapshot(
  scope: SnapshotScope,
  storage?: SnapshotStorage,
): MobileActiveJobContract | null {
  const normalized = normalizedScope(scope);
  const key = normalized ? getFieldActiveSnapshotCacheKey(normalized) : null;
  const target = browserStorage(storage);
  if (!normalized || !key || !target) return null;
  target.removeItem(FIELD_ACTIVE_SNAPSHOT_LEGACY_KEY);

  try {
    const parsed = JSON.parse(
      target.getItem(key) ?? "null",
    ) as Partial<FieldActiveSnapshotRecord> | null;
    if (
      parsed?.userId !== normalized.userId ||
      parsed?.shopId !== normalized.shopId ||
      !isActiveSnapshot(parsed.snapshot, normalized.shopId)
    ) {
      return null;
    }
    return parsed.snapshot;
  } catch {
    return null;
  }
}

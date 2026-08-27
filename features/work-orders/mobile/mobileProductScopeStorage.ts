"use client";

import {
  getOfflineSnapshot,
  listOfflineSnapshots,
  removeOfflineSnapshots,
  saveOfflineSnapshot,
} from "@/features/shared/lib/offline/database";

export type MobileProductScope = "shop" | "field";

const AUTHORITY_KIND = "mobile-product-authority";
const AUTHORITY_ID = "current";
const DETAIL_KIND = "mobile-work-order-detail";
const LIST_KIND = "mobile-work-order-list";
const TECHNICIAN_BUNDLE_KIND = "technician-assigned-work";
const TECHNICIAN_BUNDLE_ID = "current";

type MobileProductAuthority = {
  userId: string;
  shopId: string;
  productScope: MobileProductScope;
  authorizedWorkOrderIds?: string[] | null;
};

function parseAuthority(
  value: unknown,
  scope: { userId: string; shopId: string },
): MobileProductAuthority | null {
  if (!value || typeof value !== "object") return null;
  const authority = value as Partial<MobileProductAuthority>;
  if (
    authority.userId !== scope.userId ||
    authority.shopId !== scope.shopId ||
    (authority.productScope !== "shop" && authority.productScope !== "field")
  ) {
    return null;
  }
  if (
    authority.authorizedWorkOrderIds !== undefined &&
    authority.authorizedWorkOrderIds !== null &&
    (!Array.isArray(authority.authorizedWorkOrderIds) ||
      authority.authorizedWorkOrderIds.some((id) => typeof id !== "string"))
  ) {
    return null;
  }
  return authority as MobileProductAuthority;
}

function normalizedIds(ids: readonly string[] | null): string[] | null {
  return ids === null
    ? null
    : [...new Set(ids.map((id) => id.trim()).filter(Boolean))].sort();
}

function sameIds(
  left: readonly string[] | null | undefined,
  right: readonly string[] | null | undefined,
): boolean {
  if (left === undefined || right === undefined) return left === right;
  if (left === null || right === null) return left === right;
  const normalizedLeft = normalizedIds(left) ?? [];
  const normalizedRight = normalizedIds(right) ?? [];
  return (
    normalizedLeft.length === normalizedRight.length &&
    normalizedLeft.every((id, index) => id === normalizedRight[index])
  );
}

async function removeAuthority(scope: {
  userId: string;
  shopId: string;
}): Promise<void> {
  await removeOfflineSnapshots({
    scope,
    kind: AUTHORITY_KIND,
    entityIds: [AUTHORITY_ID],
  });
}

export async function removeMobileProductScopedSnapshots(scope: {
  userId: string;
  shopId: string;
}): Promise<void> {
  const [details, lists] = await Promise.all([
    listOfflineSnapshots({ scope, kind: DETAIL_KIND }),
    listOfflineSnapshots({ scope, kind: LIST_KIND }),
  ]);
  await Promise.all([
    removeOfflineSnapshots({
      scope,
      kind: DETAIL_KIND,
      entityIds: details.map((snapshot) => snapshot.entityId),
    }),
    removeOfflineSnapshots({
      scope,
      kind: LIST_KIND,
      entityIds: lists.map((snapshot) => snapshot.entityId),
    }),
    removeOfflineSnapshots({
      scope,
      kind: TECHNICIAN_BUNDLE_KIND,
      entityIds: [TECHNICIAN_BUNDLE_ID],
    }),
  ]);
}

export async function getCachedMobileProductScope(scope: {
  userId: string;
  shopId: string;
}): Promise<MobileProductScope | null> {
  const stored = await getOfflineSnapshot<MobileProductAuthority>({
    scope,
    kind: AUTHORITY_KIND,
    entityId: AUTHORITY_ID,
  });
  if (!stored) return null;
  const authority = parseAuthority(stored.data, scope);
  if (authority) return authority.productScope;
  await removeAuthority(scope);
  return null;
}

/**
 * Records the most recently verified server authority for this browser scope.
 * A missing, invalid, or changed envelope is treated as an authority transition:
 * the old envelope is removed first, all product-sensitive projections are
 * purged, and only then is the replacement envelope written.
 */
export async function reconcileMobileProductScope(args: {
  scope: { userId: string; shopId: string };
  productScope: MobileProductScope;
  authorizedWorkOrderIds?: readonly string[] | null;
}): Promise<void> {
  const stored = await getOfflineSnapshot<MobileProductAuthority>({
    scope: args.scope,
    kind: AUTHORITY_KIND,
    entityId: AUTHORITY_ID,
  });
  const current = stored ? parseAuthority(stored.data, args.scope) : null;
  const nextAuthorizedIds =
    args.authorizedWorkOrderIds === undefined
      ? current?.authorizedWorkOrderIds
      : normalizedIds(args.authorizedWorkOrderIds);
  const authorityChanged =
    current?.productScope !== args.productScope ||
    (args.authorizedWorkOrderIds !== undefined &&
      !sameIds(current?.authorizedWorkOrderIds, nextAuthorizedIds));
  if (authorityChanged) {
    // Removing the authority first keeps interrupted transitions fail closed.
    await removeAuthority(args.scope);
    await removeMobileProductScopedSnapshots(args.scope);
  }

  await saveOfflineSnapshot({
    scope: args.scope,
    kind: AUTHORITY_KIND,
    entityId: AUTHORITY_ID,
    data: {
      userId: args.scope.userId,
      shopId: args.scope.shopId,
      productScope: args.productScope,
      authorizedWorkOrderIds: nextAuthorizedIds,
    } satisfies MobileProductAuthority,
  });
}

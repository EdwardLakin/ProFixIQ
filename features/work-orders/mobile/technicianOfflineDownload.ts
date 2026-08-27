"use client";

import {
  getOfflineSnapshot,
  listOfflineSnapshots,
  removeOfflineSnapshots,
  saveOfflineSnapshot,
  type OfflineSnapshot,
} from "@/features/shared/lib/offline/database";
import type { TechnicianOfflineBundle } from "@/features/work-orders/mobile/technicianOfflineTypes";
import {
  getCachedMobileProductScope,
  reconcileMobileProductScope,
  removeMobileProductScopedSnapshots,
} from "@/features/work-orders/mobile/mobileProductScopeStorage";
import {
  isSafePrivateNavigationShell,
  PRIVATE_NAVIGATION_CACHE_NAMES,
} from "@/features/shared/lib/pwa/privateNavigationCache";

const BUNDLE_KIND = "technician-assigned-work";
const BUNDLE_ID = "current";
const TECHNICIAN_SHELL_CACHE = PRIVATE_NAVIGATION_CACHE_NAMES.technician;

async function cacheTechnicianRouteShells(
  bundle: TechnicianOfflineBundle,
): Promise<void> {
  if (typeof caches === "undefined" || !navigator.serviceWorker?.controller)
    return;
  const cache = await caches.open(TECHNICIAN_SHELL_CACHE);
  const urls = bundle.workOrders.flatMap((item) => [
    `/mobile/work-orders/${item.workOrder.id}?mode=tech`,
    ...item.assignedLineIds.map(
      (lineId) =>
        `/mobile/work-orders/${item.workOrder.id}?mode=tech&focus=${lineId}`,
    ),
    ...item.assignedLineIds.map((lineId) => `/mobile/jobs/${lineId}`),
  ]);
  await Promise.all(
    urls.map(async (url) => {
      const response = await fetch(url, {
        cache: "no-store",
        credentials: "include",
        headers: { Accept: "text/html" },
      });
      if (response.ok && (await isSafePrivateNavigationShell(response))) {
        await cache.put(url, response.clone());
      }
    }),
  );
}

export async function cacheTechnicianOfflineBundle(
  bundle: TechnicianOfflineBundle,
): Promise<void> {
  await reconcileMobileProductScope({
    scope: bundle.scope,
    productScope: bundle.productScope,
    authorizedWorkOrderIds:
      bundle.productScope === "field"
        ? bundle.workOrders.map((item) => item.workOrder.id)
        : null,
  });
  const [existingBundle, existingDetails] = await Promise.all([
    getOfflineSnapshot<Partial<TechnicianOfflineBundle>>({
      scope: bundle.scope,
      kind: BUNDLE_KIND,
      entityId: BUNDLE_ID,
    }),
    listOfflineSnapshots({
      scope: bundle.scope,
      kind: "mobile-work-order-detail",
    }),
  ]);
  const authorityChanged = Boolean(
    existingBundle && existingBundle.data.productScope !== bundle.productScope,
  );
  const currentAliases = new Set(
    bundle.workOrders.flatMap((item) =>
      [item.workOrder.id, item.workOrder.custom_id].filter((id): id is string =>
        Boolean(id),
      ),
    ),
  );
  const staleAliases = existingDetails
    .filter((snapshot) => {
      const detailScope = (snapshot.data as { productScope?: unknown } | null)
        ?.productScope;
      return (
        authorityChanged ||
        detailScope !== bundle.productScope ||
        !currentAliases.has(snapshot.entityId)
      );
    })
    .map((snapshot) => snapshot.entityId);
  const detailSnapshots = bundle.workOrders.flatMap((item) => {
    const ids = new Set(
      [item.workOrder.id, item.workOrder.custom_id].filter(Boolean),
    );
    return [...ids].map((entityId) => ({
      scope: bundle.scope,
      kind: "mobile-work-order-detail",
      entityId: entityId as string,
      data: {
        workOrder: item.workOrder,
        lines: item.lines,
        quoteLines: item.quoteLines,
        vehicle: item.vehicle,
        customer: item.customer,
        techNamesById: item.techNamesById,
        lineContext: item.lineContext,
        shopLaborRate: item.shopLaborRate,
        financialAccess: item.financialAccess,
        latestInvoiceReview: null,
        productScope: bundle.productScope,
      },
    }));
  });

  // Remove the old authority envelope before writing the replacement. If a
  // browser/storage failure interrupts the refresh, offline access fails
  // closed instead of retaining a superseded Shop bundle.
  await Promise.all([
    removeOfflineSnapshots({
      scope: bundle.scope,
      kind: "mobile-work-order-detail",
      entityIds: staleAliases,
    }),
    removeOfflineSnapshots({
      scope: bundle.scope,
      kind: BUNDLE_KIND,
      entityIds: [BUNDLE_ID],
    }),
  ]);
  await Promise.all([
    ...detailSnapshots.map((snapshot) => saveOfflineSnapshot(snapshot)),
    saveOfflineSnapshot({
      scope: bundle.scope,
      kind: BUNDLE_KIND,
      entityId: BUNDLE_ID,
      data: bundle,
    }),
  ]);
}

function isTechnicianOfflineBundle(
  value: unknown,
  scope: { userId: string; shopId: string },
): value is TechnicianOfflineBundle {
  if (!value || typeof value !== "object") return false;
  const bundle = value as Partial<TechnicianOfflineBundle>;
  return (
    (bundle.productScope === "shop" || bundle.productScope === "field") &&
    bundle.scope?.userId === scope.userId &&
    bundle.scope?.shopId === scope.shopId &&
    Array.isArray(bundle.workOrders)
  );
}

export async function fetchAssignedTechnicianWork(args: {
  scope: { userId: string; shopId: string };
}): Promise<TechnicianOfflineBundle> {
  const response = await fetch("/api/offline/technician-work-orders", {
    credentials: "include",
    cache: "no-store",
  });
  const result = (await response.json().catch(() => null)) as
    | TechnicianOfflineBundle
    | { error?: string }
    | null;
  if (!response.ok || !result || !("scope" in result)) {
    throw new Error(
      (result && "error" in result && result.error) ||
        "Assigned work could not be downloaded.",
    );
  }
  if (!isTechnicianOfflineBundle(result, args.scope)) {
    throw new Error("Downloaded work does not match the active user and shop.");
  }
  return result;
}

export async function refreshAssignedTechnicianWork(args: {
  scope: { userId: string; shopId: string };
}): Promise<TechnicianOfflineBundle> {
  const result = await fetchAssignedTechnicianWork(args);
  await cacheTechnicianOfflineBundle(result);
  return result;
}

export async function downloadAssignedTechnicianWork(args: {
  scope: { userId: string; shopId: string };
}): Promise<TechnicianOfflineBundle> {
  const result = await refreshAssignedTechnicianWork(args);
  await cacheTechnicianRouteShells(result);
  return result;
}

export async function getCachedTechnicianWork(args: {
  scope: { userId: string; shopId: string };
}): Promise<OfflineSnapshot<TechnicianOfflineBundle> | null> {
  const [cached, productScope] = await Promise.all([
    getOfflineSnapshot<TechnicianOfflineBundle>({
      scope: args.scope,
      kind: BUNDLE_KIND,
      entityId: BUNDLE_ID,
    }),
    getCachedMobileProductScope(args.scope),
  ]);
  if (
    !cached ||
    (productScope &&
      isTechnicianOfflineBundle(cached.data, args.scope) &&
      cached.data.productScope === productScope)
  ) {
    return cached;
  }

  await removeMobileProductScopedSnapshots(args.scope);
  return null;
}

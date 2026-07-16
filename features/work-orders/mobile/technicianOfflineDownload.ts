"use client";

import {
  getOfflineSnapshot,
  listOfflineSnapshots,
  removeOfflineSnapshots,
  saveOfflineSnapshot,
  type OfflineSnapshot,
} from "@/features/shared/lib/offline/database";
import type { TechnicianOfflineBundle } from "@/features/work-orders/mobile/technicianOfflineTypes";

const BUNDLE_KIND = "technician-assigned-work";
const BUNDLE_ID = "current";
const TECHNICIAN_SHELL_CACHE = "profixiq-technician-shell-v1";

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
        credentials: "include",
        headers: { Accept: "text/html" },
      });
      if (response.ok) await cache.put(url, response.clone());
    }),
  );
}

export async function cacheTechnicianOfflineBundle(
  bundle: TechnicianOfflineBundle,
): Promise<void> {
  const existingDetails = await listOfflineSnapshots({
    scope: bundle.scope,
    kind: "mobile-work-order-detail",
  });
  const currentAliases = new Set(
    bundle.workOrders.flatMap((item) =>
      [item.workOrder.id, item.workOrder.custom_id].filter((id): id is string =>
        Boolean(id),
      ),
    ),
  );
  const staleAliases = existingDetails
    .map((snapshot) => snapshot.entityId)
    .filter((entityId) => !currentAliases.has(entityId));
  const detailWrites = bundle.workOrders.flatMap((item) => {
    const ids = new Set(
      [item.workOrder.id, item.workOrder.custom_id].filter(Boolean),
    );
    return [...ids].map((entityId) =>
      saveOfflineSnapshot({
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
        },
      }),
    );
  });

  await Promise.all([
    ...detailWrites,
    removeOfflineSnapshots({
      scope: bundle.scope,
      kind: "mobile-work-order-detail",
      entityIds: staleAliases,
    }),
    saveOfflineSnapshot({
      scope: bundle.scope,
      kind: BUNDLE_KIND,
      entityId: BUNDLE_ID,
      data: bundle,
    }),
  ]);
}

export async function downloadAssignedTechnicianWork(args: {
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
  if (
    result.scope.userId !== args.scope.userId ||
    result.scope.shopId !== args.scope.shopId
  ) {
    throw new Error("Downloaded work does not match the active user and shop.");
  }
  await cacheTechnicianOfflineBundle(result);
  await cacheTechnicianRouteShells(result);
  return result;
}

export async function getCachedTechnicianWork(args: {
  scope: { userId: string; shopId: string };
}): Promise<OfflineSnapshot<TechnicianOfflineBundle> | null> {
  return getOfflineSnapshot<TechnicianOfflineBundle>({
    scope: args.scope,
    kind: BUNDLE_KIND,
    entityId: BUNDLE_ID,
  });
}

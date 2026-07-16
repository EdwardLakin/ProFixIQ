"use client";

import {
  getOfflineSnapshot,
  removeOfflineSnapshots,
  saveOfflineSnapshot,
  type OfflineSnapshot,
} from "@/features/shared/lib/offline/database";
import type { TechnicianOfflineBundle } from "@/features/work-orders/mobile/technicianOfflineTypes";

const BUNDLE_KIND = "technician-assigned-work";
const BUNDLE_ID = "current";

export async function cacheTechnicianOfflineBundle(
  bundle: TechnicianOfflineBundle,
): Promise<void> {
  const previous = await getCachedTechnicianWork({ scope: bundle.scope });
  const currentAliases = new Set(
    bundle.workOrders.flatMap((item) =>
      [item.workOrder.id, item.workOrder.custom_id].filter((id): id is string =>
        Boolean(id),
      ),
    ),
  );
  const staleAliases = (previous?.data.workOrders ?? [])
    .flatMap((item) => [item.workOrder.id, item.workOrder.custom_id])
    .filter(
      (id): id is string => Boolean(id) && !currentAliases.has(id as string),
    );
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

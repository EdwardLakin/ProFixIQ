"use client";

import {
  getOfflineSnapshot,
  saveOfflineSnapshot,
} from "@/features/shared/lib/offline/database";
import {
  hydrateOfflineMutationQueue,
  listPendingMutations,
  runMutationWithOfflineQueue,
  type OfflineMutationScope,
} from "@/features/shared/lib/offline/mutations";
import type {
  FieldReturnTruckPartPayload,
  FieldTruckInventorySnapshot,
  FieldUseTruckPartPayload,
} from "./truckInventoryContracts";
import { numeric } from "./truckInventoryContracts";

const SNAPSHOT_KIND = "field-truck-inventory";
const SNAPSHOT_ID = "active-truck";
const SNAPSHOT_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 3;

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

async function readError(response: Response): Promise<Error & { status?: number }> {
  const body = (await response.json().catch(() => null)) as
    | { error?: string }
    | null;
  const error = new Error(body?.error || "Field inventory update failed.") as Error & {
    status?: number;
  };
  error.status = response.status;
  return error;
}

function lastVisitMutationDependency(visitId: string): string[] | undefined {
  const previous = listPendingMutations()
    .filter((mutation) => {
      if (
        mutation.actionType !== "service-visit:transition" &&
        mutation.actionType !== "field-inventory:use-part" &&
        mutation.actionType !== "field-inventory:return-part"
      ) {
        return false;
      }
      const payload =
        mutation.payload && typeof mutation.payload === "object"
          ? (mutation.payload as Record<string, unknown>)
          : {};
      return text(payload.visitId) === visitId;
    })
    .sort(
      (left, right) =>
        new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime(),
    )
    .at(-1);
  return previous ? [previous.clientMutationId] : undefined;
}

export async function cacheFieldTruckInventorySnapshot(args: {
  scope: OfflineMutationScope;
  snapshot: FieldTruckInventorySnapshot;
}): Promise<void> {
  await saveOfflineSnapshot({
    scope: args.scope,
    kind: SNAPSHOT_KIND,
    entityId: SNAPSHOT_ID,
    data: args.snapshot,
    maxAgeMs: SNAPSHOT_MAX_AGE_MS,
  });
}

export async function loadCachedFieldTruckInventorySnapshot(args: {
  scope: OfflineMutationScope;
}): Promise<FieldTruckInventorySnapshot | null> {
  await hydrateOfflineMutationQueue();
  const stored = await getOfflineSnapshot<FieldTruckInventorySnapshot>({
    scope: args.scope,
    kind: SNAPSHOT_KIND,
    entityId: SNAPSHOT_ID,
  });
  if (!stored?.data) return null;

  return listPendingMutations(args.scope)
    .filter((mutation) => mutation.status !== "conflicted")
    .reduce<FieldTruckInventorySnapshot>((snapshot, mutation) => {
      if (!mutation.payload || typeof mutation.payload !== "object") return snapshot;
      if (mutation.actionType === "field-inventory:use-part") {
        const payload = mutation.payload as FieldUseTruckPartPayload;
        const quantity = numeric(payload.quantity);
        return {
          ...snapshot,
          items: snapshot.items.map((item) =>
            item.partId === payload.partId
              ? {
                  ...item,
                  onHand: Math.max(0, numeric(item.onHand) - quantity),
                  available: Math.max(0, numeric(item.available) - quantity),
                }
              : item,
          ),
        };
      }
      if (mutation.actionType === "field-inventory:return-part") {
        const payload = mutation.payload as FieldReturnTruckPartPayload;
        const quantity = numeric(payload.quantity);
        const partId = snapshot.recentUses.find(
          (use) => use.workOrderPartId === payload.workOrderPartId,
        )?.partId;
        return {
          ...snapshot,
          items: snapshot.items.map((item) =>
            item.partId === partId
              ? {
                  ...item,
                  onHand: numeric(item.onHand) + quantity,
                  available: numeric(item.available) + quantity,
                }
              : item,
          ),
          recentUses: snapshot.recentUses.map((use) =>
            use.workOrderPartId === payload.workOrderPartId
              ? {
                  ...use,
                  returnedQuantity: numeric(use.returnedQuantity) + quantity,
                }
              : use,
          ),
        };
      }
      return snapshot;
    }, {
      ...stored.data,
      movements: stored.data.movements ?? [],
    });
}

export async function consumeFieldTruckPart(args: {
  scope: OfflineMutationScope;
  payload: FieldUseTruckPartPayload;
}): Promise<{
  queued: boolean;
  conflicted: boolean;
  result: Record<string, unknown> | null;
}> {
  await hydrateOfflineMutationQueue();
  const serverState: { result: Record<string, unknown> | null } = {
    result: null,
  };
  const outcome = await runMutationWithOfflineQueue({
    clientMutationId: args.payload.operationKey,
    actionType: "field-inventory:use-part",
    payload: args.payload,
    scope: args.scope,
    queueOnOffline: true,
    dependsOn: lastVisitMutationDependency(args.payload.visitId),
    orderKey: `service-visit:${args.payload.visitId}`,
    bestEffortOnlineHistory: true,
    runner: async () => {
      const response = await fetch("/api/mobile/service/truck-inventory/use", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": args.payload.operationKey,
        },
        body: JSON.stringify(args.payload),
      });
      if (!response.ok) throw await readError(response);
      serverState.result = (await response.json()) as Record<string, unknown>;
    },
  });
  return { ...outcome, result: serverState.result };
}

export async function returnFieldTruckPart(args: {
  scope: OfflineMutationScope;
  payload: FieldReturnTruckPartPayload;
}): Promise<{
  queued: boolean;
  conflicted: boolean;
  result: Record<string, unknown> | null;
}> {
  await hydrateOfflineMutationQueue();
  const serverState: { result: Record<string, unknown> | null } = {
    result: null,
  };
  const outcome = await runMutationWithOfflineQueue({
    clientMutationId: args.payload.operationKey,
    actionType: "field-inventory:return-part",
    payload: args.payload,
    scope: args.scope,
    queueOnOffline: true,
    dependsOn: lastVisitMutationDependency(args.payload.visitId),
    orderKey: `service-visit:${args.payload.visitId}`,
    bestEffortOnlineHistory: true,
    runner: async () => {
      const response = await fetch("/api/mobile/service/truck-inventory/return", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": args.payload.operationKey,
        },
        body: JSON.stringify(args.payload),
      });
      if (!response.ok) throw await readError(response);
      serverState.result = (await response.json()) as Record<string, unknown>;
    },
  });
  return { ...outcome, result: serverState.result };
}

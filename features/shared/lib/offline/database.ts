"use client";

import Dexie, { type Table } from "dexie";

export type StoredOfflineMutation = {
  clientMutationId: string;
  actionType: string;
  payload: unknown;
  createdAt: string;
  retryCount: number;
  userId: string;
  shopId: string;
  dependsOn?: string[];
  orderKey?: string;
  status: "queued" | "syncing" | "failed" | "synced" | "conflicted";
  lastError?: string;
  conflictReason?: string;
  syncedAt?: string;
};

export type OfflineSnapshot<T = unknown> = {
  key: string;
  kind: string;
  entityId: string;
  userId: string;
  shopId: string;
  updatedAt: string;
  expiresAt: string;
  data: T;
};

export type OfflineBlobRecord = {
  id: string;
  userId: string;
  shopId: string;
  createdAt: string;
  fileName: string;
  mimeType: string;
  blob: Blob;
};

export type OfflineDatabaseStats = {
  mutations: number;
  snapshots: number;
  blobs: number;
  blobBytes: number;
};

type OfflineProtocolRecord = {
  key: string;
  version: number;
  updatedAt: string;
};

class ProFixIQOfflineDatabase extends Dexie {
  mutations!: Table<StoredOfflineMutation, string>;
  snapshots!: Table<OfflineSnapshot, string>;
  blobs!: Table<OfflineBlobRecord, string>;
  protocol!: Table<OfflineProtocolRecord, string>;

  constructor() {
    super("profixiq-offline-v1");
    this.version(1).stores({
      mutations:
        "&clientMutationId, [userId+shopId], status, actionType, createdAt",
      snapshots: "&key, [userId+shopId], kind, entityId, updatedAt, expiresAt",
      blobs: "&id, [userId+shopId], createdAt",
    });
    // Version 2 is a rollout fence, not just a schema convenience. Dexie closes
    // older v1 connections on `versionchange`, and an already-upgraded database
    // cannot be reopened by the former full-table queue writer. That prevents a
    // stale PWA bundle from clearing delta-written mutations after deployment.
    this.version(2)
      .stores({
        mutations:
          "&clientMutationId, [userId+shopId], status, actionType, createdAt",
        snapshots:
          "&key, [userId+shopId], kind, entityId, updatedAt, expiresAt",
        blobs: "&id, [userId+shopId], createdAt",
        protocol: "&key",
      })
      .upgrade(async (transaction) => {
        await transaction.table<OfflineProtocolRecord, string>("protocol").put({
          key: "mutation-writer",
          version: 2,
          updatedAt: new Date().toISOString(),
        });
      });
  }
}

let database: ProFixIQOfflineDatabase | null = null;

function getDatabase(): ProFixIQOfflineDatabase | null {
  if (typeof indexedDB === "undefined") return null;
  database ??= new ProFixIQOfflineDatabase();
  return database;
}

export async function readStoredMutations(): Promise<StoredOfflineMutation[]> {
  const db = getDatabase();
  return db ? db.mutations.toArray() : [];
}

export function offlineMutationStorageAvailable(): boolean {
  return getDatabase() !== null;
}

export async function upsertStoredMutations(
  mutations: StoredOfflineMutation[],
): Promise<boolean> {
  const db = getDatabase();
  if (!db) return false;
  if (mutations.length > 0) await db.mutations.bulkPut(mutations);
  return true;
}

export async function insertStoredMutationsIfMissing(
  mutations: StoredOfflineMutation[],
): Promise<boolean> {
  const db = getDatabase();
  if (!db) return false;
  if (mutations.length === 0) return true;

  await db.transaction("rw", db.mutations, async () => {
    const unique = [
      ...new Map(
        mutations.map((row) => [row.clientMutationId, row] as const),
      ).values(),
    ];
    const existing = await db.mutations.bulkGet(
      unique.map((row) => row.clientMutationId),
    );
    const missing = unique.filter((_, index) => !existing[index]);
    if (missing.length > 0) await db.mutations.bulkAdd(missing);
  });
  return true;
}

/**
 * Recover replay work only after the caller has acquired the cross-tab replay
 * lock. The read and status transition share one IndexedDB transaction so a
 * committed queue snapshot can never expose only part of the recovery.
 */
export async function recoverInterruptedStoredMutations(scope: {
  userId: string;
  shopId: string;
}): Promise<number | null> {
  const db = getDatabase();
  if (!db) return null;

  return db.transaction("rw", db.mutations, async () => {
    const rows = await db.mutations
      .where("[userId+shopId]")
      .equals([scope.userId, scope.shopId])
      .filter((row) => row.status === "syncing")
      .toArray();
    if (rows.length > 0) {
      await db.mutations.bulkPut(
        rows.map((row) => ({ ...row, status: "failed" as const })),
      );
    }
    return rows.length;
  });
}

/**
 * Claim the current durable mutation payload for replay. `null` means durable
 * storage is unavailable; `undefined` means the row is no longer replayable.
 */
export async function claimStoredMutationForReplay(args: {
  clientMutationId: string;
  scope: { userId: string; shopId: string };
}): Promise<StoredOfflineMutation | null | undefined> {
  const db = getDatabase();
  if (!db) return null;

  return db.transaction("rw", db.mutations, async () => {
    const row = await db.mutations.get(args.clientMutationId);
    if (
      !row ||
      row.userId !== args.scope.userId ||
      row.shopId !== args.scope.shopId ||
      !["queued", "failed"].includes(row.status)
    ) {
      return undefined;
    }
    const claimed: StoredOfflineMutation = { ...row, status: "syncing" };
    await db.mutations.put(claimed);
    return claimed;
  });
}

export async function deleteStoredMutations(
  clientMutationIds: string[],
): Promise<boolean> {
  const db = getDatabase();
  if (!db) return false;
  if (clientMutationIds.length > 0) {
    await db.mutations.bulkDelete([...new Set(clientMutationIds)]);
  }
  return true;
}

/**
 * History cleanup must never delete a row that another tab has revived as
 * pending. IndexedDB serializes this read-and-delete transaction with other
 * writers, and the status is rechecked inside the transaction.
 */
export async function deleteSyncedStoredMutations(args: {
  scope?: { userId: string; shopId: string };
  clientMutationIds?: string[];
}): Promise<string[] | null> {
  const db = getDatabase();
  if (!db) return null;

  return db.transaction("rw", db.mutations, async () => {
    const requestedIds = args.clientMutationIds?.length
      ? new Set(args.clientMutationIds)
      : null;
    const candidates = args.scope
      ? await db.mutations
          .where("[userId+shopId]")
          .equals([args.scope.userId, args.scope.shopId])
          .toArray()
      : requestedIds
        ? (
            await db.mutations.bulkGet([...requestedIds])
          ).filter((row): row is StoredOfflineMutation => Boolean(row))
        : [];
    const removable = candidates.filter(
      (row) =>
        row.status === "synced" &&
        (!requestedIds || requestedIds.has(row.clientMutationId)),
    );
    const ids = removable.map((row) => row.clientMutationId);
    if (ids.length > 0) await db.mutations.bulkDelete(ids);
    return ids;
  });
}

function snapshotKey(
  scope: { userId: string; shopId: string },
  kind: string,
  entityId: string,
): string {
  return `${scope.userId}:${scope.shopId}:${kind}:${entityId}`;
}

export async function saveOfflineSnapshot<T>(args: {
  scope: { userId: string; shopId: string };
  kind: string;
  entityId: string;
  data: T;
  maxAgeMs?: number;
}): Promise<void> {
  const db = getDatabase();
  if (!db) return;
  const now = new Date();
  const maxAgeMs = args.maxAgeMs ?? 1000 * 60 * 60 * 24 * 7;
  await db.snapshots.put({
    key: snapshotKey(args.scope, args.kind, args.entityId),
    kind: args.kind,
    entityId: args.entityId,
    userId: args.scope.userId,
    shopId: args.scope.shopId,
    updatedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + maxAgeMs).toISOString(),
    data: args.data,
  });
}

export async function getOfflineSnapshot<T>(args: {
  scope: { userId: string; shopId: string };
  kind: string;
  entityId: string;
}): Promise<OfflineSnapshot<T> | null> {
  const db = getDatabase();
  if (!db) return null;
  const row = (await db.snapshots.get(
    snapshotKey(args.scope, args.kind, args.entityId),
  )) as OfflineSnapshot<T> | undefined;
  if (!row) return null;
  if (new Date(row.expiresAt).getTime() <= Date.now()) {
    await db.snapshots.delete(row.key);
    return null;
  }
  return row;
}

export async function removeOfflineSnapshots(args: {
  scope: { userId: string; shopId: string };
  kind: string;
  entityIds: string[];
}): Promise<void> {
  const db = getDatabase();
  if (!db || args.entityIds.length === 0) return;
  await db.snapshots.bulkDelete(
    args.entityIds.map((entityId) =>
      snapshotKey(args.scope, args.kind, entityId),
    ),
  );
}

export async function listOfflineSnapshots<T>(args: {
  scope: { userId: string; shopId: string };
  kind: string;
}): Promise<Array<OfflineSnapshot<T>>> {
  const db = getDatabase();
  if (!db) return [];
  const rows = (await db.snapshots
    .where("[userId+shopId]")
    .equals([args.scope.userId, args.scope.shopId])
    .filter((row) => row.kind === args.kind)
    .toArray()) as Array<OfflineSnapshot<T>>;
  const now = Date.now();
  const expired = rows
    .filter((row) => new Date(row.expiresAt).getTime() <= now)
    .map((row) => row.key);
  if (expired.length > 0) await db.snapshots.bulkDelete(expired);
  return rows
    .filter((row) => !expired.includes(row.key))
    .sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
}

export async function saveOfflineBlob(
  record: OfflineBlobRecord,
): Promise<void> {
  const db = getDatabase();
  if (!db)
    throw new Error("Offline file storage is unavailable on this device.");
  await db.blobs.put(record);
}

export async function getOfflineBlob(
  id: string,
): Promise<OfflineBlobRecord | null> {
  const db = getDatabase();
  return db ? ((await db.blobs.get(id)) ?? null) : null;
}

export async function removeOfflineBlob(id: string): Promise<void> {
  const db = getDatabase();
  if (db) await db.blobs.delete(id);
}

export async function getOfflineDatabaseStats(scope: {
  userId: string;
  shopId: string;
}): Promise<OfflineDatabaseStats> {
  const db = getDatabase();
  if (!db) return { mutations: 0, snapshots: 0, blobs: 0, blobBytes: 0 };
  const compoundScope: [string, string] = [scope.userId, scope.shopId];
  const [mutations, snapshots, blobs] = await Promise.all([
    db.mutations.where("[userId+shopId]").equals(compoundScope).count(),
    db.snapshots.where("[userId+shopId]").equals(compoundScope).count(),
    db.blobs.where("[userId+shopId]").equals(compoundScope).toArray(),
  ]);
  return {
    mutations,
    snapshots,
    blobs: blobs.length,
    blobBytes: blobs.reduce((total, row) => total + row.blob.size, 0),
  };
}

export async function pruneOfflineDatabase(args: {
  scope: { userId: string; shopId: string };
  retainedBlobIds: Set<string>;
}): Promise<{ snapshotsRemoved: number; blobsRemoved: number }> {
  const db = getDatabase();
  if (!db) return { snapshotsRemoved: 0, blobsRemoved: 0 };
  const compoundScope: [string, string] = [
    args.scope.userId,
    args.scope.shopId,
  ];
  const [snapshots, blobs] = await Promise.all([
    db.snapshots.where("[userId+shopId]").equals(compoundScope).toArray(),
    db.blobs.where("[userId+shopId]").equals(compoundScope).toArray(),
  ]);
  const now = Date.now();
  const expiredSnapshotKeys = snapshots
    .filter((row) => new Date(row.expiresAt).getTime() <= now)
    .map((row) => row.key);
  const orphanBlobIds = blobs
    .filter(
      (row) =>
        !args.retainedBlobIds.has(row.id) &&
        now - new Date(row.createdAt).getTime() > 1000 * 60 * 60,
    )
    .map((row) => row.id);
  await Promise.all([
    expiredSnapshotKeys.length
      ? db.snapshots.bulkDelete(expiredSnapshotKeys)
      : Promise.resolve(),
    orphanBlobIds.length
      ? db.blobs.bulkDelete(orphanBlobIds)
      : Promise.resolve(),
  ]);
  return {
    snapshotsRemoved: expiredSnapshotKeys.length,
    blobsRemoved: orphanBlobIds.length,
  };
}

export async function clearOfflineDatabase(): Promise<void> {
  const db = getDatabase();
  if (!db) return;
  await db.transaction(
    "rw",
    [db.mutations, db.snapshots, db.blobs],
    async () => {
      await Promise.all([
        db.mutations.clear(),
        db.snapshots.clear(),
        db.blobs.clear(),
      ]);
    },
  );
}

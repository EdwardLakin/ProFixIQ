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

class ProFixIQOfflineDatabase extends Dexie {
  mutations!: Table<StoredOfflineMutation, string>;
  snapshots!: Table<OfflineSnapshot, string>;
  blobs!: Table<OfflineBlobRecord, string>;

  constructor() {
    super("profixiq-offline-v1");
    this.version(1).stores({
      mutations:
        "&clientMutationId, [userId+shopId], status, actionType, createdAt",
      snapshots: "&key, [userId+shopId], kind, entityId, updatedAt, expiresAt",
      blobs: "&id, [userId+shopId], createdAt",
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

export async function replaceStoredMutations(
  mutations: StoredOfflineMutation[],
): Promise<void> {
  const db = getDatabase();
  if (!db) return;
  await db.transaction("rw", db.mutations, async () => {
    await db.mutations.clear();
    if (mutations.length > 0) await db.mutations.bulkPut(mutations);
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

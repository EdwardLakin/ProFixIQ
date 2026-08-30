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

const OFFLINE_DATABASE_WRITE_LOCK_NAME = "profixiq.offline.state.v1";

type OfflineDatabaseLockManager = {
  request<T>(name: string, callback: () => Promise<T>): Promise<T>;
};

declare const offlineDatabaseWriteLockBrand: unique symbol;

export type OfflineDatabaseWriteLock = {
  readonly [offlineDatabaseWriteLockBrand]: true;
};

const offlineDatabaseWriteLock = {} as OfflineDatabaseWriteLock;

function getOfflineDatabaseLockManager(): OfflineDatabaseLockManager | null {
  if (typeof navigator === "undefined") return null;
  const candidate = (
    navigator as Navigator & {
      locks?: { request?: unknown };
    }
  ).locks;
  return candidate && typeof candidate.request === "function"
    ? (candidate as OfflineDatabaseLockManager)
    : null;
}

export async function withOfflineDatabaseWriteLock<T>(
  callback: (lock: OfflineDatabaseWriteLock) => Promise<T>,
): Promise<T> {
  const lockManager = getOfflineDatabaseLockManager();
  return lockManager
    ? lockManager.request(OFFLINE_DATABASE_WRITE_LOCK_NAME, () =>
        callback(offlineDatabaseWriteLock),
      )
    : callback(offlineDatabaseWriteLock);
}

function runOfflineDatabaseWrite<T>(
  lock: OfflineDatabaseWriteLock | undefined,
  callback: () => Promise<T>,
): Promise<T> {
  return lock ? callback() : withOfflineDatabaseWriteLock(() => callback());
}

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
  lock?: OfflineDatabaseWriteLock,
): Promise<boolean> {
  const db = getDatabase();
  if (!db) return false;
  return runOfflineDatabaseWrite(lock, async () => {
    if (mutations.length > 0) await db.mutations.bulkPut(mutations);
    return true;
  });
}

export async function insertStoredMutationsIfMissing(
  mutations: StoredOfflineMutation[],
  lock?: OfflineDatabaseWriteLock,
): Promise<boolean> {
  const db = getDatabase();
  if (!db) return false;
  if (mutations.length === 0) return true;

  return runOfflineDatabaseWrite(lock, async () => {
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
  });
}

/**
 * Recover replay work only after the caller has acquired the cross-tab replay
 * lock. The read and status transition share one IndexedDB transaction so a
 * committed queue snapshot can never expose only part of the recovery.
 */
export async function recoverInterruptedStoredMutations(
  scope: {
    userId: string;
    shopId: string;
  },
  lock?: OfflineDatabaseWriteLock,
): Promise<number | null> {
  const db = getDatabase();
  if (!db) return null;

  return runOfflineDatabaseWrite(lock, () =>
    db.transaction("rw", db.mutations, async () => {
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
    }),
  );
}

/**
 * Claim the current durable mutation payload for replay. `null` means durable
 * storage is unavailable; `undefined` means the row is no longer replayable.
 */
export async function claimStoredMutationForReplay(
  args: {
    clientMutationId: string;
    scope: { userId: string; shopId: string };
  },
  lock?: OfflineDatabaseWriteLock,
): Promise<StoredOfflineMutation | null | undefined> {
  const db = getDatabase();
  if (!db) return null;

  return runOfflineDatabaseWrite(lock, () =>
    db.transaction("rw", db.mutations, async () => {
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
    }),
  );
}

export async function deleteStoredMutations(
  clientMutationIds: string[],
  lock?: OfflineDatabaseWriteLock,
): Promise<boolean> {
  const db = getDatabase();
  if (!db) return false;
  return runOfflineDatabaseWrite(lock, async () => {
    if (clientMutationIds.length > 0) {
      await db.mutations.bulkDelete([...new Set(clientMutationIds)]);
    }
    return true;
  });
}

/**
 * History cleanup must never delete a row that another tab has revived as
 * pending. IndexedDB serializes this read-and-delete transaction with other
 * writers, and the status is rechecked inside the transaction.
 */
export async function deleteSyncedStoredMutations(
  args: {
    scope?: { userId: string; shopId: string };
    clientMutationIds?: string[];
  },
  lock?: OfflineDatabaseWriteLock,
): Promise<string[] | null> {
  const db = getDatabase();
  if (!db) return null;

  return runOfflineDatabaseWrite(lock, () =>
    db.transaction("rw", db.mutations, async () => {
      const requestedIds = args.clientMutationIds?.length
        ? new Set(args.clientMutationIds)
        : null;
      const candidates = args.scope
        ? await db.mutations
            .where("[userId+shopId]")
            .equals([args.scope.userId, args.scope.shopId])
            .toArray()
        : requestedIds
          ? (await db.mutations.bulkGet([...requestedIds])).filter(
              (row): row is StoredOfflineMutation => Boolean(row),
            )
          : [];
      const removable = candidates.filter(
        (row) =>
          row.status === "synced" &&
          (!requestedIds || requestedIds.has(row.clientMutationId)),
      );
      const ids = removable.map((row) => row.clientMutationId);
      if (ids.length > 0) await db.mutations.bulkDelete(ids);
      return ids;
    }),
  );
}

function snapshotKey(
  scope: { userId: string; shopId: string },
  kind: string,
  entityId: string,
): string {
  return `${scope.userId}:${scope.shopId}:${kind}:${entityId}`;
}

export async function saveOfflineSnapshot<T>(
  args: {
    scope: { userId: string; shopId: string };
    kind: string;
    entityId: string;
    data: T;
    maxAgeMs?: number;
  },
  lock?: OfflineDatabaseWriteLock,
): Promise<void> {
  const db = getDatabase();
  if (!db) return;
  const now = new Date();
  const maxAgeMs = args.maxAgeMs ?? 1000 * 60 * 60 * 24 * 7;
  await runOfflineDatabaseWrite(lock, () =>
    db.snapshots.put({
      key: snapshotKey(args.scope, args.kind, args.entityId),
      kind: args.kind,
      entityId: args.entityId,
      userId: args.scope.userId,
      shopId: args.scope.shopId,
      updatedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + maxAgeMs).toISOString(),
      data: args.data,
    }),
  );
}

export async function getOfflineSnapshot<T>(
  args: {
    scope: { userId: string; shopId: string };
    kind: string;
    entityId: string;
  },
  lock?: OfflineDatabaseWriteLock,
): Promise<OfflineSnapshot<T> | null> {
  const db = getDatabase();
  if (!db) return null;
  const row = (await db.snapshots.get(
    snapshotKey(args.scope, args.kind, args.entityId),
  )) as OfflineSnapshot<T> | undefined;
  if (!row) return null;
  if (new Date(row.expiresAt).getTime() <= Date.now()) {
    return runOfflineDatabaseWrite(lock, async () => {
      const current = (await db.snapshots.get(row.key)) as
        | OfflineSnapshot<T>
        | undefined;
      if (!current) return null;
      if (new Date(current.expiresAt).getTime() > Date.now()) return current;
      await db.snapshots.delete(current.key);
      return null;
    });
  }
  return row;
}

export async function removeOfflineSnapshots(
  args: {
    scope: { userId: string; shopId: string };
    kind: string;
    entityIds: string[];
  },
  lock?: OfflineDatabaseWriteLock,
): Promise<void> {
  const db = getDatabase();
  if (!db || args.entityIds.length === 0) return;
  await runOfflineDatabaseWrite(lock, () =>
    db.snapshots.bulkDelete(
      args.entityIds.map((entityId) =>
        snapshotKey(args.scope, args.kind, entityId),
      ),
    ),
  );
}

export async function listOfflineSnapshots<T>(
  args: {
    scope: { userId: string; shopId: string };
    kind: string;
  },
  lock?: OfflineDatabaseWriteLock,
): Promise<Array<OfflineSnapshot<T>>> {
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
  let removedExpired = new Set<string>();
  if (expired.length > 0) {
    removedExpired = await runOfflineDatabaseWrite(lock, async () => {
      const current = await db.snapshots.bulkGet(expired);
      const stillExpired = current
        .filter(
          (row): row is OfflineSnapshot =>
            row != null && new Date(row.expiresAt).getTime() <= Date.now(),
        )
        .map((row) => row.key);
      if (stillExpired.length > 0) {
        await db.snapshots.bulkDelete(stillExpired);
      }
      return new Set(stillExpired);
    });
  }
  return rows
    .filter((row) => !removedExpired.has(row.key))
    .sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
}

export async function saveOfflineBlob(
  record: OfflineBlobRecord,
  lock?: OfflineDatabaseWriteLock,
): Promise<void> {
  const db = getDatabase();
  if (!db)
    throw new Error("Offline file storage is unavailable on this device.");
  await runOfflineDatabaseWrite(lock, () => db.blobs.put(record));
}

export async function getOfflineBlob(
  id: string,
): Promise<OfflineBlobRecord | null> {
  const db = getDatabase();
  return db ? ((await db.blobs.get(id)) ?? null) : null;
}

export async function removeOfflineBlob(
  id: string,
  lock?: OfflineDatabaseWriteLock,
): Promise<void> {
  const db = getDatabase();
  if (db) {
    await runOfflineDatabaseWrite(lock, () => db.blobs.delete(id));
  }
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

export async function pruneOfflineDatabase(
  args: {
    scope: { userId: string; shopId: string };
    retainedBlobIds: Set<string>;
  },
  lock?: OfflineDatabaseWriteLock,
): Promise<{ snapshotsRemoved: number; blobsRemoved: number }> {
  const db = getDatabase();
  if (!db) return { snapshotsRemoved: 0, blobsRemoved: 0 };
  return runOfflineDatabaseWrite(lock, async () => {
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
  });
}

/**
 * Count durable mutations that have not yet reached the server. This reads the
 * database rather than the in-memory queue so a sign-out decision is correct
 * even when the queue has not hydrated in this tab.
 */
export async function countUnsyncedOfflineMutations(): Promise<number> {
  const db = getDatabase();
  if (!db) return 0;
  return db.mutations.where("status").notEqual("synced").count();
}

/**
 * Snapshot kinds that hold unsent user work rather than a read-through cache.
 * These are editable drafts written before any queue row exists, so clearing
 * them on sign-out destroys work exactly as dropping a pending mutation would.
 */
const WRITE_BEARING_SNAPSHOT_KINDS = new Set([
  "inspection-draft",
  "parts-request-draft",
  "message-draft",
]);

export function isWriteBearingSnapshotKind(kind: string): boolean {
  return WRITE_BEARING_SNAPSHOT_KINDS.has(kind);
}

/**
 * Count durable work that has not reached the server: unsynced mutations plus
 * write-bearing snapshot drafts, which can exist before any mutation does.
 */
export async function countUnsyncedOfflineWork(): Promise<number> {
  const db = getDatabase();
  if (!db) return 0;
  const unsynced = await db.mutations.where("status").notEqual("synced").count();
  if (unsynced > 0) return unsynced;
  let drafts = 0;
  await db.snapshots.each((row) => {
    if (isWriteBearingSnapshotKind(String(row.kind))) drafts += 1;
  });
  return drafts;
}

/**
 * Clear session-scoped offline state while retaining work that has not reached
 * the server: unsynced mutations, the attachment blobs they reference, and
 * write-bearing snapshot drafts. Disposable read-through snapshots,
 * already-synced mutations, and orphaned blobs are removed.
 */
export async function clearOfflineDatabasePreservingUnsyncedWork(
  lock?: OfflineDatabaseWriteLock,
): Promise<void> {
  const db = getDatabase();
  if (!db) return;
  await runOfflineDatabaseWrite(lock, () =>
    db.transaction("rw", [db.mutations, db.snapshots, db.blobs], async () => {
      await db.mutations.where("status").equals("synced").delete();

      // Drop only disposable cache snapshots; keep editable drafts.
      const disposableKeys: string[] = [];
      await db.snapshots.each((row) => {
        if (!isWriteBearingSnapshotKind(String(row.kind))) {
          disposableKeys.push(row.key);
        }
      });
      if (disposableKeys.length > 0) {
        await db.snapshots.bulkDelete(disposableKeys);
      }

      // Retain only blobs a surviving mutation still references. An interrupted
      // photo save otherwise leaves a former user's media on a shared device.
      const referenced = new Set<string>();
      await db.mutations.each((row) => {
        for (const id of collectBlobIds(row)) referenced.add(id);
      });
      const orphans: string[] = [];
      await db.blobs.each((row) => {
        if (!referenced.has(row.id)) orphans.push(row.id);
      });
      if (orphans.length > 0) await db.blobs.bulkDelete(orphans);
    }),
  );
}

/** Blob ids live inside mutation payloads rather than a typed column. */
function collectBlobIds(row: unknown): string[] {
  const found: string[] = [];
  const visit = (value: unknown, depth: number) => {
    if (depth > 6 || value == null) return;
    if (typeof value === "string") {
      found.push(value);
      return;
    }
    if (Array.isArray(value)) {
      for (const entry of value) visit(entry, depth + 1);
      return;
    }
    if (typeof value === "object") {
      for (const entry of Object.values(value as Record<string, unknown>)) {
        visit(entry, depth + 1);
      }
    }
  };
  visit(row, 0);
  return found;
}

export async function clearOfflineDatabase(
  lock?: OfflineDatabaseWriteLock,
): Promise<void> {
  const db = getDatabase();
  if (!db) return;
  await runOfflineDatabaseWrite(lock, () =>
    db.transaction("rw", [db.mutations, db.snapshots, db.blobs], async () => {
      await Promise.all([
        db.mutations.clear(),
        db.snapshots.clear(),
        db.blobs.clear(),
      ]);
    }),
  );
}

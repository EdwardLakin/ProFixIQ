import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type StoredRow = {
  clientMutationId: string;
  actionType: string;
  payload: unknown;
  createdAt: string;
  retryCount: number;
  userId: string;
  shopId: string;
  status: "queued" | "syncing" | "failed" | "synced" | "conflicted";
  syncedAt?: string;
};

type ReadBarrier = {
  expected: number;
  seen: number;
  promise: Promise<void>;
  release: () => void;
};

const storage = vi.hoisted(() => ({
  rows: new Map<string, StoredRow>(),
  barrier: null as ReadBarrier | null,
  blockedRead: null as
    | {
        started: Promise<void>;
        markStarted: () => void;
        promise: Promise<void>;
        release: () => void;
      }
    | null,
  failNextRead: null as Error | null,
  upsertFailure: null as Error | null,
}));

vi.mock("@/features/shared/lib/offline/database", () => ({
  clearOfflineDatabase: vi.fn(async () => storage.rows.clear()),
  deleteStoredMutations: vi.fn(async (ids: string[]) => {
    for (const id of ids) storage.rows.delete(id);
    return true;
  }),
  deleteSyncedStoredMutations: vi.fn(
    async (args: {
      scope?: { userId: string; shopId: string };
      clientMutationIds?: string[];
    }) => {
      const requested = args.clientMutationIds
        ? new Set(args.clientMutationIds)
        : null;
      const removed: string[] = [];
      for (const row of storage.rows.values()) {
        const scopeMatches =
          !args.scope ||
          (row.userId === args.scope.userId && row.shopId === args.scope.shopId);
        if (
          row.status === "synced" &&
          scopeMatches &&
          (!requested || requested.has(row.clientMutationId))
        ) {
          removed.push(row.clientMutationId);
        }
      }
      for (const id of removed) storage.rows.delete(id);
      return removed;
    },
  ),
  getOfflineBlob: vi.fn(async () => null),
  insertStoredMutationsIfMissing: vi.fn(async (rows: StoredRow[]) => {
    for (const row of rows) {
      if (!storage.rows.has(row.clientMutationId)) {
        storage.rows.set(row.clientMutationId, { ...row });
      }
    }
    return true;
  }),
  offlineMutationStorageAvailable: vi.fn(() => true),
  pruneOfflineDatabase: vi.fn(async () => ({
    snapshotsRemoved: 0,
    blobsRemoved: 0,
  })),
  readStoredMutations: vi.fn(async () => {
    const snapshot = [...storage.rows.values()].map((row) => ({ ...row }));
    const blockedRead = storage.blockedRead;
    if (blockedRead) {
      storage.blockedRead = null;
      blockedRead.markStarted();
      await blockedRead.promise;
      return snapshot;
    }
    if (storage.failNextRead) {
      const error = storage.failNextRead;
      storage.failNextRead = null;
      throw error;
    }
    const barrier = storage.barrier;
    if (barrier && barrier.seen < barrier.expected) {
      barrier.seen += 1;
      if (barrier.seen === barrier.expected) barrier.release();
      await barrier.promise;
    }
    return snapshot;
  }),
  removeOfflineBlob: vi.fn(async () => undefined),
  upsertStoredMutations: vi.fn(async (rows: StoredRow[]) => {
    if (storage.upsertFailure) throw storage.upsertFailure;
    for (const row of rows) storage.rows.set(row.clientMutationId, { ...row });
    return true;
  }),
}));

class TestBroadcastChannel {
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  constructor(name: string) {
    void name;
  }
  postMessage(message: unknown): void {
    void message;
  }
  close(): void {
    return undefined;
  }
}

function armStaleReadBarrier(expected: number): void {
  let release: () => void = () => {};
  const promise = new Promise<void>((resolve) => {
    release = () => resolve();
  });
  storage.barrier = { expected, seen: 0, promise, release };
}

function armSingleReadBarrier(): {
  started: Promise<void>;
  release: () => void;
} {
  let markStarted: () => void = () => {};
  let release: () => void = () => {};
  const started = new Promise<void>((resolve) => {
    markStarted = resolve;
  });
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  storage.blockedRead = { started, markStarted, promise, release };
  return { started, release };
}

async function loadTab() {
  vi.resetModules();
  const tab = await import("@/features/shared/lib/offline/mutations");
  tab.setOfflineMutationScope({ userId: "user-1", shopId: "shop-1" });
  await tab.hydrateOfflineMutationQueue();
  return tab;
}

describe("offline mutation cross-tab atomicity", () => {
  beforeEach(() => {
    storage.rows.clear();
    storage.barrier = null;
    storage.blockedRead = null;
    storage.failNextRead = null;
    storage.upsertFailure = null;
    localStorage.clear();
    vi.stubGlobal("BroadcastChannel", TestBroadcastChannel);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("persists queue deltas without clearing the mutation table", () => {
    const database = readFileSync(
      "features/shared/lib/offline/database.ts",
      "utf8",
    );
    const upsert = database.slice(
      database.indexOf("export async function upsertStoredMutations"),
      database.indexOf("export async function deleteStoredMutations"),
    );
    const mutations = readFileSync(
      "features/shared/lib/offline/mutations.ts",
      "utf8",
    );

    expect(upsert).toContain("bulkPut");
    expect(upsert).not.toContain(".clear(");
    expect(database).toContain('row.status === "synced"');
    expect(mutations).not.toContain("replaceStoredMutations");
    expect(mutations).toContain("new BroadcastChannel(QUEUE_CHANNEL_NAME)");
    expect(mutations).toContain("QUEUE_REVISION_KEY");
    expect(mutations).toContain("refreshQueueCacheFromStorage");
  });

  it("retains both unsynced photo mutations when two stale tabs write together", async () => {
    const tabA = await loadTab();
    const tabB = await loadTab();
    armStaleReadBarrier(2);

    await Promise.all([
      tabA.enqueueMutation({
        clientMutationId: "tab-a-photo",
        actionType: "upload_job_photo",
        payload: { blobId: "blob-a" },
        userId: "user-1",
        shopId: "shop-1",
      }),
      tabB.enqueueMutation({
        clientMutationId: "tab-b-photo",
        actionType: "upload_job_photo",
        payload: { blobId: "blob-b" },
        userId: "user-1",
        shopId: "shop-1",
      }),
    ]);

    expect([...storage.rows.keys()].sort()).toEqual([
      "tab-a-photo",
      "tab-b-photo",
    ]);
    expect(
      [...storage.rows.values()].map((row) =>
        (row.payload as { blobId: string }).blobId,
      ),
    ).toEqual(expect.arrayContaining(["blob-a", "blob-b"]));
  });

  it("surfaces storage failure without discarding existing pending work", async () => {
    storage.rows.set("existing", {
      clientMutationId: "existing",
      actionType: "save_story_draft",
      payload: { correction: "retained" },
      createdAt: new Date().toISOString(),
      retryCount: 0,
      userId: "user-1",
      shopId: "shop-1",
      status: "queued",
    });
    const tab = await loadTab();
    storage.upsertFailure = new Error("IndexedDB quota exceeded");

    await expect(
      tab.enqueueMutation({
        clientMutationId: "new-write",
        actionType: "save_story_draft",
        payload: { correction: "new" },
        userId: "user-1",
        shopId: "shop-1",
      }),
    ).rejects.toThrow("IndexedDB quota exceeded");
    expect(storage.rows.get("existing")?.status).toBe("queued");
    expect(storage.rows.has("new-write")).toBe(false);
  });

  it("preserves an in-flight mutation during live storage refreshes", async () => {
    storage.rows.set("in-flight", {
      clientMutationId: "in-flight",
      actionType: "save_story_draft",
      payload: { correction: "running" },
      createdAt: new Date().toISOString(),
      retryCount: 0,
      userId: "user-1",
      shopId: "shop-1",
      status: "queued",
    });
    const tab = await loadTab();
    let releaseHandler: () => void = () => {};
    const handlerRelease = new Promise<void>((resolve) => {
      releaseHandler = resolve;
    });
    let markHandlerEntered: () => void = () => {};
    const handlerEntered = new Promise<void>((resolve) => {
      markHandlerEntered = resolve;
    });

    const replay = tab.replayQueuedMutations({
      scope: { userId: "user-1", shopId: "shop-1" },
      handlers: {
        save_story_draft: async () => {
          markHandlerEntered();
          await handlerRelease;
        },
      },
    });

    await handlerEntered;
    expect(tab.listOfflineMutations()[0]?.status).toBe("syncing");
    releaseHandler();
    await expect(replay).resolves.toEqual({
      replayed: 1,
      failed: 0,
      conflicted: 0,
    });
  });

  it("applies an older successful refresh when a newer read fails", async () => {
    const tab = await loadTab();
    const unsubscribe = tab.subscribeOfflineMutations(() => undefined);
    storage.rows.set("committed-elsewhere", {
      clientMutationId: "committed-elsewhere",
      actionType: "save_story_draft",
      payload: { correction: "retained" },
      createdAt: new Date().toISOString(),
      retryCount: 0,
      userId: "user-1",
      shopId: "shop-1",
      status: "queued",
    });
    const blocked = armSingleReadBarrier();

    window.dispatchEvent(new Event("focus"));
    await blocked.started;
    storage.failNextRead = new Error("temporary IndexedDB read failure");
    window.dispatchEvent(new Event("focus"));
    await Promise.resolve();
    blocked.release();

    await vi.waitFor(() => {
      expect(
        tab
          .listOfflineMutations()
          .some((row) => row.clientMutationId === "committed-elsewhere"),
      ).toBe(true);
    });
    unsubscribe();
  });
});

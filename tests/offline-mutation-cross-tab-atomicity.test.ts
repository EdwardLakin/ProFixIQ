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
  recoveriesOutsideLock: 0,
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
  recoverInterruptedStoredMutations: vi.fn(
    async (scope: { userId: string; shopId: string }) => {
      const activeLocks = (
        typeof navigator === "undefined"
          ? null
          : (navigator as Navigator & { locks?: { active?: number } }).locks
      )?.active;
      if (!activeLocks) storage.recoveriesOutsideLock += 1;
      let recovered = 0;
      for (const [id, row] of storage.rows) {
        if (
          row.userId === scope.userId &&
          row.shopId === scope.shopId &&
          row.status === "syncing"
        ) {
          storage.rows.set(id, { ...row, status: "failed" });
          recovered += 1;
        }
      }
      return recovered;
    },
  ),
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

class TestReplayLockManager {
  requestCount = 0;
  active = 0;
  maxActive = 0;
  private readonly tails = new Map<string, Promise<void>>();

  async request<T>(name: string, callback: () => Promise<T>): Promise<T> {
    this.requestCount += 1;
    const previous = this.tails.get(name) ?? Promise.resolve();
    let release: () => void = () => {};
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tail = previous.then(() => current);
    this.tails.set(name, tail);
    await previous;
    this.active += 1;
    this.maxActive = Math.max(this.maxActive, this.active);
    try {
      return await callback();
    } finally {
      this.active -= 1;
      release();
      if (this.tails.get(name) === tail) this.tails.delete(name);
    }
  }
}

let replayLocks: TestReplayLockManager;

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
    storage.recoveriesOutsideLock = 0;
    localStorage.clear();
    replayLocks = new TestReplayLockManager();
    vi.stubGlobal("BroadcastChannel", TestBroadcastChannel);
    vi.stubGlobal("navigator", { onLine: true, locks: replayLocks });
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

  it("recovers and replays an interrupted sync only after taking the replay lock", async () => {
    storage.rows.set("interrupted", {
      clientMutationId: "interrupted",
      actionType: "save_story_draft",
      payload: { correction: "recover me" },
      createdAt: new Date().toISOString(),
      retryCount: 0,
      userId: "user-1",
      shopId: "shop-1",
      status: "syncing",
    });
    storage.rows.set("other-shop-interrupted", {
      clientMutationId: "other-shop-interrupted",
      actionType: "save_story_draft",
      payload: { correction: "leave isolated" },
      createdAt: new Date().toISOString(),
      retryCount: 0,
      userId: "user-1",
      shopId: "shop-2",
      status: "syncing",
    });
    const tab = await loadTab();
    const handler = vi.fn(async () => undefined);

    expect(tab.listOfflineMutations()[0]?.status).toBe("syncing");
    await expect(
      tab.replayQueuedMutations({
        scope: { userId: "user-1", shopId: "shop-1" },
        handlers: { save_story_draft: handler },
      }),
    ).resolves.toEqual({ replayed: 1, failed: 0, conflicted: 0 });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(storage.rows.get("interrupted")?.status).toBe("synced");
    expect(storage.rows.get("other-shop-interrupted")?.status).toBe("syncing");
    expect(replayLocks.maxActive).toBe(1);
    expect(storage.recoveriesOutsideLock).toBe(0);
  });

  it("does not recover or replay another tab's active mutation", async () => {
    storage.rows.set("shared-replay", {
      clientMutationId: "shared-replay",
      actionType: "save_story_draft",
      payload: { correction: "one replay" },
      createdAt: new Date().toISOString(),
      retryCount: 0,
      userId: "user-1",
      shopId: "shop-1",
      status: "queued",
    });
    const tabA = await loadTab();
    const tabB = await loadTab();
    let releaseFirstHandler: () => void = () => {};
    const firstHandlerRelease = new Promise<void>((resolve) => {
      releaseFirstHandler = resolve;
    });
    let markFirstHandlerEntered: () => void = () => {};
    const firstHandlerEntered = new Promise<void>((resolve) => {
      markFirstHandlerEntered = resolve;
    });
    const secondHandler = vi.fn(async () => undefined);

    const firstReplay = tabA.replayQueuedMutations({
      scope: { userId: "user-1", shopId: "shop-1" },
      handlers: {
        save_story_draft: async () => {
          markFirstHandlerEntered();
          await firstHandlerRelease;
        },
      },
    });
    await firstHandlerEntered;

    const secondReplay = tabB.replayQueuedMutations({
      scope: { userId: "user-1", shopId: "shop-1" },
      handlers: { save_story_draft: secondHandler },
    });
    await vi.waitFor(() => expect(replayLocks.requestCount).toBe(2));
    expect(storage.rows.get("shared-replay")?.status).toBe("syncing");
    expect(secondHandler).not.toHaveBeenCalled();
    expect(replayLocks.maxActive).toBe(1);

    releaseFirstHandler();
    await expect(firstReplay).resolves.toEqual({
      replayed: 1,
      failed: 0,
      conflicted: 0,
    });
    await expect(secondReplay).resolves.toEqual({
      replayed: 0,
      failed: 0,
      conflicted: 0,
    });
    expect(secondHandler).not.toHaveBeenCalled();
    expect(storage.rows.get("shared-replay")?.status).toBe("synced");
  });

  it("fails closed when the browser cannot safely lock queued replay", async () => {
    storage.rows.set("requires-lock", {
      clientMutationId: "requires-lock",
      actionType: "save_story_draft",
      payload: { correction: "keep queued" },
      createdAt: new Date().toISOString(),
      retryCount: 0,
      userId: "user-1",
      shopId: "shop-1",
      status: "queued",
    });
    const tab = await loadTab();
    const handler = vi.fn(async () => undefined);
    vi.stubGlobal("navigator", { onLine: true });

    await expect(
      tab.replayQueuedMutations({
        scope: { userId: "user-1", shopId: "shop-1" },
        handlers: { save_story_draft: handler },
      }),
    ).rejects.toThrow("Safe cross-tab offline replay is unavailable");
    expect(handler).not.toHaveBeenCalled();
    expect(storage.rows.get("requires-lock")?.status).toBe("queued");
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

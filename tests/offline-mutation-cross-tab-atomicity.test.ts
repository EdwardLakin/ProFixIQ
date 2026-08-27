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

const storage = vi.hoisted(() => ({
  rows: new Map<string, StoredRow>(),
  blockedRead: null as {
    started: Promise<void>;
    markStarted: () => void;
    promise: Promise<void>;
    release: () => void;
  } | null,
  blockedInsert: null as {
    started: Promise<void>;
    markStarted: () => void;
    promise: Promise<void>;
    release: () => void;
  } | null,
  failNextRead: null as Error | null,
  upsertFailure: null as Error | null,
  recoveriesOutsideLock: 0,
  claimsOutsideLock: 0,
  available: true,
}));

vi.mock("@/features/shared/lib/offline/database", () => ({
  withOfflineDatabaseWriteLock: vi.fn(
    async <T>(callback: (lock: object) => Promise<T>) =>
      replayLocks.request("profixiq.offline.state.v1", () => callback({})),
  ),
  claimStoredMutationForReplay: vi.fn(
    async (args: {
      clientMutationId: string;
      scope: { userId: string; shopId: string };
    }) => {
      if (!storage.available) return null;
      const activeLocks = (
        typeof navigator === "undefined"
          ? null
          : (
              navigator as Navigator & {
                locks?: { activeNames?: Set<string> };
              }
            ).locks
      )?.activeNames;
      if (
        ![...(activeLocks ?? [])].some((name) =>
          name.startsWith("profixiq.offline.replay.v1:"),
        )
      ) {
        storage.claimsOutsideLock += 1;
      }
      const row = storage.rows.get(args.clientMutationId);
      if (
        !row ||
        row.userId !== args.scope.userId ||
        row.shopId !== args.scope.shopId ||
        !["queued", "failed"].includes(row.status)
      ) {
        return undefined;
      }
      const claimed = { ...row, status: "syncing" as const };
      storage.rows.set(args.clientMutationId, claimed);
      return claimed;
    },
  ),
  clearOfflineDatabase: vi.fn(async () => storage.rows.clear()),
  deleteStoredMutations: vi.fn(async (ids: string[]) => {
    if (!storage.available) return false;
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
          (row.userId === args.scope.userId &&
            row.shopId === args.scope.shopId);
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
    if (!storage.available) return false;
    const blockedInsert = storage.blockedInsert;
    if (blockedInsert) {
      storage.blockedInsert = null;
      blockedInsert.markStarted();
      await blockedInsert.promise;
    }
    for (const row of rows) {
      if (!storage.rows.has(row.clientMutationId)) {
        storage.rows.set(row.clientMutationId, { ...row });
      }
    }
    return true;
  }),
  offlineMutationStorageAvailable: vi.fn(() => storage.available),
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
    return snapshot;
  }),
  recoverInterruptedStoredMutations: vi.fn(
    async (scope: { userId: string; shopId: string }) => {
      if (!storage.available) return null;
      const activeLocks = (
        typeof navigator === "undefined"
          ? null
          : (
              navigator as Navigator & {
                locks?: { activeNames?: Set<string> };
              }
            ).locks
      )?.activeNames;
      if (
        ![...(activeLocks ?? [])].some((name) =>
          name.startsWith("profixiq.offline.replay.v1:"),
        )
      ) {
        storage.recoveriesOutsideLock += 1;
      }
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
    if (!storage.available) return false;
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
  activeNames = new Set<string>();
  requestedNames: string[] = [];
  private readonly tails = new Map<string, Promise<void>>();

  async request<T>(name: string, callback: () => Promise<T>): Promise<T> {
    this.requestCount += 1;
    this.requestedNames.push(name);
    const previous = this.tails.get(name) ?? Promise.resolve();
    let release: () => void = () => {};
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tail = previous.then(() => current);
    this.tails.set(name, tail);
    await previous;
    this.active += 1;
    this.activeNames.add(name);
    this.maxActive = Math.max(this.maxActive, this.active);
    try {
      return await callback();
    } finally {
      this.activeNames.delete(name);
      this.active -= 1;
      release();
      if (this.tails.get(name) === tail) this.tails.delete(name);
    }
  }
}

let replayLocks: TestReplayLockManager;

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

function armSingleInsertBarrier(): {
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
  storage.blockedInsert = { started, markStarted, promise, release };
  return { started, release };
}

async function loadTab() {
  vi.resetModules();
  const tab = await import("@/features/shared/lib/offline/mutations");
  tab.setOfflineMutationScope({ userId: "user-1", shopId: "shop-1" });
  await tab.hydrateOfflineMutationQueue();
  return tab;
}

async function holdScopeReplayLock(): Promise<{
  release: () => void;
  completion: Promise<void>;
}> {
  let release: () => void = () => {};
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  const completion = replayLocks.request(
    "profixiq.offline.replay.v1:user-1:shop-1",
    () => blocked,
  );
  await vi.waitFor(() => expect(replayLocks.active).toBe(1));
  return { release, completion };
}

describe("offline mutation cross-tab atomicity", () => {
  beforeEach(() => {
    storage.rows.clear();
    storage.blockedRead = null;
    storage.blockedInsert = null;
    storage.failNextRead = null;
    storage.upsertFailure = null;
    storage.recoveriesOutsideLock = 0;
    storage.claimsOutsideLock = 0;
    storage.available = true;
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
    expect(database).toContain("this.version(2)");
    expect(database).toContain('protocol: "&key"');
    expect(database).toContain("stale PWA bundle");
    expect(mutations).not.toContain("replaceStoredMutations");
    expect(mutations).toContain("new BroadcastChannel(QUEUE_CHANNEL_NAME)");
    expect(mutations).toContain("QUEUE_REVISION_KEY");
    expect(mutations).toContain("refreshQueueCacheFromStorage");
  });

  it("serializes concurrent tabs without losing either unsynced photo mutation", async () => {
    const tabA = await loadTab();
    const tabB = await loadTab();

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
      [...storage.rows.values()].map(
        (row) => (row.payload as { blobId: string }).blobId,
      ),
    ).toEqual(expect.arrayContaining(["blob-a", "blob-b"]));
    expect(
      replayLocks.requestedNames.filter((name) =>
        name.startsWith("profixiq.offline.replay.v1:"),
      ),
    ).toHaveLength(2);
    expect(replayLocks.maxActive).toBe(2);
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

  it("allows unrelated enqueues while a replay handler is waiting on the network", async () => {
    storage.rows.set("slow-replay", {
      clientMutationId: "slow-replay",
      actionType: "save_story_draft",
      payload: { correction: "slow" },
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
        save_story_draft: async (mutation) => {
          if (mutation.clientMutationId !== "slow-replay") return;
          markHandlerEntered();
          await handlerRelease;
        },
      },
    });
    await handlerEntered;

    expect(replayLocks.activeNames).toContain(
      "profixiq.offline.replay-run.v1:user-1:shop-1",
    );
    expect(replayLocks.activeNames).not.toContain(
      "profixiq.offline.replay.v1:user-1:shop-1",
    );
    await expect(
      tab.enqueueMutation({
        clientMutationId: "queued-during-handler",
        actionType: "save_story_draft",
        payload: { correction: "not blocked" },
        userId: "user-1",
        shopId: "shop-1",
      }),
    ).resolves.toMatchObject({ clientMutationId: "queued-during-handler" });
    expect(storage.rows.get("queued-during-handler")?.status).toBe("queued");

    releaseHandler();
    await expect(replay).resolves.toEqual({
      replayed: 2,
      failed: 0,
      conflicted: 0,
    });
  });

  it("does not execute a same-id online call while replay owns that mutation", async () => {
    storage.rows.set("shared-execution", {
      clientMutationId: "shared-execution",
      actionType: "save_story_draft",
      payload: { correction: "replay owns this" },
      createdAt: new Date().toISOString(),
      retryCount: 0,
      userId: "user-1",
      shopId: "shop-1",
      status: "queued",
    });
    const replayTab = await loadTab();
    const onlineTab = await loadTab();
    let releaseHandler: () => void = () => {};
    const handlerRelease = new Promise<void>((resolve) => {
      releaseHandler = resolve;
    });
    let markHandlerEntered: () => void = () => {};
    const handlerEntered = new Promise<void>((resolve) => {
      markHandlerEntered = resolve;
    });
    const replayHandler = vi.fn(async () => {
      markHandlerEntered();
      await handlerRelease;
    });
    const onlineRunner = vi.fn(async () => undefined);

    const replay = replayTab.replayQueuedMutations({
      scope: { userId: "user-1", shopId: "shop-1" },
      handlers: { save_story_draft: replayHandler },
    });
    await handlerEntered;
    const online = onlineTab.runMutationWithOfflineQueue({
      clientMutationId: "shared-execution",
      actionType: "save_story_draft",
      payload: { correction: "must not duplicate" },
      scope: { userId: "user-1", shopId: "shop-1" },
      runner: onlineRunner,
    });

    await vi.waitFor(() =>
      expect(
        replayLocks.requestedNames.filter((name) =>
          name.includes("mutation-run.v1:user-1:shop-1:shared-execution"),
        ),
      ).toHaveLength(2),
    );
    expect(onlineRunner).not.toHaveBeenCalled();
    releaseHandler();

    await expect(replay).resolves.toEqual({
      replayed: 1,
      failed: 0,
      conflicted: 0,
    });
    await expect(online).resolves.toEqual({
      queued: false,
      conflicted: false,
    });
    expect(replayHandler).toHaveBeenCalledTimes(1);
    expect(onlineRunner).not.toHaveBeenCalled();
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
    const handler = vi.fn(async (_mutation: { payload: unknown }) => undefined);

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
    expect(replayLocks.maxActive).toBe(4);
    expect(storage.recoveriesOutsideLock).toBe(0);
  });

  it("recovers an interrupted sync during offline lifecycle startup", async () => {
    storage.rows.set("offline-interrupted", {
      clientMutationId: "offline-interrupted",
      actionType: "save_story_draft",
      payload: { correction: "recover before connectivity" },
      createdAt: new Date().toISOString(),
      retryCount: 0,
      userId: "user-1",
      shopId: "shop-1",
      status: "syncing",
    });
    const tab = await loadTab();
    vi.stubGlobal("navigator", { onLine: false, locks: replayLocks });

    await expect(
      tab.recoverInterruptedOfflineMutations({
        userId: "user-1",
        shopId: "shop-1",
      }),
    ).resolves.toBe(1);

    expect(storage.rows.get("offline-interrupted")?.status).toBe("failed");
    expect(storage.recoveriesOutsideLock).toBe(0);
    expect(replayLocks.maxActive).toBe(3);
    const runtime = readFileSync(
      "features/shared/components/pwa/PwaRuntime.tsx",
      "utf8",
    );
    expect(runtime).toContain("recoverInterruptedOfflineMutations()");
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
    await vi.waitFor(() =>
      expect(
        replayLocks.requestedNames.filter((name) =>
          name.startsWith("profixiq.offline.replay-run.v1:"),
        ),
      ).toHaveLength(2),
    );
    expect(storage.rows.get("shared-replay")?.status).toBe("syncing");
    expect(secondHandler).not.toHaveBeenCalled();
    expect(replayLocks.maxActive).toBe(4);

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

  it("replays the corrected retry payload instead of a stale cross-tab snapshot", async () => {
    storage.rows.set("corrected-retry", {
      clientMutationId: "corrected-retry",
      actionType: "save_story_draft",
      payload: { correction: "stale" },
      createdAt: new Date().toISOString(),
      retryCount: 1,
      userId: "user-1",
      shopId: "shop-1",
      status: "failed",
    });
    const retryTab = await loadTab();
    const replayTab = await loadTab();
    const heldLock = await holdScopeReplayLock();
    const retry = retryTab.retryOfflineMutation("corrected-retry", {
      correction: "corrected",
    });
    await vi.waitFor(() =>
      expect(
        replayLocks.requestedNames.filter(
          (name) => name === "profixiq.offline.replay.v1:user-1:shop-1",
        ),
      ).toHaveLength(2),
    );
    const handler = vi.fn(async (_mutation: { payload: unknown }) => undefined);
    const replay = replayTab.replayQueuedMutations({
      scope: { userId: "user-1", shopId: "shop-1" },
      handlers: { save_story_draft: handler },
    });
    await vi.waitFor(() =>
      expect(replayLocks.requestedNames).toContain(
        "profixiq.offline.replay-run.v1:user-1:shop-1",
      ),
    );

    heldLock.release();
    await heldLock.completion;
    await retry;
    await expect(replay).resolves.toEqual({
      replayed: 1,
      failed: 0,
      conflicted: 0,
    });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0]?.[0].payload).toEqual({
      correction: "corrected",
    });
    expect(storage.rows.get("corrected-retry")?.status).toBe("synced");
    expect(storage.claimsOutsideLock).toBe(0);
    expect(replayLocks.maxActive).toBe(4);
  });

  it("does not replay a mutation dismissed ahead of a snapshotted replay", async () => {
    storage.rows.set("dismissed-before-claim", {
      clientMutationId: "dismissed-before-claim",
      actionType: "save_story_draft",
      payload: { correction: "remove me" },
      createdAt: new Date().toISOString(),
      retryCount: 0,
      userId: "user-1",
      shopId: "shop-1",
      status: "queued",
    });
    const dismissTab = await loadTab();
    const replayTab = await loadTab();
    const heldLock = await holdScopeReplayLock();
    const dismiss = dismissTab.dismissOfflineMutation("dismissed-before-claim");
    await vi.waitFor(() =>
      expect(
        replayLocks.requestedNames.filter(
          (name) => name === "profixiq.offline.replay.v1:user-1:shop-1",
        ),
      ).toHaveLength(2),
    );
    const handler = vi.fn(async () => undefined);
    const replay = replayTab.replayQueuedMutations({
      scope: { userId: "user-1", shopId: "shop-1" },
      handlers: { save_story_draft: handler },
    });
    await vi.waitFor(() =>
      expect(replayLocks.requestedNames).toContain(
        "profixiq.offline.replay-run.v1:user-1:shop-1",
      ),
    );

    heldLock.release();
    await heldLock.completion;
    await dismiss;
    await expect(replay).resolves.toEqual({
      replayed: 0,
      failed: 0,
      conflicted: 0,
    });

    expect(handler).not.toHaveBeenCalled();
    expect(storage.rows.has("dismissed-before-claim")).toBe(false);
    expect(storage.claimsOutsideLock).toBe(0);
    expect(replayLocks.maxActive).toBe(3);
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

  it("fails closed when lifecycle updates cannot take the scope lock", async () => {
    storage.rows.set("locked-lifecycle", {
      clientMutationId: "locked-lifecycle",
      actionType: "save_story_draft",
      payload: { correction: "retained" },
      createdAt: new Date().toISOString(),
      retryCount: 1,
      userId: "user-1",
      shopId: "shop-1",
      status: "failed",
    });
    const tab = await loadTab();
    vi.stubGlobal("navigator", { onLine: true });

    await expect(
      tab.retryOfflineMutation("locked-lifecycle", {
        correction: "not persisted",
      }),
    ).rejects.toThrow("Safe cross-tab offline retry is unavailable");
    await expect(
      tab.dismissOfflineMutation("locked-lifecycle"),
    ).rejects.toThrow("Safe cross-tab offline removal is unavailable");
    await expect(
      tab.enqueueMutation({
        clientMutationId: "new-without-lock",
        actionType: "save_story_draft",
        payload: { correction: "not queued" },
        userId: "user-1",
        shopId: "shop-1",
      }),
    ).rejects.toThrow("Safe cross-tab offline queue updates are unavailable");

    expect(storage.rows.get("locked-lifecycle")?.payload).toEqual({
      correction: "retained",
    });
    expect(storage.rows.has("new-without-lock")).toBe(false);
  });

  it("invalidates an enqueue that was already waiting when sign-out clears state", async () => {
    const tab = await loadTab();
    const heldLock = await holdScopeReplayLock();
    const enqueueOutcome = tab
      .enqueueMutation({
        clientMutationId: "stale-after-signout",
        actionType: "save_story_draft",
        payload: { correction: "must not return" },
        userId: "user-1",
        shopId: "shop-1",
      })
      .then(
        () => ({ error: null }),
        (error: unknown) => ({ error }),
      );
    await vi.waitFor(() =>
      expect(
        replayLocks.requestedNames.filter(
          (name) => name === "profixiq.offline.replay.v1:user-1:shop-1",
        ),
      ).toHaveLength(2),
    );

    const clearing = tab.clearOfflineState();
    await vi.waitFor(() =>
      expect(
        replayLocks.requestedNames.filter(
          (name) => name === "profixiq.offline.state.v1",
        ),
      ).toHaveLength(3),
    );
    heldLock.release();
    await heldLock.completion;

    const outcome = await enqueueOutcome;
    expect(outcome.error).toBeInstanceOf(Error);
    expect((outcome.error as Error).message).toContain(
      "Authenticated user or shop changed",
    );
    await clearing;
    expect(storage.rows.has("stale-after-signout")).toBe(false);
    expect(
      localStorage.getItem("profixiq.pending_mutations.scope.v1"),
    ).toBeNull();
  });

  it("preserves a new-session enqueue that starts while sign-out clear is waiting", async () => {
    const tab = await loadTab();
    const heldLock = await holdScopeReplayLock();
    const stateRequestsBefore = replayLocks.requestedNames.filter(
      (name) => name === "profixiq.offline.state.v1",
    ).length;

    const clearing = tab.clearOfflineState();
    await vi.waitFor(() =>
      expect(replayLocks.activeNames).toContain("profixiq.offline.state.v1"),
    );

    tab.setOfflineMutationScope({ userId: "user-2", shopId: "shop-2" });
    const enqueuing = tab.enqueueMutation({
      clientMutationId: "new-session-during-clear",
      actionType: "save_story_draft",
      payload: { correction: "must survive" },
      userId: "user-2",
      shopId: "shop-2",
    });
    await vi.waitFor(() =>
      expect(
        replayLocks.requestedNames.filter(
          (name) => name === "profixiq.offline.state.v1",
        ).length,
      ).toBeGreaterThan(stateRequestsBefore + 1),
    );
    expect(storage.rows.has("new-session-during-clear")).toBe(false);

    heldLock.release();
    await heldLock.completion;
    await clearing;
    await enqueuing;

    expect(storage.rows.get("new-session-during-clear")).toMatchObject({
      userId: "user-2",
      shopId: "shop-2",
      status: "queued",
    });
    expect(replayLocks.maxActive).toBeGreaterThanOrEqual(2);
  });

  it("invalidates a wrapper call when sign-out occurs during hydration", async () => {
    vi.resetModules();
    const tab = await import("@/features/shared/lib/offline/mutations");
    tab.setOfflineMutationScope({ userId: "user-1", shopId: "shop-1" });
    const readBarrier = armSingleReadBarrier();
    const runner = vi.fn(async () => undefined);
    const outcome = tab.runMutationWithOfflineQueue({
      clientMutationId: "hydrating-at-signout",
      actionType: "save_story_draft",
      payload: { correction: "must not return" },
      scope: { userId: "user-1", shopId: "shop-1" },
      runner,
    });
    await readBarrier.started;

    const clearing = tab.clearOfflineState();
    readBarrier.release();

    await expect(outcome).rejects.toThrow(
      "Authenticated user or shop changed before this update",
    );
    await clearing;
    expect(runner).not.toHaveBeenCalled();
    expect(
      localStorage.getItem("profixiq.pending_mutations.scope.v1"),
    ).toBeNull();
    expect(storage.rows.has("hydrating-at-signout")).toBe(false);
  });

  it("serializes legacy hydration ahead of clear so rows cannot reappear", async () => {
    vi.resetModules();
    const tab = await import("@/features/shared/lib/offline/mutations");
    tab.setOfflineMutationScope({ userId: "user-1", shopId: "shop-1" });
    localStorage.setItem(
      "profixiq.pending_mutations.v3",
      JSON.stringify([
        {
          clientMutationId: "legacy-before-clear",
          actionType: "save_story_draft",
          payload: { correction: "must be erased" },
          createdAt: new Date().toISOString(),
          retryCount: 0,
          userId: "user-1",
          shopId: "shop-1",
          status: "queued",
        },
      ]),
    );
    const insertBarrier = armSingleInsertBarrier();
    const hydration = tab.hydrateOfflineMutationQueue();
    await insertBarrier.started;

    const clearing = tab.clearOfflineState();
    insertBarrier.release();
    await hydration;
    await clearing;

    expect(storage.rows.has("legacy-before-clear")).toBe(false);
    expect(localStorage.getItem("profixiq.pending_mutations.v3")).toBeNull();
    expect(tab.listOfflineMutations()).toEqual([]);
  });

  it("fails closed when durable storage disappears before a lifecycle update", async () => {
    storage.rows.set("durable-lifecycle", {
      clientMutationId: "durable-lifecycle",
      actionType: "save_story_draft",
      payload: { correction: "retained" },
      createdAt: new Date().toISOString(),
      retryCount: 1,
      userId: "user-1",
      shopId: "shop-1",
      status: "failed",
    });
    const tab = await loadTab();
    storage.available = false;

    await expect(
      tab.retryOfflineMutation("durable-lifecycle", {
        correction: "not persisted",
      }),
    ).rejects.toThrow("Durable offline storage is unavailable");
    await expect(
      tab.dismissOfflineMutation("durable-lifecycle"),
    ).rejects.toThrow("Durable offline storage is unavailable");
    await expect(
      tab.enqueueMutation({
        clientMutationId: "new-without-storage",
        actionType: "save_story_draft",
        payload: { correction: "not queued" },
        userId: "user-1",
        shopId: "shop-1",
      }),
    ).rejects.toThrow("Durable offline storage is unavailable");

    expect(storage.rows.get("durable-lifecycle")?.payload).toEqual({
      correction: "retained",
    });
    expect(storage.rows.has("new-without-storage")).toBe(false);
    expect(replayLocks.maxActive).toBe(2);
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

  it("runs an online canonical mutation when the initial queue read fails", async () => {
    const tab = await loadTab();
    const runner = vi.fn(async () => undefined);
    storage.failNextRead = new Error("temporary IndexedDB read failure");

    await expect(
      tab.runMutationWithOfflineQueue({
        clientMutationId: "online-storage-fallback",
        actionType: "save_story_draft",
        payload: { correction: "server first" },
        scope: { userId: "user-1", shopId: "shop-1" },
        runner,
      }),
    ).resolves.toEqual({ queued: false, conflicted: false });

    expect(runner).toHaveBeenCalledTimes(1);
    expect(storage.rows.get("online-storage-fallback")?.status).toBe("synced");
  });

  it("does not bypass a durable dependency when the online queue read fails", async () => {
    const tab = await loadTab();
    storage.rows.set("durable-predecessor", {
      clientMutationId: "durable-predecessor",
      actionType: "save_story_draft",
      payload: { correction: "must run first" },
      createdAt: new Date().toISOString(),
      retryCount: 0,
      userId: "user-1",
      shopId: "shop-1",
      status: "queued",
    });
    storage.failNextRead = new Error("temporary IndexedDB read failure");
    const runner = vi.fn(async () => undefined);

    await expect(
      tab.runMutationWithOfflineQueue({
        clientMutationId: "dependent-online-call",
        actionType: "save_story_draft",
        payload: { correction: "must wait" },
        scope: { userId: "user-1", shopId: "shop-1" },
        dependsOn: ["durable-predecessor"],
        runner,
      }),
    ).rejects.toThrow("Durable offline dependency state is unavailable");

    expect(runner).not.toHaveBeenCalled();
    expect(storage.rows.has("dependent-online-call")).toBe(false);
  });
});

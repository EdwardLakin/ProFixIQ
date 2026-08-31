import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  retainOnPreserve: false,
  fullClears: 0,
  preservingClears: 0,
  events: [] as string[],
}));

vi.mock("@/features/shared/lib/offline/database", () => ({
  withOfflineDatabaseWriteLock: vi.fn(
    async <T>(callback: (lock: object) => Promise<T>) => callback({}),
  ),
  clearOfflineDatabase: vi.fn(async () => {
    db.fullClears += 1;
    db.events.push("clear");
  }),
  clearOfflineDatabasePreservingUnsyncedWork: vi.fn(async () => {
    db.preservingClears += 1;
    db.events.push("preserve");
    return db.retainOnPreserve;
  }),
  claimStoredMutationForReplay: vi.fn(async () => null),
  deleteStoredMutations: vi.fn(async () => undefined),
  deleteSyncedStoredMutations: vi.fn(async () => undefined),
  getOfflineBlob: vi.fn(async () => null),
  insertStoredMutationsIfMissing: vi.fn(async () => undefined),
  offlineMutationStorageAvailable: vi.fn(() => true),
  pruneOfflineDatabase: vi.fn(async () => undefined),
  readStoredMutations: vi.fn(async () => []),
  recoverInterruptedStoredMutations: vi.fn(async () => undefined),
  removeOfflineBlob: vi.fn(async () => undefined),
  upsertStoredMutations: vi.fn(async () => undefined),
}));

vi.mock("@/features/shared/lib/supabase/client", () => ({
  createBrowserSupabase: vi.fn(() => ({})),
}));

vi.mock("@/features/shared/lib/offline/session", () => ({
  checkOfflineReplaySession: vi.fn(async () => ({ ok: true })),
}));

import {
  clearOfflineState,
  setOfflineMutationScope,
} from "@/features/shared/lib/offline/mutations";

const MARKER_KEY = "profixiq.offline.persistence.v1";

describe("sign-out never silently destroys unsent offline work", () => {
  beforeEach(() => {
    db.retainOnPreserve = false;
    db.fullClears = 0;
    db.preservingClears = 0;
    db.events = [];
    localStorage.clear();
    setOfflineMutationScope({ userId: "user-1", shopId: "shop-1" });
    localStorage.setItem(
      MARKER_KEY,
      JSON.stringify({
        userId: "user-1",
        shopId: "shop-1",
        pendingMutations: 2,
        pendingAttachments: 1,
        updatedAt: new Date().toISOString(),
      }),
    );
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("retains unsent work and its discovery marker when signing out", async () => {
    db.retainOnPreserve = true;

    const result = await clearOfflineState({ preserveUnsyncedWork: true });

    expect(result.retainedUnsyncedWork).toBe(true);
    expect(db.preservingClears).toBe(1);
    expect(db.fullClears).toBe(0);
    expect(localStorage.getItem(MARKER_KEY)).not.toBeNull();
  });

  it("lets the atomic preserving transaction fully clear when nothing survives", async () => {
    db.retainOnPreserve = false;

    const result = await clearOfflineState({ preserveUnsyncedWork: true });

    expect(result.retainedUnsyncedWork).toBe(false);
    expect(db.preservingClears).toBe(1);
    expect(db.fullClears).toBe(0);
    expect(localStorage.getItem(MARKER_KEY)).toBeNull();
  });

  it("preserves the existing unconditional clear for callers that pass no option", async () => {
    db.retainOnPreserve = true;

    const result = await clearOfflineState();

    expect(result.retainedUnsyncedWork).toBe(false);
    expect(db.fullClears).toBe(1);
    expect(db.preservingClears).toBe(0);
    expect(localStorage.getItem(MARKER_KEY)).toBeNull();
  });

  it("drops the active scope before entering the atomic database cleanup", async () => {
    db.retainOnPreserve = true;
    const { getOfflineMutationScope } = await import(
      "@/features/shared/lib/offline/mutations"
    );

    const pending = clearOfflineState({ preserveUnsyncedWork: true });

    expect(getOfflineMutationScope()).toBeNull();

    await pending;
    expect(db.events).toEqual(["preserve"]);
  });

  it("clears the active scope even when unsent work is retained", async () => {
    db.retainOnPreserve = true;

    await clearOfflineState({ preserveUnsyncedWork: true });

    const { getOfflineMutationScope } = await import(
      "@/features/shared/lib/offline/mutations"
    );
    expect(getOfflineMutationScope()).toBeNull();
  });
});

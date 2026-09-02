import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  retainOnPreserve: false,
  insertResult: true,
  inserted: [] as Array<Array<{ clientMutationId: string }>>,
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
  collectRequiredOfflineMutationIds: vi.fn(
    (
      rows: Array<{
        clientMutationId: string;
        status: string;
        dependsOn?: string[];
      }>,
    ) => {
      const byId = new Map(
        rows.map((row) => [row.clientMutationId, row] as const),
      );
      const required = new Set(
        rows
          .filter((row) => row.status !== "synced")
          .map((row) => row.clientMutationId),
      );
      const pending = [...required];
      while (pending.length > 0) {
        const row = byId.get(pending.pop() ?? "");
        for (const dependencyId of row?.dependsOn ?? []) {
          if (!byId.has(dependencyId) || required.has(dependencyId)) continue;
          required.add(dependencyId);
          pending.push(dependencyId);
        }
      }
      return required;
    },
  ),
  claimStoredMutationForReplay: vi.fn(async () => null),
  deleteStoredMutations: vi.fn(async () => undefined),
  deleteSyncedStoredMutations: vi.fn(async () => undefined),
  getOfflineBlob: vi.fn(async () => null),
  insertStoredMutationsIfMissing: vi.fn(
    async (mutations: Array<{ clientMutationId: string }>) => {
      db.inserted.push(mutations);
      return db.insertResult;
    },
  ),
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
  normalizeOfflineMutationQueue,
  setOfflineMutationScope,
} from "@/features/shared/lib/offline/mutations";

const MARKER_KEY = "profixiq.offline.persistence.v1";
const LEGACY_KEY = "profixiq.pending_mutations.v3";

function legacyMutation(overrides: Record<string, unknown> = {}) {
  return {
    clientMutationId: "legacy-1",
    actionType: "service-visit:start",
    payload: { visitId: "visit-1" },
    createdAt: "2026-08-31T18:00:00.000Z",
    retryCount: 0,
    userId: "user-1",
    shopId: "shop-1",
    status: "queued",
    ...overrides,
  };
}

describe("sign-out never silently destroys unsent offline work", () => {
  beforeEach(() => {
    db.retainOnPreserve = false;
    db.insertResult = true;
    db.inserted = [];
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
    localStorage.setItem(LEGACY_KEY, JSON.stringify([legacyMutation()]));

    const result = await clearOfflineState();

    expect(result.retainedUnsyncedWork).toBe(false);
    expect(db.fullClears).toBe(1);
    expect(db.preservingClears).toBe(0);
    expect(localStorage.getItem(MARKER_KEY)).toBeNull();
    expect(localStorage.getItem(LEGACY_KEY)).toBeNull();
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

  it("imports a legacy queued mutation before removing its localStorage recovery copy", async () => {
    db.retainOnPreserve = true;
    localStorage.setItem(LEGACY_KEY, JSON.stringify([legacyMutation()]));

    const result = await clearOfflineState({ preserveUnsyncedWork: true });

    expect(result.retainedUnsyncedWork).toBe(true);
    expect(db.inserted).toHaveLength(1);
    expect(db.inserted[0]?.map((row) => row.clientMutationId)).toEqual([
      "legacy-1",
    ]);
    expect(localStorage.getItem(LEGACY_KEY)).toBeNull();
    expect(db.preservingClears).toBe(1);
  });

  it("keeps legacy queued work recoverable when durable import is unavailable", async () => {
    db.insertResult = false;
    localStorage.setItem(LEGACY_KEY, JSON.stringify([legacyMutation()]));

    const result = await clearOfflineState({ preserveUnsyncedWork: true });

    expect(result.retainedUnsyncedWork).toBe(true);
    expect(localStorage.getItem(LEGACY_KEY)).not.toBeNull();
    expect(db.preservingClears).toBe(0);
    expect(db.fullClears).toBe(0);
  });

  it("retains expired synced dependencies while pending descendants still reference them", () => {
    const queue = [
      legacyMutation({
        clientMutationId: "grandparent",
        status: "synced",
        syncedAt: "2026-01-01T00:00:00.000Z",
      }),
      legacyMutation({
        clientMutationId: "parent",
        status: "synced",
        syncedAt: "2026-01-01T00:00:00.000Z",
        dependsOn: ["grandparent"],
      }),
      legacyMutation({
        clientMutationId: "child",
        status: "failed",
        dependsOn: ["parent"],
      }),
      legacyMutation({
        clientMutationId: "unrelated-history",
        status: "synced",
        syncedAt: "2026-01-01T00:00:00.000Z",
      }),
    ] as Parameters<typeof normalizeOfflineMutationQueue>[0];

    const normalized = normalizeOfflineMutationQueue(queue);
    const ids = normalized.map((row) => row.clientMutationId);

    expect(ids).toEqual(
      expect.arrayContaining(["grandparent", "parent", "child"]),
    );
    expect(ids).not.toContain("unrelated-history");
  });
});

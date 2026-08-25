import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import type { MobileActiveJobContract } from "@/features/dispatch/lib/contracts";
import {
  FIELD_ACTIVE_SNAPSHOT_LEGACY_KEY,
  getFieldActiveSnapshotCacheKey,
  readFieldActiveSnapshot,
  removeFieldActiveSnapshot,
  writeFieldActiveSnapshot,
} from "@/features/mobile/service/fieldActiveSnapshot";

function createMemoryStorage() {
  const entries = new Map<string, string>();
  return {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => entries.set(key, value),
    removeItem: (key: string) => entries.delete(key),
  };
}

function snapshot(): MobileActiveJobContract {
  return {
    serverNow: "2026-08-25T12:00:00.000Z",
    activeJob: null,
    nextJob: null,
  };
}

describe("Field active-call snapshot scope", () => {
  it("wires former-scope removal into both Field gates and global sign-out", () => {
    for (const path of [
      "features/mobile/service/MobileServiceScopeGate.tsx",
      "features/mobile/service/MobileFieldServiceRouteGate.tsx",
      "features/shared/components/pwa/PwaRuntime.tsx",
    ]) {
      const source = readFileSync(path, "utf8");
      expect(source).toContain("removeFieldActiveSnapshot(formerScope)");
    }
  });

  it("stores and reads a snapshot only for the same authenticated user and shop", () => {
    const storage = createMemoryStorage();
    const firstScope = { userId: "user-a", shopId: "shop-a" };
    const secondScope = { userId: "user-b", shopId: "shop-b" };
    const firstSnapshot = snapshot();

    writeFieldActiveSnapshot(firstScope, firstSnapshot, storage);

    expect(readFieldActiveSnapshot(firstScope, storage)).toEqual(firstSnapshot);
    expect(readFieldActiveSnapshot(secondScope, storage)).toBeNull();
    expect(getFieldActiveSnapshotCacheKey(firstScope)).not.toBe(
      getFieldActiveSnapshotCacheKey(secondScope),
    );
  });

  it("keeps same-shop snapshots isolated between authenticated users", () => {
    const storage = createMemoryStorage();
    const firstScope = { userId: "user-a", shopId: "shop-a" };
    const secondScope = { userId: "user-b", shopId: "shop-a" };

    writeFieldActiveSnapshot(firstScope, snapshot(), storage);

    expect(readFieldActiveSnapshot(secondScope, storage)).toBeNull();
    expect(getFieldActiveSnapshotCacheKey(firstScope)).not.toBe(
      getFieldActiveSnapshotCacheKey(secondScope),
    );
  });

  it("keeps one user's snapshots isolated between shops", () => {
    const storage = createMemoryStorage();
    const firstScope = { userId: "user-a", shopId: "shop-a" };
    const secondScope = { userId: "user-a", shopId: "shop-b" };

    writeFieldActiveSnapshot(firstScope, snapshot(), storage);

    expect(readFieldActiveSnapshot(secondScope, storage)).toBeNull();
    expect(getFieldActiveSnapshotCacheKey(firstScope)).not.toBe(
      getFieldActiveSnapshotCacheKey(secondScope),
    );
  });

  it("rejects a copied record whose embedded identity does not match its key", () => {
    const storage = createMemoryStorage();
    const firstScope = { userId: "user-a", shopId: "shop-a" };
    const secondScope = { userId: "user-b", shopId: "shop-b" };

    writeFieldActiveSnapshot(firstScope, snapshot(), storage);
    const firstKey = getFieldActiveSnapshotCacheKey(firstScope);
    const secondKey = getFieldActiveSnapshotCacheKey(secondScope);
    if (!firstKey || !secondKey) throw new Error("Expected scoped cache keys");
    storage.setItem(secondKey, storage.getItem(firstKey) ?? "");

    expect(readFieldActiveSnapshot(secondScope, storage)).toBeNull();
  });

  it("rejects a record whose cached visit belongs to another shop", () => {
    const storage = createMemoryStorage();
    const scope = { userId: "user-b", shopId: "shop-b" };
    const key = getFieldActiveSnapshotCacheKey(scope);
    if (!key) throw new Error("Expected a scoped cache key");
    storage.setItem(
      key,
      JSON.stringify({
        ...scope,
        snapshot: {
          serverNow: "2026-08-25T12:00:00.000Z",
          activeJob: { shopId: "shop-a" },
          nextJob: null,
        },
      }),
    );

    expect(readFieldActiveSnapshot(scope, storage)).toBeNull();
  });

  it("never falls back to the legacy unscoped snapshot", () => {
    const storage = createMemoryStorage();
    const scope = { userId: "user-b", shopId: "shop-b" };
    storage.setItem(
      FIELD_ACTIVE_SNAPSHOT_LEGACY_KEY,
      JSON.stringify(snapshot()),
    );

    expect(readFieldActiveSnapshot(scope, storage)).toBeNull();
    expect(storage.getItem(FIELD_ACTIVE_SNAPSHOT_LEGACY_KEY)).toBeNull();
    writeFieldActiveSnapshot(scope, snapshot(), storage);
    expect(storage.getItem(FIELD_ACTIVE_SNAPSHOT_LEGACY_KEY)).toBeNull();
  });

  it("removes the former actor's v2 snapshot on explicit auth cleanup", () => {
    const storage = createMemoryStorage();
    const scope = { userId: "user-a", shopId: "shop-a" };
    const key = getFieldActiveSnapshotCacheKey(scope);
    if (!key) throw new Error("Expected a scoped cache key");

    writeFieldActiveSnapshot(scope, snapshot(), storage);
    expect(storage.getItem(key)).not.toBeNull();

    removeFieldActiveSnapshot(scope, storage);

    expect(storage.getItem(key)).toBeNull();
  });
});

import { describe, expect, it } from "vitest";

import {
  getFieldServiceOfflineAccessCacheKey,
  readFieldServiceOfflineAccess,
  resolveFieldServiceAccessScope,
  writeFieldServiceOfflineAccess,
  type FieldServiceAccessPayload,
} from "@/features/mobile/service/fieldOfflineAccess";

function createMemoryStorage() {
  const entries = new Map<string, string>();
  return {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => entries.set(key, value),
    removeItem: (key: string) => entries.delete(key),
  };
}

const grantedAccess: FieldServiceAccessPayload = {
  userId: "user-a",
  shopId: "shop-a",
  canAccessFieldService: true,
  canConfigure: false,
  mustChangePassword: false,
  workspaceCapabilities: {
    canManageScheduling: false,
    canManageParts: false,
    canManageOperations: false,
    canConfigureFieldService: false,
    canSwitchWorkspace: false,
  },
};

describe("Field offline access", () => {
  it("accepts only API identity that matches the authenticated user", () => {
    expect(resolveFieldServiceAccessScope(grantedAccess, "user-a")).toEqual({
      userId: "user-a",
      shopId: "shop-a",
    });
    expect(resolveFieldServiceAccessScope(grantedAccess, "user-b")).toBeNull();
  });

  it("stores and validates a user-and-shop-scoped entitlement snapshot", () => {
    const storage = createMemoryStorage();
    const firstScope = { userId: "user-a", shopId: "shop-a" };
    const secondScope = { userId: "user-a", shopId: "shop-b" };

    expect(
      writeFieldServiceOfflineAccess(firstScope, grantedAccess, storage),
    ).not.toBeNull();
    expect(readFieldServiceOfflineAccess(firstScope, storage)).toMatchObject({
      userId: "user-a",
      shopId: "shop-a",
      canAccessFieldService: true,
    });
    expect(getFieldServiceOfflineAccessCacheKey(firstScope)).not.toBe(
      getFieldServiceOfflineAccessCacheKey(secondScope),
    );

    const firstKey = getFieldServiceOfflineAccessCacheKey(firstScope);
    const secondKey = getFieldServiceOfflineAccessCacheKey(secondScope);
    if (!firstKey || !secondKey) throw new Error("Expected scoped cache keys");
    storage.setItem(secondKey, storage.getItem(firstKey) ?? "");
    expect(readFieldServiceOfflineAccess(secondScope, storage)).toBeNull();
  });

  it("does not cache mismatched, denied, or password-blocked access", () => {
    const storage = createMemoryStorage();
    const scope = { userId: "user-a", shopId: "shop-a" };

    expect(
      writeFieldServiceOfflineAccess(
        scope,
        { ...grantedAccess, shopId: "shop-b" },
        storage,
      ),
    ).toBeNull();
    expect(
      writeFieldServiceOfflineAccess(
        scope,
        { ...grantedAccess, canAccessFieldService: false },
        storage,
      ),
    ).toBeNull();
    expect(
      writeFieldServiceOfflineAccess(
        scope,
        { ...grantedAccess, mustChangePassword: true },
        storage,
      ),
    ).toBeNull();
    expect(readFieldServiceOfflineAccess(scope, storage)).toBeNull();
  });
});

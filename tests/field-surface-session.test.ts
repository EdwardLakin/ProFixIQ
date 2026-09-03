import { describe, expect, it, vi } from "vitest";

import {
  FIELD_SURFACE_SESSION_KEY,
  clearFieldSurfaceSession,
  readFieldSurfaceSession,
  writeFieldSurfaceSession,
} from "@/features/mobile/service/fieldSurfaceSession";

function storage(initial: string | null = null) {
  let value = initial;
  return {
    getItem: vi.fn(() => value),
    setItem: vi.fn((_key: string, next: string) => {
      value = next;
    }),
    removeItem: vi.fn(() => {
      value = null;
    }),
  };
}

describe("Field surface session binding", () => {
  it("persists the verified user and shop instead of a global marker", () => {
    const target = storage();

    writeFieldSurfaceSession(
      { userId: " user-a ", shopId: " shop-a " },
      target,
    );

    expect(target.setItem).toHaveBeenCalledWith(
      FIELD_SURFACE_SESSION_KEY,
      JSON.stringify({ version: 1, userId: "user-a", shopId: "shop-a" }),
    );
    expect(readFieldSurfaceSession(target)).toEqual({
      userId: "user-a",
      shopId: "shop-a",
    });
  });

  it("rejects and removes the legacy unscoped marker", () => {
    const target = storage("standalone");

    expect(readFieldSurfaceSession(target)).toBeNull();
    expect(target.removeItem).toHaveBeenCalledWith(FIELD_SURFACE_SESSION_KEY);
  });

  it("clears the scoped marker on explicit exit or denial", () => {
    const target = storage(
      JSON.stringify({ version: 1, userId: "user-a", shopId: "shop-a" }),
    );

    clearFieldSurfaceSession(target);

    expect(target.removeItem).toHaveBeenCalledWith(FIELD_SURFACE_SESSION_KEY);
  });
});

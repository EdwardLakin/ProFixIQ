import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock("@/features/shared/lib/supabase/client", () => ({
  createBrowserSupabase: () => ({
    auth: { getSession: mocks.getSession },
  }),
}));

import {
  getSessionMatchedOfflineScope,
  setOfflineMutationScope,
} from "@/features/shared/lib/offline/mutations";

describe("offline shared-browser session isolation", () => {
  beforeEach(() => {
    localStorage.clear();
    mocks.getSession.mockReset();
    mocks.fetch.mockReset();
    vi.stubGlobal("fetch", mocks.fetch);
    Object.defineProperty(window.navigator, "onLine", {
      configurable: true,
      value: true,
    });
    setOfflineMutationScope({ userId: "user-a", shopId: "shop-a" });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the persisted shop scope only for its authenticated user", async () => {
    mocks.getSession.mockResolvedValue({
      data: { session: { user: { id: "user-a" } } },
    });
    mocks.fetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          userId: "user-a",
          shopId: "shop-a",
          verifiedAt: "2026-08-25T00:00:00.000Z",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    await expect(getSessionMatchedOfflineScope()).resolves.toEqual({
      userId: "user-a",
      shopId: "shop-a",
    });
  });

  it("preserves the same user's last verified scope while fully offline", async () => {
    Object.defineProperty(window.navigator, "onLine", {
      configurable: true,
      value: false,
    });
    mocks.getSession.mockResolvedValue({
      data: { session: { user: { id: "user-a" } } },
    });

    await expect(getSessionMatchedOfflineScope()).resolves.toEqual({
      userId: "user-a",
      shopId: "shop-a",
    });
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("fails closed after account switching, sign-out, or session lookup failure", async () => {
    mocks.getSession.mockResolvedValueOnce({
      data: { session: { user: { id: "user-b" } } },
    });
    await expect(getSessionMatchedOfflineScope()).resolves.toBeNull();

    mocks.getSession.mockResolvedValueOnce({ data: { session: null } });
    await expect(getSessionMatchedOfflineScope()).resolves.toBeNull();

    mocks.getSession.mockRejectedValueOnce(new Error("session unavailable"));
    await expect(getSessionMatchedOfflineScope()).resolves.toBeNull();
  });

  it("fails closed when the server reports a different shop", async () => {
    mocks.getSession.mockResolvedValue({
      data: { session: { user: { id: "user-a" } } },
    });
    mocks.fetch.mockResolvedValue(
      new Response(
        JSON.stringify({ userId: "user-a", shopId: "shop-b" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    await expect(getSessionMatchedOfflineScope()).resolves.toBeNull();
  });

  it("fails closed when canonical scope verification is unavailable", async () => {
    mocks.getSession.mockResolvedValue({
      data: { session: { user: { id: "user-a" } } },
    });
    mocks.fetch.mockResolvedValue(
      new Response(JSON.stringify({ error: "temporarily unavailable" }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(getSessionMatchedOfflineScope()).resolves.toBeNull();
  });
});

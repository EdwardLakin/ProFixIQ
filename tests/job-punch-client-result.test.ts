import { beforeEach, describe, expect, it, vi } from "vitest";

import { runJobPunchTransition } from "@/features/work-orders/lib/jobPunchTransitionsClient";

const offline = vi.hoisted(() => ({
  getSessionMatchedOfflineScope: vi.fn(),
  runMutationWithOfflineQueue: vi.fn(),
}));
vi.mock("@/features/shared/lib/offline/mutations", () => offline);

describe("runJobPunchTransition result", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    offline.getSessionMatchedOfflineScope.mockReset().mockResolvedValue(null);
    offline.runMutationWithOfflineQueue.mockReset();
  });

  it("returns what the server reported, so Equipment shops can tell a punch-off from a completion", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true, lineClosed: false, remaining: [{ technicianId: "t2", state: "running" }] }),
      }),
    );
    await expect(runJobPunchTransition("line-1", "finish", {})).resolves.toMatchObject({ lineClosed: false });
  });

  it("returns nothing when the body is empty or unreadable, as before", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => null }));
    await expect(runJobPunchTransition("line-1", "start")).resolves.toBeUndefined();

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => {
          throw new Error("no body");
        },
      }),
    );
    await expect(runJobPunchTransition("line-1", "start")).resolves.toBeUndefined();
  });

  describe("with an offline scope (a signed-in mobile session)", () => {
    const scope = { userId: "u", shopId: "s" };

    /** Behaves like the real queue when online: runs the request now and reports it was not queued. */
    function runOnline() {
      offline.runMutationWithOfflineQueue.mockImplementation(
        async (args: { runner: () => Promise<void> }) => {
          await args.runner();
          return { queued: false, conflicted: false };
        },
      );
    }

    beforeEach(() => {
      offline.getSessionMatchedOfflineScope.mockResolvedValue(scope);
    });

    it("preserves the server's line-still-open answer when the request ran online", async () => {
      runOnline();
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({ success: true, lineClosed: false, remaining: [{ technicianId: "t2", state: "running" }] }),
        }),
      );
      await expect(runJobPunchTransition("line-1", "finish", { cause: "c", correction: "k" })).resolves.toMatchObject({
        lineClosed: false,
        remaining: [{ technicianId: "t2", state: "running" }],
      });
    });

    it("preserves a line-closed answer too", async () => {
      runOnline();
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, lineClosed: true }) }),
      );
      await expect(runJobPunchTransition("line-1", "finish", {})).resolves.toMatchObject({ lineClosed: true });
    });

    it("returns nothing for a request that was queued, because there is no answer yet", async () => {
      offline.runMutationWithOfflineQueue.mockResolvedValue({ queued: true, conflicted: false });
      await expect(runJobPunchTransition("line-1", "finish", {})).resolves.toBeUndefined();
    });

    it("returns nothing for a conflicted request", async () => {
      offline.runMutationWithOfflineQueue.mockResolvedValue({ queued: false, conflicted: true });
      await expect(runJobPunchTransition("line-1", "finish", {})).resolves.toBeUndefined();
    });

    it("still surfaces a server refusal from an online request", async () => {
      offline.runMutationWithOfflineQueue.mockImplementation(async (args: { runner: () => Promise<void> }) => {
        await args.runner();
        return { queued: false, conflicted: false };
      });
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({ ok: false, status: 409, json: async () => ({ error: "Cannot finish" }) }),
      );
      await expect(runJobPunchTransition("line-1", "finish", {})).rejects.toMatchObject({ message: "Cannot finish" });
    });

    it("ignores a stale answer from an earlier call", async () => {
      runOnline();
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({ ok: true, json: async () => ({ lineClosed: false }) }),
      );
      await runJobPunchTransition("line-1", "finish", {});

      offline.runMutationWithOfflineQueue.mockResolvedValue({ queued: true, conflicted: false });
      await expect(runJobPunchTransition("line-2", "finish", {})).resolves.toBeUndefined();
    });
  });

  it("returns nothing when the request was queued offline", async () => {
    offline.getSessionMatchedOfflineScope.mockResolvedValue({ userId: "u", shopId: "s" });
    offline.runMutationWithOfflineQueue.mockResolvedValue({ queued: true });
    await expect(runJobPunchTransition("line-1", "finish", {})).resolves.toBeUndefined();
  });

  it("still throws the server's message on failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 409, json: async () => ({ error: "Cannot finish" }) }),
    );
    await expect(runJobPunchTransition("line-1", "finish", {})).rejects.toMatchObject({
      message: "Cannot finish",
      status: 409,
    });
  });
});

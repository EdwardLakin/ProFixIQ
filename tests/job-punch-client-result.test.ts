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

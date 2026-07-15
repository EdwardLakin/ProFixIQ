import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createJobPunchOperationKey,
  runJobPunchTransition,
} from "@/features/work-orders/lib/jobPunchTransitionsClient";

describe("Phase 6 job punch client", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("sends one stable operation key in the header and body", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn(),
    });
    vi.stubGlobal("fetch", fetchMock);

    await runJobPunchTransition(
      "line-1",
      "pause",
      { holdReason: "Awaiting parts" },
      { operationKey: "stable-pause-key" },
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(new Headers(init.headers).get("Idempotency-Key")).toBe(
      "stable-pause-key",
    );
    expect(JSON.parse(String(init.body))).toMatchObject({
      holdReason: "Awaiting parts",
      operationKey: "stable-pause-key",
      idempotencyKey: "stable-pause-key",
    });
  });

  it("generates distinct keys for distinct user actions", () => {
    const first = createJobPunchOperationKey("line-1", "start");
    const second = createJobPunchOperationKey("line-1", "start");
    expect(first).toContain("job-punch:line-1:start:");
    expect(second).toContain("job-punch:line-1:start:");
    expect(first).not.toBe(second);
  });

  it("surfaces the server error instead of hiding a permanent rejection", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: vi.fn().mockResolvedValue({ error: "FINANCIALLY_LOCKED" }),
      }),
    );

    await expect(
      runJobPunchTransition("line-1", "finish", undefined, {
        operationKey: "finish-key",
      }),
    ).rejects.toThrow("FINANCIALLY_LOCKED");
  });
});

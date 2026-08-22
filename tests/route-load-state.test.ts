import { describe, expect, it, vi } from "vitest";

import {
  RouteLoadFailure,
  asRouteLoadFailure,
  routeLoadFailureFromStatus,
  runBoundedRouteLoad,
} from "@/features/shared/lib/route-load";

describe("bounded route loading", () => {
  it("returns successful data without changing the payload", async () => {
    const payload = { id: "fixture", rows: [1, 2] };
    await expect(
      runBoundedRouteLoad(
        { route: "/fixture", operation: "load" },
        async ({ recordStatus }) => {
          recordStatus(200);
          return payload;
        },
        100,
      ),
    ).resolves.toBe(payload);
  });

  it("turns a hanging request into a retryable timeout", async () => {
    vi.useFakeTimers();
    const result = runBoundedRouteLoad(
      { route: "/fixture", operation: "load" },
      async () => new Promise<never>(() => undefined),
      25,
    );
    const expectation = expect(result).rejects.toMatchObject({
      kind: "timeout",
      retryable: true,
      requestId: expect.any(String),
    });
    await vi.advanceTimersByTimeAsync(25);
    await expectation;
    vi.useRealTimers();
  });

  it.each([
    [401, "unauthenticated"],
    [403, "forbidden"],
    [404, "not-found"],
    [503, "network"],
  ] as const)("classifies HTTP %s", (status, kind) => {
    expect(routeLoadFailureFromStatus(status, "failed")).toMatchObject({
      kind,
      status,
    });
  });

  it("preserves an explicit route failure", () => {
    const failure = new RouteLoadFailure({
      kind: "forbidden",
      message: "Access denied.",
    });
    expect(asRouteLoadFailure(failure)).toBe(failure);
  });
});

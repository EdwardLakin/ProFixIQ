import { describe, expect, it } from "vitest";

import {
  resolveShopAssistantError,
  ShopAssistantHttpError,
} from "@/features/shop-assistant/server/requireShopAssistantActor";

describe("Shop Assistant quota error classification", () => {
  it("keeps a short-window throttle retryable", () => {
    // acquireActionExecution only re-runs failures marked retryable. Recording
    // a 429 as terminal strands an action the technician already confirmed:
    // it would never execute once the rate-limit window cleared, forcing them
    // to ask and confirm the whole thing again.
    const resolved = resolveShopAssistantError(
      new ShopAssistantHttpError(429, "CoPilot is temporarily rate limited."),
    );

    expect(resolved.status).toBe(429);
    expect(resolved.retryable).toBe(true);
  });

  it("keeps an exhausted monthly budget terminal", () => {
    // Retrying cannot clear a hard budget, so this must not be replayed.
    const resolved = resolveShopAssistantError(
      new ShopAssistantHttpError(402, "This shop has reached its budget."),
    );

    expect(resolved.status).toBe(402);
    expect(resolved.retryable).toBe(false);
  });

  it("leaves other client errors terminal", () => {
    for (const status of [400, 401, 403, 404, 409]) {
      expect(
        resolveShopAssistantError(new ShopAssistantHttpError(status, "no"))
          .retryable,
      ).toBe(false);
    }
  });

  it("keeps server errors retryable", () => {
    for (const status of [500, 502, 503]) {
      expect(
        resolveShopAssistantError(new ShopAssistantHttpError(status, "no"))
          .retryable,
      ).toBe(true);
    }
  });
});

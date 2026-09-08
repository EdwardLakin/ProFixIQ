import { describe, expect, it } from "vitest";

import {
  currentAITelemetryContext,
  withAITelemetryContext,
} from "@/features/shared/lib/server/ai-telemetry-context";

describe("AI telemetry request context", () => {
  it("is empty outside a scoped request", () => {
    expect(currentAITelemetryContext()).toBeNull();
  });

  it("keeps tenant attribution scoped to the async request", async () => {
    const result = await withAITelemetryContext(
      { endpoint: "/test", shopId: "shop-1", userId: "user-1" },
      async () => {
        await Promise.resolve();
        return currentAITelemetryContext();
      },
    );

    expect(result).toEqual({
      endpoint: "/test",
      shopId: "shop-1",
      userId: "user-1",
    });
    expect(currentAITelemetryContext()).toBeNull();
  });
});

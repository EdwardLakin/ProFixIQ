import { describe, expect, it, vi } from "vitest";

const durableGuard = vi.hoisted(() => ({
  claimDurableAIRouteQuota: vi.fn(),
  completeDurableAIRouteQuota: vi.fn(async () => undefined),
}));
const opsGuard = vi.hoisted(() => ({
  estimateAICostUsd: vi.fn(() => 0.01),
  registerAIUsageEvent: vi.fn(),
}));
const telemetry = vi.hoisted(() => ({
  recordAITelemetry: vi.fn(),
}));

vi.mock("@/features/shared/lib/server/durable-ai-guard", () => durableGuard);
vi.mock("@/features/shared/lib/server/ai-ops-guard", () => opsGuard);
vi.mock("@/features/shared/lib/server/ai-telemetry", () => telemetry);

import {
  AIQuotaExceededError,
  AIQuotaUnavailableError,
  withDurableAIQuota,
} from "@/features/shared/lib/server/ai-route-quota";

const baseConfig = {
  admin: {} as never,
  durableFeature: "inspection_interpret" as const,
  telemetryFeature: "inspection_interpret" as const,
  endpoint: "/api/ai/interpret",
  actorId: "actor-1",
  shopId: "shop-1",
};

describe("withDurableAIQuota", () => {
  it("runs the operation and records success when the claim is allowed", async () => {
    durableGuard.claimDurableAIRouteQuota.mockResolvedValueOnce({
      allowed: true,
      receiptId: "receipt-1",
    });

    const output = await withDurableAIQuota(baseConfig, async () => ({
      output: ["command"],
      model: "gpt-test",
      latencyMs: 12,
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
    }));

    expect(output).toEqual(["command"]);
    expect(durableGuard.completeDurableAIRouteQuota).toHaveBeenCalledWith(
      expect.objectContaining({ receiptId: "receipt-1", succeeded: true }),
    );
    expect(telemetry.recordAITelemetry).toHaveBeenCalledWith(
      expect.objectContaining({ status: "success", total_tokens: 15 }),
    );
    expect(opsGuard.registerAIUsageEvent).toHaveBeenCalledWith(
      expect.objectContaining({ status: "success" }),
    );
  });

  it("throws AIQuotaExceededError without running the operation when denied", async () => {
    durableGuard.claimDurableAIRouteQuota.mockResolvedValueOnce({
      allowed: false,
      reason: "rate_limited",
      retryAfterSeconds: 30,
    });
    const operation = vi.fn();

    await expect(withDurableAIQuota(baseConfig, operation)).rejects.toThrow(
      AIQuotaExceededError,
    );
    expect(operation).not.toHaveBeenCalled();
    expect(durableGuard.completeDurableAIRouteQuota).not.toHaveBeenCalled();
  });

  it("throws AIQuotaUnavailableError when the quota RPC itself fails", async () => {
    durableGuard.claimDurableAIRouteQuota.mockRejectedValueOnce(
      new Error("rpc down"),
    );

    await expect(
      withDurableAIQuota(baseConfig, vi.fn()),
    ).rejects.toThrow(AIQuotaUnavailableError);
  });

  it("records a failed completion and rethrows when the operation fails", async () => {
    durableGuard.claimDurableAIRouteQuota.mockResolvedValueOnce({
      allowed: true,
      receiptId: "receipt-2",
    });

    await expect(
      withDurableAIQuota(baseConfig, async () => {
        throw new Error("provider exploded");
      }),
    ).rejects.toThrow("provider exploded");

    expect(durableGuard.completeDurableAIRouteQuota).toHaveBeenCalledWith(
      expect.objectContaining({
        receiptId: "receipt-2",
        succeeded: false,
        actualCostUsd: 0,
      }),
    );
    expect(telemetry.recordAITelemetry).toHaveBeenCalledWith(
      expect.objectContaining({ status: "error", error_code: "provider_error" }),
    );
  });

  it("tags a timeout failure distinctly from a generic provider failure", async () => {
    durableGuard.claimDurableAIRouteQuota.mockResolvedValueOnce({
      allowed: true,
      receiptId: "receipt-3",
    });

    await expect(
      withDurableAIQuota(baseConfig, async () => {
        throw new Error("AI provider timed out");
      }),
    ).rejects.toThrow("timed out");

    expect(telemetry.recordAITelemetry).toHaveBeenCalledWith(
      expect.objectContaining({ error_code: "provider_timeout" }),
    );
  });
});

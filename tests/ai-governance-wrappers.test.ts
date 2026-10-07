import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const governAICall = vi.fn();
vi.mock("@/features/shared/lib/server/ai-governance", () => ({
  governAICall: (ctx: unknown, call: () => unknown) => governAICall(ctx, call),
  isAIBudgetDenied: (e: unknown) => (e as { name?: string })?.name === "AIBudgetDeniedError",
  isAIBudgetStop: (e: unknown) =>
    ["AIBudgetDeniedError", "AIBudgetReplayError", "AIBudgetUnavailableError"].includes(
      (e as { name?: string })?.name ?? "",
    ),
}));
const recordDurableAIUsage = vi.fn();
vi.mock("@/features/shared/lib/server/ai-telemetry", () => ({
  recordDurableAIUsage: (e: unknown) => recordDurableAIUsage(e),
}));
vi.mock("@/features/shared/lib/server/openai", () => ({
  isOpenAIConfigured: () => true,
  getOpenAIClient: () => ({
    responses: { create: vi.fn(async () => ({ id: "r", output_text: '{"ok":1}', usage: { input_tokens: 5, output_tokens: 2, total_tokens: 7 } })) },
  }),
}));
vi.mock("@/features/shared/lib/server/openai-models", () => ({
  getOpenAIModelForPurpose: () => "gpt-5.5",
  openAITemperatureParam: () => ({}),
}));

import { AIBudgetDeniedError } from "@/features/shared/lib/server/ai-budget";
import { ledgerOpenAICall } from "@/features/shared/lib/server/ai-provider-accounting";
import { runOpenAIStructuredJson } from "@/features/shared/lib/server/openai-structured";

const denial = () => new AIBudgetDeniedError("insufficient_balance", 0, null);

beforeEach(() => {
  governAICall.mockReset();
  recordDurableAIUsage.mockReset();
  recordDurableAIUsage.mockResolvedValue({ persisted: true });
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

describe("ledgerOpenAICall under governance", () => {
  const ctx = { feature: "vin_extract_from_image", endpoint: "/e", shopId: "s", userId: "u", model: "gpt-5.5" };

  it("hands the provider call to governance and ledgers a successful result", async () => {
    governAICall.mockImplementation(async (_c: unknown, call: () => unknown) => call());
    const out = await ledgerOpenAICall(ctx, async () => ({ id: "x", usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }));
    expect(out).toMatchObject({ id: "x" });
    expect(governAICall).toHaveBeenCalledWith(expect.objectContaining({ feature: "vin_extract_from_image", shopId: "s" }), expect.any(Function));
    expect(recordDurableAIUsage).toHaveBeenCalledTimes(1);
  });

  it("writes no usage-ledger row for a call governance refused (it never reached the provider)", async () => {
    governAICall.mockRejectedValue(denial());
    await expect(ledgerOpenAICall(ctx, async () => ({}))).rejects.toMatchObject({ name: "AIBudgetDeniedError" });
    expect(recordDurableAIUsage).not.toHaveBeenCalled();
  });

  it("still writes an error row for a real provider failure", async () => {
    governAICall.mockRejectedValue(Object.assign(new Error("502"), { status: 502 }));
    await expect(ledgerOpenAICall(ctx, async () => ({}))).rejects.toThrow("502");
    expect(recordDurableAIUsage).toHaveBeenCalledTimes(1);
    expect(recordDurableAIUsage.mock.calls[0][0]).toMatchObject({ status: "error" });
  });

  it("skips governance only when asked", async () => {
    await ledgerOpenAICall({ ...ctx, skipGovernance: true }, async () => ({ id: "y" }));
    expect(governAICall).not.toHaveBeenCalled();
    expect(recordDurableAIUsage).toHaveBeenCalledTimes(1);
  });
});

describe("runOpenAIStructuredJson under governance", () => {
  const base = {
    purpose: "fast" as const,
    feature: "quote-history-insights",
    system: "s",
    user: {},
    schemaName: "T",
    fallback: () => ({ value: 0 }),
    telemetry: { endpoint: "/e", shopId: "shop-1", userId: "user-1" },
  };

  it("passes the shop and actor to governance", async () => {
    governAICall.mockImplementation(async (_c: unknown, call: () => unknown) => call());
    await runOpenAIStructuredJson(base);
    expect(governAICall).toHaveBeenCalledWith(
      expect.objectContaining({ feature: "quote-history-insights", shopId: "shop-1", userId: "user-1" }),
      expect.any(Function),
    );
  });

  it("falls back, with no provider-error row, when governance refuses and AI is optional", async () => {
    governAICall.mockRejectedValue(denial());
    const result = await runOpenAIStructuredJson(base);
    expect(result.mode).toBe("fallback");
    expect(result.output).toEqual({ value: 0 });
    expect(result.warning).toMatch(/budget/i);
    expect(recordDurableAIUsage).not.toHaveBeenCalled();
  });

  it("re-throws the typed denial when AI is required", async () => {
    governAICall.mockRejectedValue(denial());
    await expect(runOpenAIStructuredJson({ ...base, requireAI: true })).rejects.toMatchObject({ name: "AIBudgetDeniedError" });
    expect(recordDurableAIUsage).not.toHaveBeenCalled();
  });
});

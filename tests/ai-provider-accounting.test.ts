import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const recordDurableAIUsage = vi.fn();
vi.mock("@/features/shared/lib/server/ai-telemetry", () => ({
  recordDurableAIUsage: (event: unknown) => recordDurableAIUsage(event),
}));

import {
  ledgerOpenAICall,
  readOpenAIUsage,
} from "@/features/shared/lib/server/ai-provider-accounting";
import { withAITelemetryContext } from "@/features/shared/lib/server/ai-telemetry-context";
import {
  AI_RATE_CARD_VERSION,
  estimateOpenAIEmbeddingCostUsd,
} from "@/features/shared/lib/server/ai-cost";

beforeEach(() => {
  recordDurableAIUsage.mockReset();
  recordDurableAIUsage.mockResolvedValue({ persisted: true });
});

describe("readOpenAIUsage", () => {
  it("reads chat-completions usage including cached tokens", () => {
    expect(
      readOpenAIUsage({
        id: "chatcmpl_1",
        usage: {
          prompt_tokens: 120,
          completion_tokens: 30,
          total_tokens: 150,
          prompt_tokens_details: { cached_tokens: 20 },
        },
      }),
    ).toEqual({
      promptTokens: 120,
      cachedPromptTokens: 20,
      completionTokens: 30,
      totalTokens: 150,
      providerRequestId: "chatcmpl_1",
    });
  });

  it("reads responses-API usage names", () => {
    const usage = readOpenAIUsage({
      id: "resp_1",
      usage: {
        input_tokens: 10,
        output_tokens: 5,
        input_tokens_details: { cached_tokens: 4 },
      },
    });
    expect(usage.promptTokens).toBe(10);
    expect(usage.completionTokens).toBe(5);
    expect(usage.cachedPromptTokens).toBe(4);
    expect(usage.totalTokens).toBe(15);
  });

  it("reads embedding usage, which has no completion tokens", () => {
    const usage = readOpenAIUsage({ usage: { prompt_tokens: 42, total_tokens: 42 } });
    expect(usage.promptTokens).toBe(42);
    expect(usage.completionTokens).toBeNull();
    expect(usage.totalTokens).toBe(42);
  });

  it("never turns missing usage into zero", () => {
    expect(readOpenAIUsage({ id: "x" })).toMatchObject({
      promptTokens: null,
      completionTokens: null,
      totalTokens: null,
      providerRequestId: "x",
    });
    expect(readOpenAIUsage(null).totalTokens).toBeNull();
    expect(readOpenAIUsage({ usage: { prompt_tokens: -3 } }).promptTokens).toBeNull();
  });
});

describe("ledgerOpenAICall", () => {
  const context = {
    feature: "vin_extract_from_image",
    endpoint: "/api/vin/extract-from-image",
    shopId: "shop-1",
    userId: "user-1",
    model: "gpt-5.5",
  };

  it("returns the provider response untouched and ledgers its usage", async () => {
    const response = { id: "chatcmpl_9", usage: { prompt_tokens: 7, completion_tokens: 3, total_tokens: 10 } };
    await expect(ledgerOpenAICall(context, async () => response)).resolves.toBe(response);
    expect(recordDurableAIUsage).toHaveBeenCalledTimes(1);
    expect(recordDurableAIUsage.mock.calls[0][0]).toMatchObject({
      feature: "vin_extract_from_image",
      shop_id: "shop-1",
      user_id: "user-1",
      model: "gpt-5.5",
      status: "success",
      prompt_tokens: 7,
      total_tokens: 10,
      provider_request_id: "chatcmpl_9",
    });
  });

  it("ledgers a failed call with null usage and re-throws the original error", async () => {
    const failure = Object.assign(new Error("rate limited"), { status: 429 });
    await expect(
      ledgerOpenAICall(context, async () => {
        throw failure;
      }),
    ).rejects.toBe(failure);
    expect(recordDurableAIUsage.mock.calls[0][0]).toMatchObject({
      status: "error",
      error_code: "provider_rate_limited",
      prompt_tokens: null,
      total_tokens: null,
    });
  });

  it("classifies timeouts", async () => {
    await expect(
      ledgerOpenAICall(context, async () => {
        throw new Error("AI provider timed out");
      }),
    ).rejects.toThrow("timed out");
    expect(recordDurableAIUsage.mock.calls[0][0]).toMatchObject({ error_code: "provider_timeout" });
  });

  it("does not let a ledger failure change the call outcome", async () => {
    recordDurableAIUsage.mockRejectedValue(new Error("ledger down"));
    const response = { id: "ok" };
    await expect(ledgerOpenAICall(context, async () => response)).resolves.toBe(response);
  });

  it("inherits the ambient tenant when none is given, and ledgers unattributed otherwise", async () => {
    const { shopId: _shopId, userId: _userId, ...unscoped } = context;
    void _shopId;
    void _userId;

    await withAITelemetryContext(
      { endpoint: "/e", shopId: "ambient-shop", userId: "ambient-user" },
      () => ledgerOpenAICall(unscoped, async () => ({})),
    );
    expect(recordDurableAIUsage.mock.calls[0][0]).toMatchObject({
      shop_id: "ambient-shop",
      user_id: "ambient-user",
    });

    await ledgerOpenAICall(unscoped, async () => ({}));
    expect(recordDurableAIUsage.mock.calls[1][0]).toMatchObject({ shop_id: null, user_id: null });
  });
});

describe("rate card", () => {
  it("prices text-embedding-3-small and leaves other embedding models unpriced", () => {
    expect(estimateOpenAIEmbeddingCostUsd("text-embedding-3-small", 1_000_000)).toBe(0.02);
    expect(estimateOpenAIEmbeddingCostUsd("text-embedding-3-large", 1_000_000)).toBeNull();
    expect(estimateOpenAIEmbeddingCostUsd("text-embedding-3-small", null)).toBeNull();
  });

  it("bumps the rate-card version when rates change", () => {
    expect(AI_RATE_CARD_VERSION).toBe("openai-2026-10-06-v3");
  });
});

/**
 * Coverage guard. Every file that calls an OpenAI inference endpoint must write
 * to the durable ledger, directly or through the shared wrapper. A new call
 * site that skips accounting fails here instead of becoming invisible spend.
 */
describe("provider call coverage", () => {
  const PROVIDER_CALL =
    /chat\.completions\.create|\.responses\.create|images\.generate|images\.edit|audio\.speech\.create|audio\.transcriptions\.create|embeddings\.create|api\.openai\.com\/v1\/(chat|responses|embeddings|images|audio)/;
  const ACCOUNTED =
    /ledgerOpenAICall|recordDurableAIUsage|runDurableAIGuard|durableFeature|ai-route-quota/;

  function walk(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
      if (name === "node_modules" || name === ".next" || name.startsWith(".")) continue;
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full, out);
      else if (/\.(ts|tsx)$/.test(name) && !/\.test\./.test(name)) out.push(full);
    }
    return out;
  }

  it("ledgers every provider inference call site", () => {
    const files = ["app", "features", "lib", "src"].flatMap((dir) => {
      try {
        return walk(dir);
      } catch {
        return [];
      }
    });
    // naturalSpeech is a pure transport helper; its two callers own the ledger
    // write (asserted below) because only they know the shop and actor.
    const DELEGATES_TO_CALLERS = new Set(["features/shared/lib/server/naturalSpeech.ts"]);
    const unaccounted = files.filter((file) => {
      if (DELEGATES_TO_CALLERS.has(file)) return false;
      const source = readFileSync(file, "utf8");
      return PROVIDER_CALL.test(source) && !ACCOUNTED.test(source);
    });
    expect(unaccounted).toEqual([]);
  });

  it("keeps the speech callers that own ledgering for naturalSpeech", () => {
    for (const route of [
      "app/api/inspections/speech/route.ts",
      "app/api/copilot/technician/speech/route.ts",
    ]) {
      const source = readFileSync(route, "utf8");
      expect(source).toContain("synthesizeNaturalSpeech");
      expect(source).toContain("recordDurableAIUsage");
    }
  });
});

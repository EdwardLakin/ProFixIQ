import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAccess: vi.fn(),
  isOpenAIConfigured: vi.fn(),
  createSpeech: vi.fn(),
  getPolicy: vi.fn(),
  enforcePolicy: vi.fn(),
  estimateSpeechCost: vi.fn(),
  registerUsage: vi.fn(),
  recordTelemetry: vi.fn(),
}));

vi.mock("@/features/copilot/technician/server/auth", () => {
  class TechnicianCopilotAccessError extends Error {
    constructor(
      public status: number,
      public code: string,
      message: string,
    ) {
      super(message);
    }
  }

  return {
    requireTechnicianCopilotAccess: mocks.requireAccess,
    TechnicianCopilotAccessError,
  };
});

vi.mock("@/features/shared/lib/server/openai", () => ({
  isOpenAIConfigured: mocks.isOpenAIConfigured,
  getOpenAIClient: () => ({
    audio: { speech: { create: mocks.createSpeech } },
  }),
}));

vi.mock("@/features/shared/lib/server/ai-policy", () => ({
  getAIPolicy: mocks.getPolicy,
}));

vi.mock("@/features/shared/lib/server/ai-ops-guard", () => ({
  enforceAIOperationalPolicy: mocks.enforcePolicy,
  estimateAISpeechCostUsd: mocks.estimateSpeechCost,
  registerAIUsageEvent: mocks.registerUsage,
}));

vi.mock("@/features/shared/lib/server/ai-telemetry", () => ({
  recordAITelemetry: mocks.recordTelemetry,
}));

import { TechnicianCopilotAccessError } from "@/features/copilot/technician/server/auth";
import { POST } from "../app/api/copilot/technician/speech/route";

const access = {
  shopId: "shop-1",
  profileId: "profile-1",
  capabilities: { text: true, voice: true, documentation: true },
};
const encodedAudio = new Uint8Array([9, 8, 7, 6]);

function speechRequest(body: unknown): NextRequest {
  return new Request("http://localhost/api/copilot/technician/speech", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as NextRequest;
}

describe("POST /api/copilot/technician/speech", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAccess.mockResolvedValue(access);
    mocks.isOpenAIConfigured.mockReturnValue(true);
    mocks.getPolicy.mockReturnValue({ timeoutMs: 20_000 });
    mocks.enforcePolicy.mockReturnValue({
      allowed: true,
      softBudgetWarning: false,
    });
    mocks.estimateSpeechCost.mockReturnValue(0.00042);
    mocks.createSpeech.mockResolvedValue({
      arrayBuffer: async () => encodedAudio.slice().buffer,
    });
  });

  it("authenticates, tenant-scopes, and returns generated MP3 audio", async () => {
    const response = await POST(speechRequest({ text: "Next job is the Ford." }));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("audio/mpeg");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(encodedAudio);
    expect(mocks.enforcePolicy).toHaveBeenCalledWith({
      feature: "technician_copilot_speech",
      endpoint: "/api/copilot/technician/speech",
      shopId: "shop-1",
    });
    expect(mocks.createSpeech).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gpt-4o-mini-tts",
        voice: "marin",
        input: "Next job is the Ford.",
        response_format: "mp3",
      }),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(mocks.recordTelemetry).toHaveBeenCalledWith(
      expect.objectContaining({
        shop_id: "shop-1",
        user_id: "profile-1",
        status: "success",
      }),
    );
    expect(mocks.registerUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        shopId: "shop-1",
        estimatedCostUsd: 0.00042,
        status: "success",
      }),
    );
  });

  it("preserves canonical technician access failures", async () => {
    mocks.requireAccess.mockRejectedValueOnce(
      new TechnicianCopilotAccessError(
        401,
        "unauthorized",
        "Authentication required.",
      ),
    );

    const response = await POST(speechRequest({ text: "Hello" }));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Authentication required.",
      code: "unauthorized",
    });
    expect(mocks.createSpeech).not.toHaveBeenCalled();
  });

  it("requires the tenant voice capability", async () => {
    mocks.requireAccess.mockResolvedValueOnce({
      ...access,
      capabilities: { ...access.capabilities, voice: false },
    });

    const response = await POST(speechRequest({ text: "Hello" }));

    expect(response.status).toBe(404);
    expect(mocks.createSpeech).not.toHaveBeenCalled();
  });

  it.each([
    [{ text: "" }, 400],
    [{ text: "x".repeat(4_001) }, 400],
    [{ message: "missing text" }, 400],
  ])("rejects invalid speech input", async (body, expectedStatus) => {
    const response = await POST(speechRequest(body));

    expect(response.status).toBe(expectedStatus);
    expect(mocks.createSpeech).not.toHaveBeenCalled();
  });

  it("fails safely when generated speech is not configured", async () => {
    mocks.isOpenAIConfigured.mockReturnValueOnce(false);

    const response = await POST(speechRequest({ text: "Hello" }));

    expect(response.status).toBe(503);
    expect(mocks.createSpeech).not.toHaveBeenCalled();
    expect(mocks.recordTelemetry).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "error",
        error_code: "speech_not_configured",
      }),
    );
  });

  it("enforces tenant-scoped AI rate and budget policy", async () => {
    mocks.enforcePolicy.mockReturnValueOnce({
      allowed: false,
      reason: "rate_limited",
      code: "ai_rate_limit_exceeded",
    });

    const response = await POST(speechRequest({ text: "Hello" }));

    expect(response.status).toBe(429);
    expect(mocks.createSpeech).not.toHaveBeenCalled();
  });

  it("returns a safe upstream failure without exposing provider details", async () => {
    mocks.createSpeech.mockRejectedValueOnce(
      new Error("provider secret diagnostic"),
    );

    const response = await POST(speechRequest({ text: "Hello" }));
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body).toEqual({
      error: "Generated CoPilot voice could not be created.",
      code: "speech_generation_failed",
    });
    expect(JSON.stringify(body)).not.toContain("provider secret diagnostic");
    expect(mocks.registerUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "error",
        errorCode: "speech_generation_failed",
      }),
    );
  });

  it("times out a stalled speech provider request", async () => {
    vi.useFakeTimers();
    try {
      mocks.createSpeech.mockImplementationOnce(
        (_body: unknown, options?: { signal?: AbortSignal }) =>
          new Promise((_, reject) => {
            options?.signal?.addEventListener(
              "abort",
              () => reject(new DOMException("Aborted", "AbortError")),
              { once: true },
            );
          }),
      );

      const pendingResponse = POST(speechRequest({ text: "Hello" }));
      await vi.advanceTimersByTimeAsync(20_001);
      const response = await pendingResponse;

      expect(response.status).toBe(504);
      await expect(response.json()).resolves.toEqual({
        error: "Generated CoPilot voice took too long to respond.",
        code: "speech_upstream_timeout",
      });
    } finally {
      vi.useRealTimers();
    }
  });
});

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
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

vi.mock("@/features/shared/lib/server/admin-access", () => ({
  requireShopScopedApiAccess: mocks.requireAccess,
}));

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
  recordDurableAIUsage: mocks.recordTelemetry,
}));

import { POST } from "../app/api/inspections/speech/route";

const access = {
  ok: true as const,
  profile: { shop_id: "shop-1" },
  authUserId: "auth-1",
};
const encodedAudio = new Uint8Array([9, 8, 7, 6]);

function speechRequest(body: unknown): NextRequest {
  return new Request("http://localhost/api/inspections/speech", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as NextRequest;
}

describe("POST /api/inspections/speech", () => {
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

  it("authenticates on canRunInspections (not the CoPilot's own capability, and not a broader staff-role allowlist) and returns generated MP3 audio", async () => {
    const response = await POST(speechRequest({ text: "Front left tire is flat." }));

    expect(response.status).toBe(200);
    expect(mocks.requireAccess).toHaveBeenCalledWith({
      requiredCapability: "canRunInspections",
    });
    expect(response.headers.get("content-type")).toBe("audio/mpeg");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(encodedAudio);
    expect(mocks.enforcePolicy).toHaveBeenCalledWith({
      feature: "inspection_voice_speech",
      endpoint: "/api/inspections/speech",
      shopId: "shop-1",
    });
    expect(mocks.createSpeech).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gpt-4o-mini-tts",
        voice: "marin",
        input: "Front left tire is flat.",
        response_format: "mp3",
      }),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(mocks.recordTelemetry).toHaveBeenCalledWith(
      expect.objectContaining({
        shop_id: "shop-1",
        user_id: "auth-1",
        status: "success",
      }),
    );
  });

  it("passes through the shop-scoped access response when unauthorized", async () => {
    const denied = NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    mocks.requireAccess.mockResolvedValueOnce({ ok: false, response: denied });

    const response = await POST(speechRequest({ text: "Hello" }));

    expect(response.status).toBe(401);
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

  it("fails safely when generated speech is not configured, before ever touching the rate/budget policy", async () => {
    mocks.isOpenAIConfigured.mockReturnValueOnce(false);

    const response = await POST(speechRequest({ text: "Hello" }));
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toEqual({
      error: "Generated voice is not configured.",
      code: "speech_not_configured",
    });
    expect(mocks.createSpeech).not.toHaveBeenCalled();
    expect(mocks.enforcePolicy).not.toHaveBeenCalled();
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
      error: "Generated voice could not be created.",
      code: "speech_generation_failed",
    });
    expect(JSON.stringify(body)).not.toContain("provider secret diagnostic");
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAccess: vi.fn(),
  getModel: vi.fn(),
  getPolicy: vi.fn(),
  estimate: vi.fn(),
  record: vi.fn(),
  reserve: vi.fn(),
  issueRate: vi.fn(),
}));

vi.mock("@/features/shared/lib/server/admin-access", () => ({
  requireShopScopedApiAccess: mocks.requireAccess,
}));
vi.mock("@/features/shared/lib/openai-realtime-models", () => ({
  getOpenAIInspectionTranscriptionModel: mocks.getModel,
}));
vi.mock("@/features/shared/lib/server/ai-policy", () => ({
  getAIPolicy: mocks.getPolicy,
}));
vi.mock("@/features/shared/lib/server/ai-cost", () => ({
  AI_RATE_CARD_VERSION: "openai-2026-10-06-v3",
  estimateOpenAIInspectionTranscriptionCostUsd: mocks.estimate,
}));
vi.mock("@/features/shared/lib/server/ai-governance", () => ({
  isAIGovernanceEnabled: () => false,
  isAIGovernanceFailClosed: () => true,
}));
vi.mock("@/features/shared/lib/server/ai-budget", () => ({
  AIBudgetDeniedError: class extends Error {},
  AIBudgetReplayError: class extends Error {},
  AIBudgetUnavailableError: class extends Error {},
  aiBudgetPoolForFeature: () => "voice",
  reserveAIBudget: mocks.reserve,
  releaseAIBudget: vi.fn(),
}));
vi.mock("@/features/shared/lib/server/ai-telemetry", () => ({
  recordDurableAIUsage: mocks.record,
}));
vi.mock("@/features/shared/lib/supabase/server", () => ({
  createAdminSupabase: () => ({ rpc: mocks.issueRate }),
}));

function request(body: unknown): Request {
  return new Request(
    "http://localhost/api/openai/inspection-transcription-token",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

describe("POST /api/openai/inspection-transcription-token", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    mocks.requireAccess.mockResolvedValue({
      ok: true,
      profile: { id: "actor_1", shop_id: "shop_1" },
    });
    mocks.getModel.mockReturnValue("gpt-live-transcribe");
    mocks.getPolicy.mockReturnValue({ timeoutMs: 1_000 });
    mocks.estimate.mockReturnValue(1.02);
    mocks.record.mockResolvedValue({ persisted: true });
    mocks.reserve.mockResolvedValue({ reservationId: "hold_1", wouldDeny: false });
    mocks.issueRate.mockResolvedValue({ data: true, error: null });
  });

  it("creates exactly one server-authenticated WebRTC transcription session", async () => {
    const upstream = vi.fn().mockResolvedValue(
      new Response("answer-sdp", {
        status: 201,
        headers: { "Content-Type": "application/sdp", Location: "/v1/realtime/calls/rtc_once" },
      }),
    );
    vi.stubGlobal("fetch", upstream);
    const { POST } =
      await import("../app/api/openai/inspection-transcription-token/route");

    const response = await POST(request({ sdp: "v=0\r\no=offer" }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual(
      expect.objectContaining({
        sdp: "answer-sdp",
        transcriptionModel: "gpt-live-transcribe",
      }),
    );
    expect(payload).not.toHaveProperty("token");
    expect(upstream).toHaveBeenCalledTimes(1);
    expect(mocks.reserve).toHaveBeenCalledTimes(1);
    expect(mocks.record).toHaveBeenCalledWith(expect.objectContaining({
      provider_request_id: "rtc_once", quota_receipt_id: "hold_1",
    }));
    const [url, init] = upstream.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.openai.com/v1/realtime/calls");
    expect(init.headers).toEqual({ Authorization: "Bearer test-key" });
    const form = init.body as FormData;
    expect(form.get("sdp")).toBe("v=0\r\no=offer");
    expect(JSON.parse(String(form.get("session")))).toEqual(
      expect.objectContaining({
        type: "transcription",
        audio: {
          input: expect.objectContaining({
            transcription: expect.objectContaining({
              model: "gpt-live-transcribe",
            }),
            turn_detection: null,
          }),
        },
      }),
    );
  });

  it("rejects a missing SDP offer before contacting OpenAI", async () => {
    const upstream = vi.fn();
    vi.stubGlobal("fetch", upstream);
    const { POST } =
      await import("../app/api/openai/inspection-transcription-token/route");

    const response = await POST(request({}));

    expect(response.status).toBe(400);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("aborts a timed-out OpenAI session request", async () => {
    mocks.getPolicy.mockReturnValueOnce({ timeoutMs: 1 });
    let upstreamSignal: AbortSignal | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init: RequestInit) => {
        upstreamSignal = init.signal as AbortSignal;
        return new Promise(() => undefined);
      }),
    );
    const { POST } =
      await import("../app/api/openai/inspection-transcription-token/route");

    const response = await POST(request({ sdp: "v=0\r\no=offer" }));

    expect(response.status).toBe(504);
    expect(upstreamSignal?.aborted).toBe(true);
  });
});

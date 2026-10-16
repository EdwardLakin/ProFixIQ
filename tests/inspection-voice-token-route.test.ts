import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class AIBudgetDeniedError extends Error {
    reason = "budget_exhausted";
  }
  class AIBudgetReplayError extends Error {}
  class AIBudgetUnavailableError extends Error {
    code = "database_unavailable";
  }
  return {
    requireAccess: vi.fn(),
    getModel: vi.fn(),
    getPolicy: vi.fn(),
    estimate: vi.fn(),
    enabled: vi.fn(),
    failClosed: vi.fn(),
    reserve: vi.fn(),
    release: vi.fn(),
    record: vi.fn(),
    issuanceRpc: vi.fn(),
    admin: vi.fn(),
    AIBudgetDeniedError,
    AIBudgetReplayError,
    AIBudgetUnavailableError,
  };
});

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
  isAIGovernanceEnabled: mocks.enabled,
  isAIGovernanceFailClosed: mocks.failClosed,
}));
vi.mock("@/features/shared/lib/server/ai-budget", () => ({
  AIBudgetDeniedError: mocks.AIBudgetDeniedError,
  AIBudgetReplayError: mocks.AIBudgetReplayError,
  AIBudgetUnavailableError: mocks.AIBudgetUnavailableError,
  aiBudgetPoolForFeature: () => "voice",
  reserveAIBudget: mocks.reserve,
  releaseAIBudget: mocks.release,
}));
vi.mock("@/features/shared/lib/server/ai-telemetry", () => ({
  recordDurableAIUsage: mocks.record,
}));
vi.mock("@/features/shared/lib/supabase/server", () => ({
  createAdminSupabase: mocks.admin,
}));

const operationKey = "a1000000-0000-4000-8000-000000000001";

function sessionRequest(key = operationKey): Request {
  return new Request(
    "http://localhost/api/openai/inspection-transcription-token",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-profixiq-operation-key": key,
      },
      body: JSON.stringify({ sdp: "v=0\r\no=offer" }),
    },
  );
}

describe("POST /api/openai/inspection-transcription-token", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    mocks.requireAccess.mockResolvedValue({
      ok: true,
      profile: { id: "actor_1", role: "tech", shop_id: "shop_1" },
      authUserId: "actor_1",
      supabase: {},
    });
    mocks.getModel.mockReturnValue("gpt-live-transcribe");
    mocks.getPolicy.mockReturnValue({ timeoutMs: 1_000 });
    mocks.estimate.mockReturnValue(1.02);
    mocks.enabled.mockReturnValue(true);
    mocks.failClosed.mockReturnValue(true);
    mocks.reserve.mockResolvedValue({
      reservationId: "reservation_1",
      wouldDeny: false,
    });
    mocks.release.mockResolvedValue(true);
    mocks.record.mockResolvedValue({ persisted: true });
    mocks.issuanceRpc.mockImplementation(async (name: string) => ({ data: name === "record_inspection_voice_issuance_rate", error: null }));
    mocks.admin.mockReturnValue({ rpc: mocks.issuanceRpc });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("v=0\r\no=answer", {
          status: 201,
          headers: { "Content-Type": "application/sdp", Location: "/v1/realtime/calls/rtc_test1" },
        }),
      ),
    );
  });

  it("reserves the one-hour maximum before creating one provider session", async () => {
    const { POST } =
      await import("../app/api/openai/inspection-transcription-token/route");
    const response = await POST(sessionRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.reserve).toHaveBeenCalledWith(
      expect.objectContaining({
        shopId: "shop_1",
        actorId: "actor_1",
        pool: "voice",
        amountUsd: 1.02,
        ttlSeconds: 3600,
        idempotencyKey: `inspection_voice:shop_1:${operationKey}`,
      }),
    );
    expect(mocks.issuanceRpc).toHaveBeenCalledWith("record_inspection_voice_issuance_rate", {
      p_shop_id: "shop_1", p_actor_id: "actor_1",
      p_reservation_id: "reservation_1", p_rate_card_version: "openai-2026-10-06-v3",
    });
    expect(mocks.reserve.mock.invocationCallOrder[0]).toBeLessThan(mocks.issuanceRpc.mock.invocationCallOrder[0]);
    expect(mocks.issuanceRpc.mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(fetch).mock.invocationCallOrder[0]);
    expect(mocks.record).toHaveBeenCalledWith(
      expect.objectContaining({
        estimated_cost_usd: 1.02,
        duration_seconds: 3600,
        quota_receipt_id: "reservation_1",
        provider_request_id: "rtc_test1",
        occurred_at: expect.any(String),
        operation: "inspection_transcription_reservation",
      }),
    );
    expect(body).toEqual(
      expect.objectContaining({
        usageKey: operationKey,
        sdp: "v=0\r\no=answer",
      }),
    );
    expect(body).not.toHaveProperty("token");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(
      "https://api.openai.com/v1/realtime/calls",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it.each([
    ["/v1/realtime/calls/019eb97d-8e9a-7ff3-94b0-ea019babd5d7", "019eb97d-8e9a-7ff3-94b0-ea019babd5d7"],
    ["https://api.openai.com/v1/realtime/calls/019eb97d-8e9a-7ff3-94b0-ea019babd5d7", "019eb97d-8e9a-7ff3-94b0-ea019babd5d7"],
  ])("persists accepted provider IDs from %s", async (location, callId) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("v=0\r\no=answer", {
      status: 201, headers: { Location: location },
    })));
    const { POST } = await import("../app/api/openai/inspection-transcription-token/route");
    const response = await POST(sessionRequest());
    expect(response.status).toBe(200);
    expect((await response.json()).sdp).toBe("v=0\r\no=answer");
    expect(mocks.record).toHaveBeenCalledWith(expect.objectContaining({
      provider_request_id: callId, quota_receipt_id: "reservation_1",
    }));
  });

  it("denies an enforcing budget before contacting OpenAI", async () => {
    mocks.reserve.mockRejectedValueOnce(
      new mocks.AIBudgetDeniedError("denied"),
    );
    const { POST } =
      await import("../app/api/openai/inspection-transcription-token/route");
    const response = await POST(sessionRequest());

    expect(response.status).toBe(402);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("withholds provider creation when durable issuance pricing cannot be stored", async () => {
    mocks.issuanceRpc.mockResolvedValueOnce({ data: null, error: { message: "database unavailable" } });
    const { POST } = await import("../app/api/openai/inspection-transcription-token/route");
    const response = await POST(sessionRequest());
    expect(response.status).toBe(503);
    expect((await response.json()).code).toBe("inspection_voice_rate_receipt_unavailable");
    expect(mocks.release).toHaveBeenCalledWith(expect.objectContaining({ reservationId: "reservation_1" }));
    expect(fetch).not.toHaveBeenCalled();
  });

  it("preserves the original operation while recording proof only for the refused claim hold", async () => {
    mocks.issuanceRpc.mockResolvedValueOnce({ data: false, error: null });
    const { POST } = await import("../app/api/openai/inspection-transcription-token/route");
    const response = await POST(sessionRequest());
    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe("inspection_voice_operation_recovery_required");
    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.record).toHaveBeenCalledWith(expect.objectContaining({
      error_code: "inspection_voice_pre_provider_failure", quota_receipt_id: "reservation_1", estimated_cost_usd: 0,
    }));
    expect(mocks.release).toHaveBeenCalledWith(expect.objectContaining({ reservationId: "reservation_1" }));
  });

  it("records zero-cost proof before a failed pre-provider release", async () => {
    mocks.issuanceRpc.mockResolvedValueOnce({ data: null, error: { message: "database unavailable" } });
    mocks.release.mockResolvedValueOnce(false);
    const { POST } = await import("../app/api/openai/inspection-transcription-token/route");
    const response = await POST(sessionRequest());
    expect(response.status).toBe(503);
    expect(mocks.record).toHaveBeenCalledWith(expect.objectContaining({
      event_key: `inspection_voice:shop_1:${operationKey}:error`,
      error_code: "inspection_voice_pre_provider_failure",
      estimated_cost_usd: 0, quota_receipt_id: "reservation_1",
    }));
    expect(mocks.record.mock.invocationCallOrder[0]).toBeLessThan(mocks.release.mock.invocationCallOrder[0]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects a retried operation key before creating another provider session", async () => {
    mocks.reserve.mockRejectedValueOnce(
      new mocks.AIBudgetReplayError("replayed"),
    );
    const { POST } =
      await import("../app/api/openai/inspection-transcription-token/route");
    const response = await POST(sessionRequest());

    expect(response.status).toBe(409);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(["released", "in_progress", "expired", "completed"])("distinguishes %s replay without creating another provider call", async (decision) => {
    mocks.reserve.mockRejectedValue(Object.assign(new mocks.AIBudgetReplayError("replayed"), { decision }));
    const { POST } = await import("../app/api/openai/inspection-transcription-token/route");
    const response = await POST(sessionRequest());
    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe(decision === "released"
      ? "inspection_voice_reservation_released" : "inspection_voice_reservation_replayed");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("releases the budget hold when OpenAI rejects session creation", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("rejected", { status: 429 })),
    );
    const { POST } =
      await import("../app/api/openai/inspection-transcription-token/route");
    const response = await POST(sessionRequest());

    expect(response.status).toBe(502);
    expect(mocks.release).toHaveBeenCalledWith(
      expect.objectContaining({
        shopId: "shop_1",
        reservationId: "reservation_1",
      }),
    );
  });

  it("preflights access and price without reserving or contacting OpenAI", async () => {
    const { GET } = await import("../app/api/openai/inspection-transcription-token/route");
    const response = await GET(new Request("http://localhost/api/openai/inspection-transcription-token?protocol=server-webrtc"));
    expect(response.status).toBe(204);
    expect(mocks.requireAccess).toHaveBeenCalledWith({ requiredCapability: "canRunInspections" });
    expect(mocks.reserve).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("gives a loaded legacy inspection page a safe refresh instruction", async () => {
    const { GET } = await import("../app/api/openai/inspection-transcription-token/route");
    const response = await GET(new Request("http://localhost/api/openai/inspection-transcription-token"));
    expect(response.status).toBe(426);
    expect(await response.json()).toEqual(expect.objectContaining({
      code: "inspection_voice_refresh_required",
      error: expect.stringContaining("Refresh this inspection page"),
    }));
    expect(mocks.reserve).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("leaves a definitive rejection receipt if its budget release fails", async () => {
    mocks.release.mockResolvedValueOnce(false);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("rejected", { status: 429 })));
    const { POST } = await import("../app/api/openai/inspection-transcription-token/route");
    const response = await POST(sessionRequest());
    expect(response.status).toBe(502);
    expect(mocks.record).toHaveBeenCalledWith(expect.objectContaining({
      event_key: `inspection_voice:shop_1:${operationKey}:error`,
      status: "error", error_code: "inspection_voice_rejected",
      quota_receipt_id: "reservation_1",
    }));
    expect(mocks.record.mock.invocationCallOrder[0]).toBeLessThan(mocks.release.mock.invocationCallOrder[0]);
  });

  it("keeps the uncertain hold and withholds the SDP if ledger recording cannot be confirmed", async () => {
    mocks.record.mockResolvedValue({ persisted: false });
    const { POST } =
      await import("../app/api/openai/inspection-transcription-token/route");
    const response = await POST(sessionRequest());
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.sdp).toBeUndefined();
    expect(mocks.record).toHaveBeenCalledTimes(3);
    expect(fetch).toHaveBeenCalledWith(
      "https://api.openai.com/v1/realtime/calls/rtc_test1/hangup",
      expect.objectContaining({ method: "POST" }),
    );
    expect(mocks.release).not.toHaveBeenCalled();
  });

  it("recovers an accepted call through its original claim when current shop membership blocks generic telemetry", async () => {
    mocks.record.mockResolvedValue({ persisted: false });
    mocks.issuanceRpc.mockResolvedValue({ data: true, error: null });
    const { POST } = await import("../app/api/openai/inspection-transcription-token/route");
    const response = await POST(sessionRequest());
    expect(response.status).toBe(200);
    expect((await response.json()).usageKey).toBe(operationKey);
    expect(mocks.issuanceRpc).toHaveBeenCalledWith("record_inspection_voice_issued_call", expect.objectContaining({
      p_actor_id: "actor_1", p_shop_id: "shop_1", p_reservation_id: "reservation_1",
      p_call_id: "rtc_test1", p_model: "gpt-live-transcribe", p_issued_at: expect.any(String),
    }));
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(mocks.release).not.toHaveBeenCalled();
  });

  it("rejects a sign-in switch before reserving or creating a provider call", async () => {
    const changedUserRequest = sessionRequest();
    changedUserRequest.headers.set("x-profixiq-actor-id", "actor_2");
    const { POST } = await import("../app/api/openai/inspection-transcription-token/route");
    const response = await POST(changedUserRequest);
    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe("inspection_voice_actor_changed");
    expect(mocks.reserve).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("settles a call if ledger persistence recovers after authenticated hangup", async () => {
    mocks.record.mockResolvedValueOnce({ persisted: false })
      .mockResolvedValueOnce({ persisted: false })
      .mockResolvedValueOnce({ persisted: true });
    mocks.issuanceRpc.mockImplementation(async (name: string) =>
      name === "confirm_inspection_voice_closure"
        ? { data: 30, error: null }
        : { data: name !== "record_inspection_voice_issued_call", error: null });
    const { POST } = await import("../app/api/openai/inspection-transcription-token/route");
    const response = await POST(sessionRequest());
    expect(response.status).toBe(503);
    expect(mocks.issuanceRpc).toHaveBeenCalledWith("confirm_inspection_voice_closure",
      expect.objectContaining({ p_call_id: "rtc_test1", p_usage_key: operationKey }));
    expect(mocks.issuanceRpc).toHaveBeenCalledWith("settle_inspection_voice_usage",
      expect.objectContaining({ p_duration_seconds: 30, p_actual_cost_usd: 0.0085 }));
    expect(mocks.release).not.toHaveBeenCalled();
  });

  it("aborts an uncertain upstream request but retains its hold", async () => {
    mocks.getPolicy.mockReturnValueOnce({ timeoutMs: 1 });
    let requestSignal: AbortSignal | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init: RequestInit) => {
        requestSignal = init.signal as AbortSignal;
        return new Promise(() => undefined);
      }),
    );
    const { POST } =
      await import("../app/api/openai/inspection-transcription-token/route");
    const response = await POST(sessionRequest());

    expect(response.status).toBe(504);
    expect(requestSignal?.aborted).toBe(true);
    expect(mocks.release).not.toHaveBeenCalled();
    expect(mocks.record).toHaveBeenCalledWith(expect.objectContaining({
      status: "success", quota_receipt_id: "reservation_1",
    }));
  });

  it("fails closed when durable budget reservation is unavailable", async () => {
    mocks.reserve.mockRejectedValueOnce(
      new mocks.AIBudgetUnavailableError("offline"),
    );
    const { POST } =
      await import("../app/api/openai/inspection-transcription-token/route");
    const response = await POST(sessionRequest());

    expect(response.status).toBe(503);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("retains and records an accepted call whose SDP body cannot be read", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true, status: 201,
      headers: new Headers({ Location: "/v1/realtime/calls/rtc_accepted" }),
      text: () => Promise.reject(new Error("body lost")),
    }));
    const { POST } = await import("../app/api/openai/inspection-transcription-token/route");
    const response = await POST(sessionRequest());
    expect(response.status).toBe(502);
    expect(mocks.release).not.toHaveBeenCalled();
    expect(mocks.record).toHaveBeenCalledWith(expect.objectContaining({
      status: "success", provider_request_id: "rtc_accepted",
      quota_receipt_id: "reservation_1",
    }));
  });

  it("keeps a hold after an ambiguous provider server error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("upstream error", { status: 503 })));
    const { POST } = await import("../app/api/openai/inspection-transcription-token/route");
    const response = await POST(sessionRequest());
    expect(response.status).toBe(500);
    expect(mocks.release).not.toHaveBeenCalled();
    expect(mocks.record).toHaveBeenCalledWith(expect.objectContaining({ status: "success" }));
  });

  it("requires a provider call receipt before exposing the SDP", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("v=0\r\no=answer", { status: 201 })));
    const { POST } = await import("../app/api/openai/inspection-transcription-token/route");
    const response = await POST(sessionRequest());
    expect(response.status).toBe(503);
    expect(mocks.release).not.toHaveBeenCalled();
  });

  it("scopes reused operation UUIDs to the authenticated shop", async () => {
    const { POST } = await import("../app/api/openai/inspection-transcription-token/route");
    await POST(sessionRequest());
    mocks.requireAccess.mockResolvedValueOnce({
      ok: true, profile: { id: "actor_2", shop_id: "shop_2" }, supabase: {},
    });
    await POST(sessionRequest());
    expect(mocks.reserve).toHaveBeenNthCalledWith(2, expect.objectContaining({
      shopId: "shop_2", idempotencyKey: `inspection_voice:shop_2:${operationKey}`,
    }));
    expect(mocks.record).toHaveBeenCalledWith(expect.objectContaining({
      event_key: `inspection_voice:shop_2:${operationKey}`,
    }));
  });

  it("reserves each concurrent session before either provider call", async () => {
    let providerCall = 0;
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => new Response("v=0\r\no=answer", {
      status: 201,
      headers: { Location: `/v1/realtime/calls/rtc_concurrent${++providerCall}` },
    })));
    let releaseReservations!: () => void;
    const reserved = new Promise<void>((resolve) => { releaseReservations = resolve; });
    mocks.reserve.mockImplementation(async () => {
      await reserved;
      return { reservationId: randomReservation(), wouldDeny: false };
    });
    let reservationCount = 0;
    function randomReservation() { return `reservation_${++reservationCount}`; }
    const { POST } = await import("../app/api/openai/inspection-transcription-token/route");
    const first = POST(sessionRequest(operationKey));
    const second = POST(sessionRequest("a1000000-0000-4000-8000-000000000002"));
    await vi.waitFor(() => expect(mocks.reserve).toHaveBeenCalledTimes(2));
    expect(fetch).not.toHaveBeenCalled();
    releaseReservations();
    const results = await Promise.all([first, second]);
    expect(results.map((result) => result.status)).toEqual([200, 200]);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(mocks.reserve.mock.calls.map(([args]) => args.idempotencyKey)).toEqual([
      `inspection_voice:shop_1:${operationKey}`,
      "inspection_voice:shop_1:a1000000-0000-4000-8000-000000000002",
    ]);
  });
});

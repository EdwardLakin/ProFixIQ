import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({
  requireAccess: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/features/shared/lib/server/admin-access", () => ({
  requireShopScopedApiAccess: mocks.requireAccess,
}));
vi.mock("@/features/shared/lib/supabase/server", () => ({
  createAdminSupabase: () => ({ rpc: mocks.rpc }),
}));

const access = {
  ok: true,
  profile: { id: "actor_1", role: "tech", shop_id: "shop_1" },
  supabase: {},
};
const usageKey = "ab000000-0000-4000-8000-000000000001";

function request(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/openai/inspection-transcription-usage", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("POST /api/openai/inspection-transcription-usage", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 200 })));
    mocks.requireAccess.mockResolvedValue(access);
    mocks.rpc.mockImplementation((name: string) => {
      if (name === "get_inspection_voice_session_receipt_for_actor") {
        return Promise.resolve({ data: {
          shopId: "shop_1", model: "gpt-live-transcribe", callId: "rtc_test1",
          rateCardVersion: "openai-2026-10-06-v3", reservedCostUsd: 1.02,
          operation: "inspection_transcription_reservation",
        }, error: null });
      }
      if (name === "confirm_inspection_voice_closure") {
        return Promise.resolve({ data: 12, error: null });
      }
      return Promise.resolve({
        data: { settled: true, alreadySettled: false },
        error: null,
      });
    });
  });

  it("uses the issued server model and settles the existing client payload", async () => {
    const { POST } = await import("../app/api/openai/inspection-transcription-usage/route");
    const response = await POST(request({ usageKey, durationSeconds: 12 }));

    expect(response.status).toBe(204);
    expect(mocks.rpc).toHaveBeenNthCalledWith(1, "get_inspection_voice_session_receipt_for_actor", {
      p_user_id: "actor_1",
      p_usage_key: usageKey,
    });
    expect(fetch).toHaveBeenCalledWith(
      "https://api.openai.com/v1/realtime/calls/rtc_test1/hangup",
      expect.objectContaining({ method: "POST" }),
    );
    expect(mocks.rpc).toHaveBeenNthCalledWith(3, "settle_inspection_voice_usage", {
      p_shop_id: "shop_1",
      p_user_id: "actor_1",
      p_usage_key: usageKey,
      p_model: "gpt-live-transcribe",
      p_duration_seconds: 12,
      p_actual_cost_usd: 0.0034,
    });
  });

  it("hangs up and settles the exact UUID provider call from its actor-bound receipt", async () => {
    const callId = "019eb97d-8e9a-7ff3-94b0-ea019babd5d7";
    mocks.rpc.mockResolvedValueOnce({ data: {
      shopId: "shop_1", model: "gpt-live-transcribe", callId,
      rateCardVersion: "openai-2026-10-06-v3", reservedCostUsd: 1.02,
      operation: "inspection_transcription_reservation",
    }, error: null });
    const { POST } = await import("../app/api/openai/inspection-transcription-usage/route");
    const response = await POST(request({ usageKey, durationSeconds: 0 }));
    expect(response.status).toBe(204);
    expect(fetch).toHaveBeenCalledWith(
      `https://api.openai.com/v1/realtime/calls/${callId}/hangup`,
      expect.objectContaining({ method: "POST" }),
    );
    expect(mocks.rpc).toHaveBeenCalledWith("confirm_inspection_voice_closure",
      expect.objectContaining({ p_call_id: callId }));
    expect(mocks.rpc).toHaveBeenCalledWith("settle_inspection_voice_usage",
      expect.objectContaining({ p_duration_seconds: 12, p_actual_cost_usd: 0.0034 }));
  });

  it.each(["rtc_", "not-a-call", "019eb97d-8e9a-7ff3-94b0-ea019babd5dg", "rtc_../other"])(
    "rejects invalid durable call ID %s before hangup", async (callId) => {
      mocks.rpc.mockResolvedValueOnce({ data: {
        shopId: "shop_1", model: "gpt-live-transcribe", callId,
        operation: "inspection_transcription_reservation",
      }, error: null });
      const { POST } = await import("../app/api/openai/inspection-transcription-usage/route");
      expect((await POST(request({ usageKey, durationSeconds: 0 }))).status).toBe(503);
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it("ignores inflated client duration and prices confirmed server duration", async () => {
    const { POST } = await import("../app/api/openai/inspection-transcription-usage/route");
    const response = await POST(request({ usageKey, durationSeconds: 99_999 }));

    expect(response.status).toBe(204);
    expect(mocks.rpc).toHaveBeenNthCalledWith(3, "settle_inspection_voice_usage",
      expect.objectContaining({ p_duration_seconds: 12, p_actual_cost_usd: 0.0034 }));
  });

  it("uses the issuance ceiling even when the configured price changes later", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: {
      shopId: "shop_1", model: "gpt-live-transcribe", callId: "rtc_test1",
      rateCardVersion: "earlier-card", reservedCostUsd: 2.04,
      operation: "inspection_transcription_closed", durationSeconds: 12,
    }, error: null });
    const { POST } = await import("../app/api/openai/inspection-transcription-usage/route");
    const response = await POST(request({ usageKey, durationSeconds: 0 }));
    expect(response.status).toBe(204);
    expect(mocks.rpc).toHaveBeenNthCalledWith(2, "settle_inspection_voice_usage",
      expect.objectContaining({ p_actual_cost_usd: 0.0068, p_duration_seconds: 12 }));
  });

  it("closes an issued session after the actor moves shops", async () => {
    mocks.requireAccess.mockResolvedValueOnce({ ...access, profile: { ...access.profile, shop_id: "shop_2" } });
    const { POST } = await import("../app/api/openai/inspection-transcription-usage/route");
    const response = await POST(request({ usageKey, durationSeconds: 0 }));
    expect(response.status).toBe(204);
    expect(mocks.requireAccess).toHaveBeenCalledWith();
    expect(mocks.rpc).toHaveBeenNthCalledWith(3, "settle_inspection_voice_usage",
      expect.objectContaining({ p_shop_id: "shop_1", p_user_id: "actor_1" }));
  });

  it("keeps a claimed operation pending until its original receipt is available", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: {
      code: "55000", message: "INSPECTION_VOICE_CALL_RECEIPT_PENDING",
    } });
    const { POST } = await import("../app/api/openai/inspection-transcription-usage/route");
    const response = await POST(request({ usageKey, durationSeconds: 0 }));
    expect(response.status).toBe(503);
    expect((await response.json()).code).toBe("inspection_voice_settlement_unavailable");
    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });

  it("rejects cross-tenant or unknown reservations before settlement", async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: null,
      error: { message: "INSPECTION_VOICE_RESERVATION_NOT_FOUND", code: "42501" },
    });
    const { POST } = await import("../app/api/openai/inspection-transcription-usage/route");
    const response = await POST(request({ usageKey, durationSeconds: 12 }));

    expect(response.status).toBe(403);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });

  it("clears a lost POST response when an actor-bound provider rejection proves no call exists", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: {
      shopId: "shop_1", operation: "inspection_transcription_rejected",
    }, error: null });
    const { POST } = await import("../app/api/openai/inspection-transcription-usage/route");
    const response = await POST(request({ usageKey, durationSeconds: 0 }));
    expect(response.status).toBe(204);
    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });

  it("rejects a receipt without its issuance rate", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: {
      shopId: "shop_1", model: "gpt-live-transcribe", callId: "rtc_test1", operation: "inspection_transcription_closed", durationSeconds: 12,
    }, error: null });
    const { POST } = await import("../app/api/openai/inspection-transcription-usage/route");
    const response = await POST(request({ usageKey, durationSeconds: 12 }));

    expect(response.status).toBe(422);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });

  it("surfaces a failed settlement so the client can retry", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: {
      shopId: "shop_1", model: "gpt-live-transcribe", callId: "rtc_test1", operation: "inspection_transcription_closed", durationSeconds: 12,
      rateCardVersion: "openai-2026-10-06-v3", reservedCostUsd: 1.02,
    }, error: null });
    mocks.rpc.mockResolvedValueOnce({
      data: null,
      error: { message: "database unavailable", code: "08006" },
    });
    const { POST } = await import("../app/api/openai/inspection-transcription-usage/route");
    const response = await POST(request({ usageKey, durationSeconds: 12 }));

    expect(response.status).toBe(500);
  });

  it("returns success for a duplicate idempotent settlement", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: {
      shopId: "shop_1", model: "gpt-live-transcribe", callId: "rtc_test1", operation: "inspection_transcription_settled", durationSeconds: 12,
      rateCardVersion: "openai-2026-10-06-v3", reservedCostUsd: 1.02,
    }, error: null });
    const { POST } = await import("../app/api/openai/inspection-transcription-usage/route");
    const response = await POST(request({ usageKey, durationSeconds: 12 }));

    expect(response.status).toBe(204);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("holds the reservation when provider hangup cannot be confirmed", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 404 })));
    const { POST } = await import("../app/api/openai/inspection-transcription-usage/route");
    const response = await POST(request({ usageKey, durationSeconds: 0 }));
    expect(response.status).toBe(503);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });

  it("retries settlement from a durable closure marker without hanging up again", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: {
      shopId: "shop_1", model: "gpt-live-transcribe", callId: "rtc_test1",
      operation: "inspection_transcription_closed", durationSeconds: 30,
      rateCardVersion: "openai-2026-10-06-v3", reservedCostUsd: 1.02,
    }, error: null });
    const { POST } = await import("../app/api/openai/inspection-transcription-usage/route");
    const response = await POST(request({ usageKey, durationSeconds: 0 }));
    expect(response.status).toBe(204);
    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenNthCalledWith(2, "settle_inspection_voice_usage",
      expect.objectContaining({ p_duration_seconds: 30, p_actual_cost_usd: 0.0085 }));
  });

  it("rejects invalid usage reports without touching the ledger", async () => {
    const { POST } = await import("../app/api/openai/inspection-transcription-usage/route");
    const response = await POST(request({ usageKey: "bad-key", durationSeconds: -1 }));

    expect(response.status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("requires authenticated shop staff access", async () => {
    mocks.requireAccess.mockResolvedValueOnce({
      ok: false,
      response: NextResponse.json({ error: "Denied" }, { status: 403 }),
    });
    const { POST } = await import("../app/api/openai/inspection-transcription-usage/route");
    const response = await POST(request({ usageKey, durationSeconds: 12 }));

    expect(response.status).toBe(403);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});

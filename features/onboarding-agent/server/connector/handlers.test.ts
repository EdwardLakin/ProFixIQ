import crypto from "crypto";
import { describe, expect, it, vi, beforeEach } from "vitest";

const shopId = "11111111-1111-4111-8111-111111111111";
const secret = "test-secret";

function sign(body: string, ts: number) {
  return crypto.createHmac("sha256", secret).update(`${ts}.${shopId}.${body}`).digest("hex");
}

describe("onboarding connector handlers", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.ONBOARDING_AGENT_INTERNAL_SECRET = secret;
  });

  it("accepts valid signed validate-shop request for existing shop", async () => {
    vi.doMock("@/features/shared/lib/supabase/server", () => ({
      createAdminSupabase: () => ({
        from: () => ({
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: shopId } }) }) }),
        }),
      }),
    }));
    const { handleValidateShop } = await import("./handlers");
    const body = JSON.stringify({ shopId, expectedShopId: shopId });
    const ts = Date.now();
    const res = await handleValidateShop(new Request("http://x/api/internal/onboarding-agent/validate-shop", { method: "POST", body, headers: { "x-shop-id": shopId, "x-onboarding-agent-timestamp": String(ts), "x-onboarding-agent-signature": sign(body, ts) } }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ ok: true, capabilities: { canWriteCustomers: true } });
  });

  it("rejects missing signature", async () => {
    const { handleValidateShop } = await import("./handlers");
    const res = await handleValidateShop(new Request("http://x", { method: "POST", body: JSON.stringify({ shopId, expectedShopId: shopId }) }));
    expect(res.status).toBe(401);
  });

  it("rejects stale signature", async () => {
    const { handleValidateShop } = await import("./handlers");
    const body = JSON.stringify({ shopId, expectedShopId: shopId });
    const ts = Date.now() - 10 * 60 * 1000;
    const res = await handleValidateShop(new Request("http://x", { method: "POST", body, headers: { "x-shop-id": shopId, "x-onboarding-agent-timestamp": String(ts), "x-onboarding-agent-signature": sign(body, ts) } }));
    expect(res.status).toBe(401);
  });

  it("rejects invalid signature", async () => {
    const { handleValidateShop } = await import("./handlers");
    const body = JSON.stringify({ shopId, expectedShopId: shopId });
    const ts = Date.now();
    const res = await handleValidateShop(new Request("http://x", { method: "POST", body, headers: { "x-shop-id": shopId, "x-onboarding-agent-timestamp": String(ts), "x-onboarding-agent-signature": "bad" } }));
    expect(res.status).toBe(401);
  });

  it("rejects shop mismatch", async () => {
    const { handleCustomerUpsert } = await import("./handlers");
    const body = JSON.stringify({ shopId: "22222222-2222-4222-8222-222222222222", idempotencyKey: "k", payload: {} });
    const ts = Date.now();
    const res = await handleCustomerUpsert(new Request("http://x", { method: "POST", body, headers: { "x-shop-id": shopId, "x-onboarding-agent-timestamp": String(ts), "x-onboarding-agent-signature": sign(body, ts) } }));
    expect(res.status).toBe(403);
  });

  it("rejects invalid body with safe error", async () => {
    const { handleValidateShop } = await import("./handlers");
    const body = JSON.stringify({ shopId });
    const ts = Date.now();
    const res = await handleValidateShop(new Request("http://x/api/internal/onboarding-agent/validate-shop", { method: "POST", body, headers: { "x-shop-id": shopId, "x-onboarding-agent-timestamp": String(ts), "x-onboarding-agent-signature": sign(body, ts) } }));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ ok: false, error: "invalid body" });
  });

  it("returns 404 when shop does not exist", async () => {
    vi.doMock("@/features/shared/lib/supabase/server", () => ({
      createAdminSupabase: () => ({
        from: () => ({
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }),
        }),
      }),
    }));
    const { handleValidateShop } = await import("./handlers");
    const body = JSON.stringify({ shopId, expectedShopId: shopId });
    const ts = Date.now();
    const res = await handleValidateShop(new Request("http://x/api/internal/onboarding-agent/validate-shop", { method: "POST", body, headers: { "x-shop-id": shopId, "x-onboarding-agent-timestamp": String(ts), "x-onboarding-agent-signature": sign(body, ts) } }));
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ ok: false, error: "shop not found" });
  });

  it("logs no secret values on rejection", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { handleValidateShop } = await import("./handlers");
    const res = await handleValidateShop(new Request("http://x/api/internal/onboarding-agent/validate-shop", { method: "POST", body: JSON.stringify({ shopId, expectedShopId: shopId }) }));
    expect(res.status).toBe(401);
    expect(warn).toHaveBeenCalled();
    const logged = JSON.stringify(warn.mock.calls);
    expect(logged).not.toContain(secret);
  });
});

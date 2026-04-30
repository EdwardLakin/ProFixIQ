import { describe, expect, it, vi } from "vitest";

const requireShopScopedApiAccess = vi.fn();
const createAdminSupabase = vi.fn();
const activateOnboardingSession = vi.fn();

vi.mock("@/features/shared/lib/server/admin-access", () => ({ requireShopScopedApiAccess }));
vi.mock("@/features/shared/lib/supabase/server", () => ({ createAdminSupabase }));
vi.mock("@/features/onboarding-agent/server/activateOnboardingSession", () => ({ activateOnboardingSession }));

describe("onboarding activation routes", () => {
  it("rejects unauthenticated access", async () => {
    requireShopScopedApiAccess.mockResolvedValue({ ok: false, response: new Response("unauthorized", { status: 401 }) });

    const { POST } = await import("./activate/route");
    const res = await POST(new Request("http://localhost", { method: "POST" }), { params: Promise.resolve({ sessionId: "s1" }) });

    expect(res.status).toBe(401);
  });

  it("canonical route uses shop-scoped profile for activation", async () => {
    requireShopScopedApiAccess.mockResolvedValue({ ok: true, profile: { shop_id: "shop-2", id: "u2" } });
    createAdminSupabase.mockReturnValue({ name: "admin-client" });
    activateOnboardingSession.mockResolvedValue({
      ok: true,
      phase: "vendors",
      completed: false,
      message: "Vendor activation completed.",
      result: {},
    });

    const { POST } = await import("./activate/route");
    const res = await POST(new Request("http://localhost", { method: "POST" }), { params: Promise.resolve({ sessionId: "s2" }) });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(activateOnboardingSession).toHaveBeenCalledWith(expect.objectContaining({
      shopId: "shop-2",
      sessionId: "s2",
      actorId: "u2",
    }));
  });

  it("legacy vendor route is disabled", async () => {
    requireShopScopedApiAccess.mockResolvedValue({ ok: true, profile: { shop_id: "shop-1", id: "u1" } });

    const { POST } = await import("./activate-vendors/route");
    const res = await POST(new Request("http://localhost", { method: "POST" }), { params: Promise.resolve({ sessionId: "s3" }) });
    const json = await res.json();

    expect(res.status).toBe(410);
    expect(json.error.code).toBe("legacy_activation_route_disabled");
    expect(json.error.canonicalRoute).toBe("/api/onboarding-agent/sessions/s3/activate");
  });

  it("legacy phase routes are disabled", async () => {
    requireShopScopedApiAccess.mockResolvedValue({ ok: true, profile: { shop_id: "shop-1", id: "u1" } });

    const routes = [
      await import("./activate-customers-vehicles/route"),
      await import("./activate-parts/route"),
      await import("./activate-history/route"),
    ];

    for (const route of routes) {
      const res = await route.POST(new Request("http://localhost", { method: "POST" }), { params: Promise.resolve({ sessionId: "s4" }) });
      const json = await res.json();

      expect(res.status).toBe(410);
      expect(json.error.code).toBe("legacy_activation_route_disabled");
      expect(json.error.canonicalRoute).toBe("/api/onboarding-agent/sessions/s4/activate");
    }
  });
});

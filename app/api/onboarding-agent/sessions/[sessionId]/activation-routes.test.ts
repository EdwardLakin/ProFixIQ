import { describe, expect, it, vi } from "vitest";

const requireShopScopedApiAccess = vi.fn();
const createAdminSupabase = vi.fn();
const activateOnboardingVendors = vi.fn();
const activateOnboardingParts = vi.fn();
const activateOnboardingHistory = vi.fn();

vi.mock("@/features/shared/lib/server/admin-access", () => ({ requireShopScopedApiAccess }));
vi.mock("@/features/shared/lib/supabase/server", () => ({ createAdminSupabase }));
vi.mock("@/features/onboarding-agent/server/activateOnboardingVendors", () => ({ activateOnboardingVendors }));
vi.mock("@/features/onboarding-agent/server/activateOnboardingParts", () => ({ activateOnboardingParts }));
vi.mock("@/features/onboarding-agent/server/activateOnboardingHistory", () => ({ activateOnboardingHistory }));

describe("onboarding activation routes", () => {
  it("rejects unauthenticated access", async () => {
    requireShopScopedApiAccess.mockResolvedValue({ ok: false, response: new Response("unauthorized", { status: 401 }) });
    const { POST } = await import("./activate-parts/route");
    const res = await POST(new Request("http://localhost", { method: "POST" }), { params: Promise.resolve({ sessionId: "s1" }) });
    expect(res.status).toBe(401);
  });

  it("returns summary shape for vendor route", async () => {
    requireShopScopedApiAccess.mockResolvedValue({ ok: true, profile: { shop_id: "shop-1", id: "u1" } });
    createAdminSupabase.mockReturnValue({});
    activateOnboardingVendors.mockResolvedValue({ ok: true, stagedVendors: 3, created: 1, matchedExisting: 2, updatedNullOnly: 0, skipped: 0, needsReview: 0, suppliersBefore: 10, suppliersAfter: 11, reviewItemsCreated: 0, warnings: [], records: [] });

    const { POST } = await import("./activate-vendors/route");
    const res = await POST(new Request("http://localhost", { method: "POST" }), { params: Promise.resolve({ sessionId: "s1" }) });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json).toHaveProperty("created");
  });

  it("route uses shop-scoped profile for history activation", async () => {
    requireShopScopedApiAccess.mockResolvedValue({ ok: true, profile: { shop_id: "shop-2", id: "u2" } });
    createAdminSupabase.mockReturnValue({});
    activateOnboardingHistory.mockResolvedValue({ ok: true, stagedHistoryRows: 1, historicalWorkOrdersCreated: 1, existingMatched: 0, linesCreated: 0, customerLinksResolved: 0, vehicleLinksResolved: 0, skipped: 0, needsReview: 0, reviewItemsCreated: 0, warnings: [] });

    const { POST } = await import("./activate-history/route");
    await POST(new Request("http://localhost", { method: "POST" }), { params: Promise.resolve({ sessionId: "s2" }) });

    expect(activateOnboardingHistory).toHaveBeenCalledWith(expect.objectContaining({ shopId: "shop-2", sessionId: "s2" }));
  });
});

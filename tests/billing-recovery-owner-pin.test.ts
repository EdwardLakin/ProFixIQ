import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  hashOwnerPin: vi.fn(),
  profileCompletion: vi.fn(),
  shop: vi.fn(),
  shopUpdate: vi.fn(),
  shopUpdateEq: vi.fn(),
  resolveAuthenticatedStaffProfile: vi.fn(),
  verifyOwnerPin: vi.fn(),
  setOwnerPinVerifiedCookie: vi.fn((response: Response) => response),
}));

vi.mock("@/features/shared/lib/supabase/server", () => ({
  createServerSupabaseRoute: () => ({
    auth: { getUser: mocks.getUser },
    from: vi.fn((table: string) => {
      const terminal =
        table === "profiles" ? mocks.profileCompletion : mocks.shop;
      const query: Record<string, ReturnType<typeof vi.fn>> = {};
      query.select = vi.fn(() => query);
      query.eq = vi.fn(() => query);
      query.maybeSingle = vi.fn(() => terminal());
      query.single = vi.fn(() => terminal());
      query.update = vi.fn(() => ({ eq: mocks.shopUpdateEq }));
      return query;
    }),
  }),
}));

vi.mock("@/features/shared/lib/server/admin-access", () => ({
  resolveAuthenticatedStaffProfile: mocks.resolveAuthenticatedStaffProfile,
}));

vi.mock("@/features/shared/lib/server/owner-pin-crypto", () => ({
  hashOwnerPin: mocks.hashOwnerPin,
  isValidOwnerPin: (pin: string) => /^\d{4,8}$/.test(pin),
  normalizeOwnerPin: (pin: string) => pin.trim(),
  verifyOwnerPin: mocks.verifyOwnerPin,
}));

vi.mock("@/features/shared/lib/server/owner-pin", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@/features/shared/lib/server/owner-pin")
    >();
  return {
    ...actual,
    setOwnerPinVerifiedCookie: mocks.setOwnerPinVerifiedCookie,
  };
});

function request(purpose: string) {
  return new Request("https://profixiq.test/api/shop/owner-pin/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ shopId: "shop-1", pin: "4826", purpose }),
  });
}

function setRequest(purpose?: string) {
  return new Request("https://profixiq.test/api/shop/owner-pin/set", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ shopId: "shop-1", pin: "4826", purpose }),
  });
}

describe("billing recovery owner PIN", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "owner-auth-1" } },
      error: null,
    });
    mocks.resolveAuthenticatedStaffProfile.mockResolvedValue({
      profile: {
        id: "owner-profile-1",
        user_id: "owner-auth-1",
        shop_id: "shop-1",
        role: "owner",
      },
      error: null,
    });
    mocks.profileCompletion.mockResolvedValue({
      data: { completed_onboarding: false },
      error: null,
    });
    mocks.shop.mockResolvedValue({
      data: { id: "shop-1", owner_pin_hash: "hashed-pin" },
      error: null,
    });
    mocks.verifyOwnerPin.mockResolvedValue(true);
    mocks.hashOwnerPin.mockResolvedValue("new-hashed-pin");
    mocks.shopUpdate.mockResolvedValue({ error: null });
    mocks.shopUpdateEq.mockImplementation(() => mocks.shopUpdate());
  });

  it("keeps ordinary owner settings locked while onboarding is incomplete", async () => {
    const { POST } = await import("../app/api/shop/owner-pin/verify/route");

    const response = await POST(request("owner_pin:privileged"));

    expect(response.status).toBe(409);
    expect(mocks.verifyOwnerPin).not.toHaveBeenCalled();
  });

  it("accepts exact PIN proof only for the billing recovery purpose", async () => {
    const { POST } = await import("../app/api/shop/owner-pin/verify/route");

    const response = await POST(request("owner_pin:billing"));

    expect(response.status).toBe(200);
    expect(mocks.verifyOwnerPin).toHaveBeenCalledWith("4826", "hashed-pin");
    expect(mocks.setOwnerPinVerifiedCookie).toHaveBeenCalledWith(
      expect.any(Response),
      {
        userId: "owner-auth-1",
        shopId: "shop-1",
        purpose: "owner_pin:billing",
      },
    );
  });

  it("does not let an incomplete owner set a privileged PIN by omitting purpose", async () => {
    const { POST } = await import("../app/api/shop/owner-pin/set/route");

    const response = await POST(setRequest());

    expect(response.status).toBe(409);
    expect(mocks.hashOwnerPin).not.toHaveBeenCalled();
    expect(mocks.shopUpdate).not.toHaveBeenCalled();
    expect(mocks.setOwnerPinVerifiedCookie).not.toHaveBeenCalled();
  });

  it("sets a billing-scoped PIN during incomplete onboarding", async () => {
    const { POST } = await import("../app/api/shop/owner-pin/set/route");

    const response = await POST(setRequest("owner_pin:billing"));

    expect(response.status).toBe(200);
    expect(mocks.hashOwnerPin).toHaveBeenCalledWith("4826");
    expect(mocks.shopUpdate).toHaveBeenCalled();
    expect(mocks.setOwnerPinVerifiedCookie).toHaveBeenCalledWith(
      expect.any(Response),
      {
        userId: "owner-auth-1",
        shopId: "shop-1",
        purpose: "owner_pin:billing",
      },
    );
  });

  it("preserves the legacy privileged PIN setup for completed owners", async () => {
    mocks.profileCompletion.mockResolvedValue({
      data: { completed_onboarding: true },
      error: null,
    });
    const { POST } = await import("../app/api/shop/owner-pin/set/route");

    const response = await POST(setRequest());

    expect(response.status).toBe(200);
    expect(mocks.setOwnerPinVerifiedCookie).toHaveBeenCalledWith(
      expect.any(Response),
      {
        userId: "owner-auth-1",
        shopId: "shop-1",
        purpose: "owner_pin:privileged",
      },
    );
  });

  it("rejects an unknown PIN purpose instead of escalating it", async () => {
    const { POST } = await import("../app/api/shop/owner-pin/set/route");

    const response = await POST(setRequest("owner_pin:root"));

    expect(response.status).toBe(400);
    expect(mocks.hashOwnerPin).not.toHaveBeenCalled();
    expect(mocks.setOwnerPinVerifiedCookie).not.toHaveBeenCalled();
  });
});

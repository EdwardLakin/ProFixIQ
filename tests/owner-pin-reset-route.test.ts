import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createServerSupabaseRoute: vi.fn(),
  resolveAuthenticatedStaffProfile: vi.fn(),
  hashOwnerPin: vi.fn(),
  createOwnerPinToken: vi.fn(),
  setOwnerPinVerifiedCookie: vi.fn(),
  update: vi.fn(),
  eq: vi.fn(),
  select: vi.fn(),
  maybeSingle: vi.fn(),
  getUser: vi.fn(),
}));

vi.mock("@/features/shared/lib/supabase/server", () => ({
  createServerSupabaseRoute: mocks.createServerSupabaseRoute,
}));
vi.mock("@/features/shared/lib/server/admin-access", () => ({
  resolveAuthenticatedStaffProfile: mocks.resolveAuthenticatedStaffProfile,
}));
vi.mock("@/features/shared/lib/server/owner-pin-crypto", () => ({
  hashOwnerPin: mocks.hashOwnerPin,
  isValidOwnerPin: (pin: string) => /^\d{4,8}$/.test(pin),
  normalizeOwnerPin: (pin: string) => pin.replace(/\D/g, ""),
}));
vi.mock("@/features/shared/lib/server/owner-pin", () => ({
  createOwnerPinToken: mocks.createOwnerPinToken,
  OWNER_PIN_PURPOSES: {
    PRIVILEGED: "owner_pin:privileged",
    SETTINGS: "owner_pin:settings",
    BILLING: "owner_pin:billing",
    BRANDING: "owner_pin:branding",
  },
  setOwnerPinVerifiedCookie: mocks.setOwnerPinVerifiedCookie,
}));

import { POST } from "../app/api/shop/owner-pin/reset/route";

function request(body: unknown) {
  return new Request("https://profixiq.test/api/shop/owner-pin/reset", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/shop/owner-pin/reset", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "owner-1" } },
      error: null,
    });
    mocks.createServerSupabaseRoute.mockReturnValue({
      auth: { getUser: mocks.getUser },
      from: () => ({ update: mocks.update }),
    });
    mocks.resolveAuthenticatedStaffProfile.mockResolvedValue({
      profile: { id: "owner-1", shop_id: "shop-1", role: "owner" },
      error: null,
    });
    mocks.hashOwnerPin.mockResolvedValue("hash-of-new-pin");
    mocks.createOwnerPinToken.mockReturnValue("signed-proof");
    mocks.setOwnerPinVerifiedCookie.mockImplementation((response: Response) => {
      response.headers.set("x-owner-pin-proof", "issued");
      return response;
    });
    mocks.update.mockReturnValue({ eq: mocks.eq });
    mocks.eq.mockReturnValue({ select: mocks.select });
    mocks.select.mockReturnValue({ maybeSingle: mocks.maybeSingle });
    mocks.maybeSingle.mockResolvedValue({
      data: { id: "shop-1" },
      error: null,
    });
  });

  it("checks shop scope and owner role before changing the PIN", async () => {
    mocks.resolveAuthenticatedStaffProfile.mockResolvedValue({
      profile: { id: "owner-1", shop_id: "other-shop", role: "owner" },
      error: null,
    });

    const response = await POST(request({ shopId: "shop-1", pin: "1234" }));

    expect(response.status).toBe(403);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("updates once and returns a proof bound to the new PIN and requested scope", async () => {
    const response = await POST(
      request({
        shopId: "shop-1",
        pin: "1234",
        purpose: "owner_pin:settings",
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("x-owner-pin-proof")).toBe("issued");
    expect(mocks.update).toHaveBeenCalledOnce();
    expect(mocks.update).toHaveBeenCalledWith({
      owner_pin_hash: "hash-of-new-pin",
      owner_pin: null,
      pin: null,
    });
    expect(mocks.eq).toHaveBeenCalledWith("id", "shop-1");
    expect(mocks.createOwnerPinToken).toHaveBeenCalledWith({
      userId: "owner-1",
      shopId: "shop-1",
      purpose: "owner_pin:settings",
      ownerPinHash: "hash-of-new-pin",
    });
    expect(mocks.setOwnerPinVerifiedCookie).toHaveBeenCalledOnce();
  });

  it("does not return success when the shop update fails", async () => {
    mocks.maybeSingle.mockResolvedValue({
      data: null,
      error: { message: "write failed" },
    });

    const response = await POST(request({ shopId: "shop-1", pin: "1234" }));

    expect(response.status).toBe(500);
    expect(mocks.setOwnerPinVerifiedCookie).not.toHaveBeenCalled();
  });
});

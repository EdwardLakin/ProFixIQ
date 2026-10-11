import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  canMutate: vi.fn(),
  from: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  eq: vi.fn(),
  select: vi.fn(),
  maybeSingle: vi.fn(),
  requireShopAccess: vi.fn(),
}));

vi.mock("@/features/equipment/server/equipmentInspectionEntitlement", () => ({
  shopCanMutateInspectionSections: mocks.canMutate,
}));

vi.mock("@/features/shared/lib/server/admin-access", () => ({
  requireShopScopedApiAccess: mocks.requireShopAccess,
}));

vi.mock("@/features/shared/lib/supabase/server", () => ({
  createAdminSupabase: () => ({ from: mocks.from }),
}));

import { PATCH, POST } from "../app/api/inspections/templates/route";

const SHOP_ID = "00000000-0000-4000-8000-000000000111";
const USER_ID = "00000000-0000-4000-8000-000000000222";
const TEMPLATE_ID = "00000000-0000-4000-8000-000000000333";

const roadSections = [
  { title: "Brakes", items: [{ item: "Inspect brake hoses" }] },
];
const equipmentSections = [
  {
    title: "Off-Road — Hydraulic System",
    items: [{ item: "Hydraulic pump condition" }],
  },
];

const chain = {
  insert: mocks.insert,
  update: mocks.update,
  eq: mocks.eq,
  select: mocks.select,
  maybeSingle: mocks.maybeSingle,
};

function request(method: "POST" | "PATCH", sections: unknown, templateId?: string) {
  return new Request("http://localhost/api/inspections/templates", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...(templateId ? { templateId } : {}),
      templateName: "Guard test",
      sections,
      description: "Equipment entitlement test",
      vehicleType: null,
      tags: ["custom"],
      laborHours: 1,
    }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.from.mockReturnValue(chain);
  mocks.insert.mockReturnValue(chain);
  mocks.update.mockReturnValue(chain);
  mocks.eq.mockReturnValue(chain);
  mocks.select.mockReturnValue(chain);
  mocks.maybeSingle.mockResolvedValue({ data: { id: TEMPLATE_ID }, error: null });
  mocks.canMutate.mockResolvedValue(true);
  mocks.requireShopAccess.mockResolvedValue({
    ok: true,
    authUserId: USER_ID,
    profile: { id: USER_ID, shop_id: SHOP_ID, role: "owner" },
    supabase: { from: vi.fn() },
  });
});

describe("Shop inspection-template Equipment entitlement guard", () => {
  it("derives shop ownership server-side for allowed creates", async () => {
    const response = await POST(request("POST", roadSections));

    expect(response.status).toBe(201);
    expect(mocks.canMutate).toHaveBeenCalledWith(SHOP_ID, roadSections);
    expect(mocks.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        shop_id: SHOP_ID,
        user_id: USER_ID,
        sections: roadSections,
      }),
    );
  });

  it("rejects Equipment content before any database mutation when the add-on is absent", async () => {
    mocks.canMutate.mockResolvedValueOnce(false);

    const response = await POST(request("POST", equipmentSections));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "An active Equipment subscription is required for this inspection template.",
    });
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("fails closed when Equipment entitlement cannot be verified", async () => {
    mocks.canMutate.mockRejectedValueOnce(new Error("Stripe unavailable"));

    const response = await PATCH(
      request("PATCH", equipmentSections, TEMPLATE_ID),
    );

    expect(response.status).toBe(503);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("scopes allowed updates by template, shop, and authenticated user", async () => {
    const response = await PATCH(request("PATCH", roadSections, TEMPLATE_ID));

    expect(response.status).toBe(200);
    expect(mocks.eq).toHaveBeenNthCalledWith(1, "id", TEMPLATE_ID);
    expect(mocks.eq).toHaveBeenNthCalledWith(2, "shop_id", SHOP_ID);
    expect(mocks.eq).toHaveBeenNthCalledWith(3, "user_id", USER_ID);
  });
});

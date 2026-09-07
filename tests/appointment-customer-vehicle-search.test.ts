import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const SHOP_ID = "8b100000-0000-4000-8000-000000000001";
const USER_ID = "8a100000-0000-4000-8000-000000000001";

const mocks = vi.hoisted(() => ({
  requireAccess: vi.fn(),
  search: vi.fn(),
}));

vi.mock("@/features/shared/lib/server/admin-access", () => ({
  requireShopScopedApiAccess: mocks.requireAccess,
}));

vi.mock("@/features/scheduling/server/searchAppointmentCustomerVehicles", () => ({
  searchAppointmentCustomerVehicles: mocks.search,
}));

describe("appointment customer / vehicle search", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAccess.mockResolvedValue({
      ok: true,
      profile: { id: USER_ID, shop_id: SHOP_ID, role: "advisor" },
      authUserId: USER_ID,
      canonicalRole: "advisor",
      supabase: { from: vi.fn() },
    });
    mocks.search.mockResolvedValue({ query: "Edward", groups: [] });
  });

  it("derives the tenant from authenticated staff access instead of request input", async () => {
    const { GET } = await import(
      "../app/api/scheduling/customer-vehicle-search/route"
    );
    const response = await GET(
      new Request(
        "https://profixiq.test/api/scheduling/customer-vehicle-search?q=Edward&shop_id=11111111-1111-4111-8111-111111111111",
      ),
    );

    expect(response.status).toBe(200);
    expect(mocks.requireAccess).toHaveBeenCalledTimes(1);
    expect(mocks.search).toHaveBeenCalledWith(
      expect.objectContaining({
        shopId: SHOP_ID,
        query: "Edward",
      }),
    );
  });

  it("does not run search after the scheduling writer boundary denies access", async () => {
    mocks.requireAccess.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
      }),
    });
    const { GET } = await import(
      "../app/api/scheduling/customer-vehicle-search/route"
    );
    const response = await GET(
      new Request(
        "https://profixiq.test/api/scheduling/customer-vehicle-search?q=Edward",
      ),
    );

    expect(response.status).toBe(403);
    expect(mocks.search).not.toHaveBeenCalled();
  });

  it("keeps appointment creation on canonical ids and replaces the create-form native customer select", () => {
    const page = readFileSync("app/dashboard/appointments/page.tsx", "utf8");
    const picker = readFileSync(
      "app/dashboard/appointments/AppointmentCustomerVehiclePicker.tsx",
      "utf8",
    );
    const route = readFileSync(
      "app/api/scheduling/customer-vehicle-search/route.ts",
      "utf8",
    );
    const helper = readFileSync(
      "features/scheduling/server/searchAppointmentCustomerVehicles.ts",
      "utf8",
    );

    const createForm = page.slice(
      page.indexOf("function CreateForm"),
      page.indexOf("function EditForm"),
    );

    expect(createForm).toContain("<AppointmentCustomerVehiclePicker");
    expect(createForm).not.toContain("Customer (from database)");
    expect(createForm).toContain("if (!customerId)");
    expect(createForm).toContain("customerId,");
    expect(createForm).toContain("vehicleId: vehicleId || undefined");
    expect(picker).toContain("/api/scheduling/customer-vehicle-search?q=");
    expect(picker).toContain("Search name, phone, email, VIN, plate or unit");
    expect(route).toContain("ROLE_GROUPS.schedulerBookingWriters");
    expect(route).toContain("shopId: access.profile.shop_id");
    expect(helper).toContain('.eq("shop_id", shopId)');
    expect(helper).toContain('.is("archived_at", null)');
    expect(helper).toContain('.is("merged_into_customer_id", null)');
  });
});

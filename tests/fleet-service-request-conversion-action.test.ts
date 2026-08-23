import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { convertFleetServiceRequest } from "@/features/fleet/lib/convertFleetServiceRequest";

const routeMocks = vi.hoisted(() => ({
  requireShopScopedApiAccess: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/features/shared/lib/server/admin-access", () => ({
  requireShopScopedApiAccess: routeMocks.requireShopScopedApiAccess,
}));

const componentPath = "features/fleet/components/ShopFleetRequestInbox.tsx";

describe("fleet service-request conversion action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    routeMocks.requireShopScopedApiAccess.mockResolvedValue({
      ok: true,
      supabase: { rpc: routeMocks.rpc },
    });
  });

  it("keeps conversion in the guarded Shop inbox and out of Fleet", () => {
    const source = readFileSync(componentPath, "utf8");
    const shopPage = readFileSync(
      "app/work-orders/fleet-requests/page.tsx",
      "utf8",
    );
    const fleetPage = readFileSync(
      "features/fleet/components/FleetServiceRequestsPage.tsx",
      "utf8",
    );
    const conversionRoute = readFileSync(
      "app/api/fleet/service-requests/convert-to-work-order/route.ts",
      "utf8",
    );

    expect(shopPage).toContain("requireShopPageAccess");
    expect(shopPage).toContain("SHOP_FLEET_REQUEST_INTAKE_ROLES");
    expect(source).toContain("convertFleetServiceRequest(item.id)");
    expect(source).toContain("Accept into Shop");
    expect(source).toContain("payload?.canManage");
    expect(fleetPage).not.toContain("convertFleetServiceRequest");
    expect(fleetPage).not.toContain("Create work order");
    expect(conversionRoute).toContain("requireShopScopedApiAccess");
    expect(conversionRoute).toContain("SHOP_FLEET_REQUEST_INTAKE_ROLES");
    expect(conversionRoute).toContain(
      "convert_owned_fleet_service_request_to_work_order_atomic",
    );
    expect(conversionRoute).toContain("isFleetProductHostname(requestHost)");
    expect(conversionRoute).toContain(
      "Work orders are created in ProFixIQ Shop.",
    );
  });

  it("posts the request id and returns the resulting work order", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ workOrderId: "work-order-1" }),
    });

    await expect(
      convertFleetServiceRequest("service-request-1", fetchMock as never),
    ).resolves.toBe("work-order-1");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/fleet/service-requests/convert-to-work-order",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ serviceRequestId: "service-request-1" }),
      }),
    );
  });

  it("surfaces API failures instead of navigating", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: "Request is not convertible" }),
    });

    await expect(
      convertFleetServiceRequest("service-request-1", fetchMock as never),
    ).rejects.toThrow("Request is not convertible");
  });

  it("returns a safe conflict for a legacy ownership mismatch", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    routeMocks.rpc.mockResolvedValue({
      data: null,
      error: {
        message:
          "work_order 11111111-1111-4111-8111-111111111111 customer_id 22222222-2222-4222-8222-222222222222 does not match vehicle 33333333-3333-4333-8333-333333333333 customer_id 44444444-4444-4444-8444-444444444444",
      },
    });
    const { POST } = await import(
      "../app/api/fleet/service-requests/convert-to-work-order/route"
    );

    const response = await POST(
      new Request(
        "https://profixiq.test/api/fleet/service-requests/convert-to-work-order",
        {
          method: "POST",
          body: JSON.stringify({ serviceRequestId: "request-1" }),
        },
      ) as never,
    );

    expect(response.status).toBe(409);
    expect(routeMocks.rpc).toHaveBeenCalledWith(
      "convert_owned_fleet_service_request_to_work_order_atomic",
      { p_service_request_id: "request-1" },
    );
    await expect(response.json()).resolves.toEqual({
      error:
        "This unit's billing ownership must be reviewed before service can continue.",
    });
    consoleError.mockRestore();
  });

  it("does not expose unexpected database failures", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    routeMocks.rpc.mockResolvedValue({
      data: null,
      error: { message: "relation private.secret_table does not exist" },
    });
    const { POST } = await import(
      "../app/api/fleet/service-requests/convert-to-work-order/route"
    );

    const response = await POST(
      new Request(
        "https://profixiq.test/api/fleet/service-requests/convert-to-work-order",
        {
          method: "POST",
          body: JSON.stringify({ serviceRequestId: "request-1" }),
        },
      ) as never,
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Failed to create a structured work order from this request.",
    });
    consoleError.mockRestore();
  });
});

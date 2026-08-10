import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { convertFleetServiceRequest } from "@/features/fleet/lib/convertFleetServiceRequest";

const componentPath = "features/fleet/components/ShopFleetRequestInbox.tsx";

describe("fleet service-request conversion action", () => {
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
});

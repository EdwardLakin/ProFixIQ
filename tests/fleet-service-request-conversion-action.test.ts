import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { convertFleetServiceRequest } from "@/features/fleet/lib/convertFleetServiceRequest";

const componentPath =
  "features/fleet/components/FleetServiceRequestsPage.tsx";

describe("fleet service-request conversion action", () => {
  it("shows conversion only for internal actors with the exact capability and an open request", () => {
    const source = readFileSync(componentPath, "utf8");
    expect(source).toContain('routePrefix === "/fleet"');
    expect(source).toContain("uiContext.isInternal");
    expect(source).toContain(
      "uiContext.capabilities.canConvertServiceRequestToWorkOrder",
    );
    expect(source).toContain('item.status === "open"');
    expect(source).toContain("Create work order");
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

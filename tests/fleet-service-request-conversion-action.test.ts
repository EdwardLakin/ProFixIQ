import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const componentPath =
  "features/fleet/components/FleetServiceRequestsPage.tsx";

function componentSource() {
  return readFileSync(componentPath, "utf8");
}

describe("fleet service request shop conversion", () => {
  it("offers conversion only on the authorized internal fleet surface", () => {
    const source = componentSource();

    expect(source).toContain('routePrefix === "/fleet"');
    expect(source).toContain("uiContext.capabilities.canConvertRequests");
    expect(source).toContain('"Create work order"');
  });

  it("calls the canonical conversion route and opens the resulting work order", () => {
    const source = componentSource();

    expect(source).toContain(
      '"/api/fleet/service-requests/convert-to-work-order"',
    );
    expect(source).toContain("serviceRequestId: item.id");
    expect(source).toContain("encodeURIComponent(body.workOrderId)");
  });
});

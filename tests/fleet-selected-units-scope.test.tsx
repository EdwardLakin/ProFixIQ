import type { ReactNode } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import FleetUnitsPage from "@/features/fleet/components/FleetUnitsPage";
import type { FleetUiContext } from "@/features/fleet/lib/fleetUiCapabilities";

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/portal/fleet/units",
}));

const FLEET_B = "30000000-0000-4000-8000-00000000000b";
const uiContext = {
  actorType: "fleet_manager",
  actorLabel: "Fleet Manager",
  experience: "external_manager",
  isInternal: false,
  capabilities: {
    canViewDispatch: true,
    canManageUnits: true,
    canSubmitPretrip: false,
    canReviewPretripHistory: true,
    canCreateServiceRequests: true,
    canViewBroadFleetOperations: true,
    canAccessPortalFleetWrappers: true,
    canViewServiceRequests: true,
    canManagePretripTemplates: true,
    canViewUnitMaintenanceRecord: true,
  },
} satisfies FleetUiContext;

describe("selected Fleet units scope", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses the server-validated selected Fleet in the units request", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            units: [
              {
                id: "40000000-0000-4000-8000-000000000001",
                fleetId: FLEET_B,
                label: "Unit 42",
                fleetName: "Secondary Fleet",
                plate: null,
                vin: null,
                status: "in_service",
                nextInspectionDate: null,
                location: null,
                currentOdometerKm: null,
                currentEngineHours: null,
                pmDueCount: 0,
                openRequestCount: 0,
              },
            ],
          }),
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <FleetUnitsPage
        uiContext={uiContext}
        routePrefix="/portal/fleet"
        fleetId={FLEET_B}
      />,
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      fleetId: FLEET_B,
    });
    expect(await screen.findByRole("link", { name: /Open unit/i })).toHaveAttribute(
      "href",
      `/portal/fleet/units/40000000-0000-4000-8000-000000000001?fleetId=${FLEET_B}`,
    );
  });
});

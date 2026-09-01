import type { ReactNode } from "react";
import { render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import FleetUnitsPage from "@/features/fleet/components/FleetUnitsPage";
import type { FleetUiContext } from "@/features/fleet/lib/fleetUiCapabilities";

vi.mock("next/link", () => ({
  default: ({ children }: { children: ReactNode }) => children,
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
        new Response(JSON.stringify({ units: [] }), { status: 200 }),
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
  });
});

import type { ReactNode } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import FleetMaintenanceWorkspace from "@/features/fleet/components/FleetMaintenanceWorkspace";
import type { FleetUiContext } from "@/features/fleet/lib/fleetUiCapabilities";

vi.mock("next/link", () => ({
  default: ({ children }: { children: ReactNode }) => children,
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

describe("selected Fleet maintenance scope", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses the server-validated selected Fleet in its initial API request", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          canManage: true,
          canManagePrograms: false,
          fleets: [{ id: FLEET_B, name: "Secondary Fleet" }],
          summary: {
            overdue: 0,
            due: 0,
            deferred: 0,
            converted: 0,
            clearUnits: 0,
          },
          units: [],
          items: [],
          programs: [],
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <FleetMaintenanceWorkspace
        uiContext={uiContext}
        routePrefix="/portal/fleet"
        initialFleetId={FLEET_B}
      />,
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      action: "list",
      fleetId: FLEET_B,
    });
    expect(screen.queryByRole("option", { name: "All fleets" })).toBeNull();
  });
});

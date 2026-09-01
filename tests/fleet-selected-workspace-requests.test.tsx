import type { ReactNode } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import FleetMaintenanceCalendar from "@/features/fleet/components/FleetMaintenanceCalendar";
import FleetBillingWorkspace from "@/features/fleet/components/FleetBillingWorkspace";
import FleetDefectQueue from "@/features/fleet/components/FleetDefectQueue";
import FleetDriverDashboard from "@/features/fleet/components/FleetDriverDashboard";
import FleetDriversWorkspace from "@/features/fleet/components/FleetDriversWorkspace";
import FleetServiceRequestsPage from "@/features/fleet/components/FleetServiceRequestsPage";
import type { FleetUiContext } from "@/features/fleet/lib/fleetUiCapabilities";

vi.mock("next/link", () => ({
  default: ({ children }: { children: ReactNode }) => children,
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/portal/fleet",
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

describe("selected Fleet workspace requests", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads the calendar for the server-validated Fleet", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          fleets: [{ id: FLEET_B, name: "Secondary Fleet" }],
          summary: { due: 0, planned: 0, inspections: 0, unscheduled: 0 },
          events: [],
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<FleetMaintenanceCalendar initialFleetId={FLEET_B} />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `/api/fleet/calendar?fleetId=${FLEET_B}`,
    );
  });

  it("loads service requests for the server-validated Fleet", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          canManage: true,
          summary: { open: 0, scheduled: 0, awaitingApproval: 0, completed: 0 },
          requests: [],
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<FleetServiceRequestsPage uiContext={uiContext} fleetId={FLEET_B} />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      fleetId: FLEET_B,
    });
  });

  it("loads billing for the server-validated Fleet", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          canApprove: true,
          canPay: true,
          decisionMode: "fleet_self_service",
          summary: {
            approvals: 0,
            invoices: 0,
            byCurrency: {
              CAD: { outstanding: 0, paid: 0 },
              USD: { outstanding: 0, paid: 0 },
            },
          },
          items: [],
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <FleetBillingWorkspace routePrefix="/portal/fleet" fleetId={FLEET_B} />,
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      action: "list",
      fleetId: FLEET_B,
    });
  });

  it("loads driver Home for the server-validated Fleet", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          fleetId: FLEET_B,
          fleetName: "Secondary Fleet",
          driverName: "Driver",
          assignments: [],
          issues: [],
          trailers: [],
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<FleetDriverDashboard fleetId={FLEET_B} />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `/api/fleet/driver/dashboard?fleetId=${FLEET_B}`,
    );
  });

  it("loads Drivers for the server-validated Fleet", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          fleets: [{ id: FLEET_B, name: "Secondary Fleet" }],
          vehicles: [],
          drivers: [],
          enrollments: [],
          assignments: [],
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <FleetDriversWorkspace
        actorLabel="Fleet Manager"
        initialFleetId={FLEET_B}
      />,
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      action: "context",
      fleetId: FLEET_B,
    });
  });

  it("keeps every missed pre-trip reachable in the queue", async () => {
    const missed = Array.from({ length: 7 }, (_, index) => ({
      id: `missed-${index}`,
      unitLabel: `Unit ${index}`,
      driverName: `Driver ${index}`,
      serviceDate: "2026-09-01",
      dueAt: "2026-09-01T12:00:00.000Z",
    }));
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          canManage: true,
          summary: {
            open: 0,
            acknowledged: 0,
            deferred: 0,
            converted: 0,
            missedPretrips: missed.length,
          },
          items: [],
          missed,
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<FleetDefectQueue fleetId={FLEET_B} />);

    await waitFor(() =>
      expect(screen.getAllByText("Missed daily pre-trip")).toHaveLength(7),
    );
  });
});

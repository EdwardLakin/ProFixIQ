import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import ShopFleetRequestInbox from "@/features/fleet/components/ShopFleetRequestInbox";

const routerPush = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPush }),
}));

const VEHICLE_ID = "10000000-0000-4000-8000-000000000001";
const REQUEST_ID = "20000000-0000-4000-8000-000000000002";

const requestsPayload = {
  canManage: true,
  summary: { open: 1, scheduled: 0, awaitingApproval: 0, completed: 0 },
  requests: [
    {
      id: REQUEST_ID,
      fleetId: "fleet-1",
      fleetName: "Acme Logistics",
      vehicleId: VEHICLE_ID,
      unitLabel: "Unit 12",
      vehicleDescription: "2018 Ford F-150",
      title: "Intermittent brake vibration",
      summary: "",
      severity: "medium",
      status: "approved",
      createdAt: "2026-08-23T00:00:00.000Z",
      requestedForDate: null,
      scheduledForDate: null,
      sourcePmDueEventId: null,
      workOrder: null,
      shopProgress: null,
    },
  ],
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

describe("resolving a Fleet unit's billing owner from the Shop inbox", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("lets Shop staff fix a stale billing owner inline and retry acceptance", async () => {
    let convertAttempts = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      const method = init?.method ?? "GET";

      if (url === "/api/fleet/service-requests" && method === "POST") {
        return jsonResponse(requestsPayload);
      }

      if (
        url === "/api/fleet/service-requests/convert-to-work-order" &&
        method === "POST"
      ) {
        convertAttempts += 1;
        if (convertAttempts === 1) {
          return jsonResponse(
            {
              error:
                "This unit's billing ownership must be reviewed before service can continue.",
              reason: "handoff_unavailable",
            },
            409,
          );
        }
        return jsonResponse({ workOrderId: "wo-1", status: "converted" });
      }

      if (
        url === `/api/fleet/vehicles/${VEHICLE_ID}/billing-owner` &&
        method === "GET"
      ) {
        return jsonResponse({
          alreadyAligned: false,
          applied: false,
          vehicleId: VEHICLE_ID,
          fleetId: "fleet-1",
          fleetName: "Acme Logistics",
          previousCustomerId: "customer-old",
          previousCustomerName: "Old Billing Co",
          resolvedCustomerId: "customer-new",
          resolvedCustomerName: "Acme Logistics",
        });
      }

      if (
        url === `/api/fleet/vehicles/${VEHICLE_ID}/billing-owner` &&
        method === "POST"
      ) {
        return jsonResponse({
          alreadyAligned: false,
          applied: true,
          vehicleId: VEHICLE_ID,
          fleetId: "fleet-1",
          fleetName: "Acme Logistics",
          previousCustomerId: "customer-old",
          previousCustomerName: "Old Billing Co",
          resolvedCustomerId: "customer-new",
          resolvedCustomerName: "Acme Logistics",
        });
      }

      throw new Error(`Unexpected fetch: ${method} ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<ShopFleetRequestInbox />);

    const acceptButton = await screen.findByRole("button", {
      name: "Accept into Shop",
    });
    fireEvent.click(acceptButton);

    expect(
      await screen.findByRole("button", { name: "Resolve billing owner" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "This unit's billing ownership must be reviewed before service can continue.",
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Resolve billing owner" }),
    );

    expect(await screen.findByText("Old Billing Co")).toBeInTheDocument();
    expect(screen.getAllByText("Acme Logistics").length).toBeGreaterThan(0);

    fireEvent.click(
      screen.getByRole("button", { name: "Reassign to Fleet billing account" }),
    );

    fireEvent.click(
      await screen.findByRole("button", { name: "Retry accepting request" }),
    );

    await waitFor(() =>
      expect(routerPush).toHaveBeenCalledWith("/work-orders/wo-1"),
    );
  });
});

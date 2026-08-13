// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import MobileTruckInventory from "@/features/parts/mobile/MobileTruckInventory";

type Snapshot = {
  serverNow: string;
  visit: {
    id: string;
    workOrderId: string | null;
    workOrderNumber: string | null;
    status: string;
    kind: "active" | "next";
  } | null;
  truck: {
    id: string;
    name: string;
    unitNumber: string | null;
    stockLocationId: string | null;
  } | null;
  items: Array<{
    partId: string;
    sku: string | null;
    partNumber: string | null;
    name: string;
    description: string | null;
    category: string | null;
    qtyOnHand: number;
    qtyReserved: number;
    qtyAvailable: number;
  }>;
  error?: string;
};

function mockFetch(body: Snapshot | { error: string }, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      json: vi.fn().mockResolvedValue(body),
    }),
  );
}

function assignedSnapshot(): Snapshot {
  return {
    serverNow: "2026-08-13T02:40:00.000Z",
    visit: {
      id: "visit-1",
      workOrderId: "wo-1",
      workOrderNumber: "EL00118",
      status: "working",
      kind: "active",
    },
    truck: {
      id: "truck-1",
      name: "Service Truck 3",
      unitNumber: "ST-03",
      stockLocationId: "location-3",
    },
    items: [
      {
        partId: "part-filter",
        sku: "FLT-100",
        partNumber: "LF14000NN",
        name: "Oil Filter",
        description: "Heavy-duty engine oil filter",
        category: "Filters",
        qtyOnHand: 4,
        qtyReserved: 1,
        qtyAvailable: 3,
      },
      {
        partId: "part-brake",
        sku: "BRK-200",
        partNumber: "4707Q",
        name: "Brake Shoe Kit",
        description: "16.5 inch brake shoe kit",
        category: "Brakes",
        qtyOnHand: 2,
        qtyReserved: 0,
        qtyAvailable: 2,
      },
    ],
  };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("MobileTruckInventory rendered behavior", () => {
  it("renders the assigned truck, work order and canonical quantity totals", async () => {
    mockFetch(assignedSnapshot());
    render(<MobileTruckInventory />);

    expect(await screen.findByText("Service Truck 3")).toBeInTheDocument();
    expect(screen.getByText(/ST-03 · EL00118/)).toBeInTheDocument();
    expect(screen.getByText("Oil Filter")).toBeInTheDocument();
    expect(screen.getByText("Brake Shoe Kit")).toBeInTheDocument();
    expect(screen.getByText("5", { selector: "div" })).toBeInTheDocument();
  });

  it("filters truck stock by part number as the technician types", async () => {
    mockFetch(assignedSnapshot());
    const user = userEvent.setup();
    render(<MobileTruckInventory />);

    await screen.findByText("Oil Filter");
    await user.type(screen.getByLabelText("Search truck stock"), "4707Q");

    expect(screen.queryByText("Oil Filter")).not.toBeInTheDocument();
    expect(screen.getByText("Brake Shoe Kit")).toBeInTheDocument();
  });

  it("shows an explicit no-assignment state instead of a false empty inventory", async () => {
    mockFetch({
      serverNow: "2026-08-13T02:40:00.000Z",
      visit: null,
      truck: null,
      items: [],
    });
    render(<MobileTruckInventory />);

    expect(await screen.findByText("No assigned service call")).toBeInTheDocument();
  });

  it("shows a missing stock-location warning when the visit has a truck without inventory scope", async () => {
    const snapshot = assignedSnapshot();
    snapshot.truck = { ...snapshot.truck!, stockLocationId: null };
    snapshot.items = [];
    mockFetch(snapshot);
    render(<MobileTruckInventory />);

    expect(
      await screen.findByText("No truck stock location assigned"),
    ).toBeInTheDocument();
  });

  it("shows the Field Service authorization message for non-operators", async () => {
    mockFetch(
      { error: "Truck inventory is available to assigned Field Service operators." },
      403,
    );
    render(<MobileTruckInventory />);

    expect(
      await screen.findByText(
        "Truck inventory is available to assigned Field Service operators.",
      ),
    ).toBeInTheDocument();
  });

  it("refreshes the same canonical endpoint on demand", async () => {
    mockFetch(assignedSnapshot());
    const user = userEvent.setup();
    render(<MobileTruckInventory />);

    await screen.findByText("Service Truck 3");
    await user.click(screen.getByRole("button", { name: "Refresh truck inventory" }));

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      "/api/mobile/service-visits/truck-inventory",
      expect.objectContaining({ credentials: "include", cache: "no-store" }),
    );
  });
});

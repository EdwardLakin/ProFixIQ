// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import TruckHistoryPanel from "@/features/mobile/service/TruckHistoryPanel";
import type { FieldTruckInventorySnapshot } from "@/features/mobile/service/truckInventoryContracts";

afterEach(cleanup);

function snapshot(): FieldTruckInventorySnapshot {
  return {
    generatedAt: "2026-08-18T15:00:00.000Z",
    actorProfileId: "manager",
    canManageParts: true,
    hasFieldAccess: true,
    visit: null,
    trucks: [],
    truck: null,
    workOrderLines: [],
    items: [],
    catalog: [],
    openReceipts: [],
    locations: [],
    recentUses: [],
    movements: [
      {
        id: "move-1",
        partId: "part-1",
        partName: "Wheel seal",
        partNumber: "WS-100",
        quantity: 2,
        direction: "in",
        reason: "transfer_in",
        createdAt: "2026-08-18T14:45:00.000Z",
        actorName: "Field Manager",
        sourceLocationName: "MAIN",
        destinationLocationName: "QA-01 Inventory",
        purchaseOrderNumber: null,
        workOrderNumber: null,
      },
    ],
  };
}

describe("Field truck inventory activity", () => {
  it("renders canonical movement context for the selected truck", () => {
    render(
      <TruckHistoryPanel
        snapshot={snapshot()}
        busy={false}
        handleReturn={vi.fn()}
      />,
    );

    expect(screen.getByText("Truck movement history")).toBeInTheDocument();
    expect(screen.getByText("Loaded onto truck")).toBeInTheDocument();
    expect(screen.getByText("Wheel seal")).toBeInTheDocument();
    expect(screen.getByText(/MAIN → QA-01 Inventory/)).toBeInTheDocument();
    expect(screen.getByText(/Field Manager/)).toBeInTheDocument();
  });
});

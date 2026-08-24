// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import MobileTruckInventoryScreen from "@/features/mobile/service/MobileTruckInventoryScreen";
import TruckHistoryPanel from "@/features/mobile/service/TruckHistoryPanel";
import type { FieldTruckInventorySnapshot } from "@/features/mobile/service/truckInventoryContracts";

afterEach(cleanup);

function snapshot(): FieldTruckInventorySnapshot {
  return {
    generatedAt: "2026-08-18T15:00:00.000Z",
    actorProfileId: "manager",
    canManageParts: true,
    canConfigure: true,
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

function unconfiguredSnapshot(input: {
  canConfigure?: boolean;
  canManageParts?: boolean;
} = {}): FieldTruckInventorySnapshot {
  const value = snapshot();
  value.canConfigure = input.canConfigure ?? true;
  value.canManageParts = input.canManageParts ?? true;
  value.truck = {
    id: "truck-1",
    name: "Service Truck",
    unitNumber: "FT-01",
    stockLocationId: null,
    primaryUserId: "manager",
    active: true,
  };
  value.trucks = [value.truck];
  return value;
}

function renderTruckInventory(value: FieldTruckInventorySnapshot) {
  return render(
    <MobileTruckInventoryScreen
      snapshot={value}
      online
      view="stock"
      setView={vi.fn()}
      loading={false}
      busy={false}
      error={null}
      query=""
      setQuery={vi.fn()}
      load={vi.fn().mockResolvedValue(undefined)}
      selectedTruckId="truck-1"
      onTruckChange={vi.fn()}
      selectedPartId={null}
      setSelectedPartId={vi.fn()}
      selectedLineId=""
      setSelectedLineId={vi.fn()}
      quantity={1}
      setQuantity={vi.fn()}
      identityDraft={null}
      setIdentityDraft={vi.fn()}
      createIdentity={vi.fn().mockResolvedValue(undefined)}
      sourceLocationId=""
      setSourceLocationId={vi.fn()}
      sourceOptions={[]}
      selectedReceiptId=""
      setSelectedReceiptId={vi.fn()}
      selectedReceipt={null}
      truckItemById={new Map()}
      handleUse={vi.fn().mockResolvedValue(undefined)}
      handleReturn={vi.fn().mockResolvedValue(undefined)}
      resolveCode={vi.fn().mockResolvedValue(undefined)}
      transferToTruck={vi.fn().mockResolvedValue(undefined)}
      receiveToTruck={vi.fn().mockResolvedValue(undefined)}
    />,
  );
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

  it("shows the recoverable setup state when the assigned truck has no inventory location", () => {
    const unconfigured = unconfiguredSnapshot();

    renderTruckInventory(unconfigured);

    expect(
      screen.getByRole("heading", { name: "Truck inventory isn't enabled" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Open Field setup" }),
    ).toHaveAttribute("href", "/mobile/service/setup");
    expect(
      screen.queryByRole("navigation", { name: "Truck inventory views" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("This truck has no inventory yet."),
    ).not.toBeInTheDocument();
  });

  it("does not offer setup to a parts manager without configuration access", () => {
    const unconfigured = unconfiguredSnapshot({
      canConfigure: false,
      canManageParts: true,
    });

    renderTruckInventory(unconfigured);

    expect(
      screen.queryByRole("link", { name: "Open Field setup" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(
        /Ask a Field owner or administrator to enable truck inventory/,
      ),
    ).toBeInTheDocument();
  });
});

import React from "react";
(globalThis as unknown as { React: typeof React }).React = React;
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PartsRequestWorkbench } from "./PartsRequestWorkbench";
import { mapRequestToWorkbenchModel } from "./mapToWorkbenchModel";
import type { PartsRequestWorkbenchModel } from "./types";

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
  },
}));

function model(partId: string | null = "part-1"): PartsRequestWorkbenchModel {
  return {
    requestId: "request-1",
    requestLabel: "Request 1",
    supplierOptions: [],
    poOptions: [],
    locationOptions: [],
    inventoryResults: [
      { value: "part-1", label: "Fleetguard oil filter", partNumber: "FG-100", onHandQty: 0 },
      { value: "part-2", label: "ACDelco Oil Filter", partNumber: "OIL-FILTER-5", manufacturer: "ACDelco", onHandQty: 79 },
    ],
    items: [
      {
        id: "item-1",
        description: "Oil filter",
        requestedPartNumber: null,
        requestedManufacturer: null,
        qty: 1,
        sellPrice: 25,
        status: "requested",
        partId,
        insights: partId
          ? []
          : [],
      },
    ],
  };
}

describe("PartsRequestWorkbench inventory attach flow", () => {
  it("uses Attach Part as the primary unattached action and does not show no-stock or permanent suggestion warnings", () => {
    render(<PartsRequestWorkbench model={model(null)} />);

    expect(screen.getByRole("button", { name: "Attach Part" })).toBeInTheDocument();
    expect(screen.queryByText("Use Inventory")).not.toBeInTheDocument();
    expect(screen.queryByText("No stock")).not.toBeInTheDocument();
    expect(screen.queryByText("Suggested match")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add to Job" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Receive" })).not.toBeInTheDocument();
  });

  it("attaches a generic oil-filter request without contaminating requested intent", async () => {
    const user = userEvent.setup();
    const onAttachInventory = vi.fn();

    render(<PartsRequestWorkbench model={model(null)} onAttachInventory={onAttachInventory} />);

    await user.click(screen.getByRole("button", { name: "Attach Part" }));
    await user.click(screen.getByLabelText(/ACDelco Oil Filter/i));
    await user.click(screen.getAllByRole("button", { name: "Attach Part" }).at(-1)!);

    await waitFor(() => expect(onAttachInventory).toHaveBeenCalledWith({
      itemId: "item-1",
      partId: "part-2",
      warningAccepted: false,
    }));

    expect(screen.getByDisplayValue("Oil filter")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Part #")).toHaveValue("");
    expect(screen.getByText("Attached: ACDelco Oil Filter")).toBeInTheDocument();
    expect(screen.getByText("79 on hand")).toBeInTheDocument();
    expect(screen.queryByText("Possible mismatch")).not.toBeInTheDocument();
  });

  it("shows exact selected part metadata in mismatch confirmation", async () => {
    const user = userEvent.setup();
    const conflictModel = model("part-2");
    conflictModel.items[0] = {
      ...conflictModel.items[0],
      requestedPartNumber: "BRAKE-123",
      insights: [{ id: "mismatch", kind: "possible_mismatch", label: "Possible mismatch" }],
    };

    render(<PartsRequestWorkbench model={conflictModel} />);

    await user.click(screen.getByRole("button", { name: "Attach anyway" }));

    const dialog = screen.getByText("Confirm possible mismatch").closest("div")?.parentElement;
    expect(dialog).toBeTruthy();
    expect(screen.queryByText("Unknown selected part")).not.toBeInTheDocument();
    expect(screen.getByText("ACDelco Oil Filter")).toBeInTheDocument();
    expect(screen.getByText("Part #: OIL-FILTER-5")).toBeInTheDocument();
  });

  it("maps no-stock insight only for an attached exact part", () => {
    const unattached = mapRequestToWorkbenchModel({
      request: { id: "request-1" },
      items: [{ id: "item-1", description: "Oil filter", qty: 1 }],
      stockSuggestionCountByItemId: { "item-1": 1 },
      availableStockByItemId: { "item-1": 0 },
    });
    expect(unattached.items[0]?.insights?.some((insight) => insight.kind === "no_stock")).toBe(false);
    expect(unattached.items[0]?.insights?.some((insight) => insight.kind === "suggested_match")).toBe(false);

    const attached = mapRequestToWorkbenchModel({
      request: { id: "request-1" },
      items: [{ id: "item-1", description: "Oil filter", qty: 1, part_id: "part-1" }],
      availableStockByItemId: { "item-1": 0 },
    });
    expect(attached.items[0]?.insights?.some((insight) => insight.kind === "no_stock")).toBe(true);
  });
});

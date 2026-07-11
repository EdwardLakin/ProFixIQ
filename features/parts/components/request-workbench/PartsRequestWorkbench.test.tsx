import React from "react";
(globalThis as unknown as { React: typeof React }).React = React;
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PartsRequestWorkbench } from "./PartsRequestWorkbench";
import type { PartsRequestWorkbenchModel } from "./types";

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
  },
}));

function model(partId = "part-1"): PartsRequestWorkbenchModel {
  return {
    requestId: "request-1",
    requestLabel: "Request 1",
    supplierOptions: [],
    poOptions: [],
    locationOptions: [],
    inventoryResults: [
      { value: "part-1", label: "Fleetguard oil filter", partNumber: "FG-100" },
      { value: "part-2", label: "Baldwin air filter", partNumber: "BA-200" },
    ],
    items: [
      {
        id: "item-1",
        description: "Requested brake pad",
        requestedPartNumber: "REQ-123",
        qty: 1,
        sellPrice: 25,
        status: "requested",
        partId,
        insights: [
          {
            id: "mismatch-item-1",
            kind: "possible_mismatch",
            label: "Possible mismatch",
            detail: "Requested brake pad does not look like the selected oil filter.",
          },
        ],
      },
    ],
  };
}

describe("PartsRequestWorkbench mismatch override flow", () => {
  it("blocks the first Add attempt, confirms the mismatch override, and resets when the selected part changes", async () => {
    const user = userEvent.setup();
    let conflictConfirmed = false;
    const onAddToJob = vi.fn((item) => {
      if (!conflictConfirmed) return;
      return item;
    });
    const onConfirmConflict = vi.fn((itemId: string) => {
      if (itemId === "item-1") conflictConfirmed = true;
    });
    const onResetConflictOverride = vi.fn((itemId: string) => {
      if (itemId === "item-1") conflictConfirmed = false;
    });
    const onAttachInventory = vi.fn();

    render(
      <PartsRequestWorkbench
        model={model()}
        onAddToJob={onAddToJob}
        onConfirmConflict={onConfirmConflict}
        onResetConflictOverride={onResetConflictOverride}
        onAttachInventory={onAttachInventory}
      />,
    );

    expect(screen.getByText("Possible mismatch")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Add to Job" }));
    expect(onAddToJob).toHaveBeenCalledTimes(1);
    expect(conflictConfirmed).toBe(false);

    await user.click(screen.getByRole("button", { name: "Confirm match" }));
    expect(screen.getByText("Requested brake pad")).toBeInTheDocument();
    expect(screen.getByText("Fleetguard oil filter")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Use selected part anyway" }));
    expect(onConfirmConflict).toHaveBeenCalledWith("item-1");
    expect(conflictConfirmed).toBe(true);

    await user.click(screen.getByRole("button", { name: "Add to Job" }));
    expect(onAddToJob).toHaveBeenCalledTimes(2);
    expect(onAddToJob).toHaveLastReturnedWith(expect.objectContaining({ id: "item-1" }));

    await user.click(screen.getByRole("button", { name: "Use Inventory" }));
    await user.click(screen.getByLabelText(/Baldwin air filter/i));
    await user.click(screen.getByRole("button", { name: "Attach inventory part" }));

    await waitFor(() => expect(onAttachInventory).toHaveBeenCalledWith({
      itemId: "item-1",
      partId: "part-2",
      warningAccepted: false,
    }));
    expect(onResetConflictOverride).toHaveBeenCalledWith("item-1");
    expect(conflictConfirmed).toBe(false);
  });
});

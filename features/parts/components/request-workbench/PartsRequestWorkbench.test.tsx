import React from "react";
(globalThis as unknown as { React: typeof React }).React = React;
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PartsRequestWorkbench } from "./PartsRequestWorkbench";
import { toast } from "sonner";
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
  beforeEach(() => {
    vi.clearAllMocks();
  });
  it("uses Attach Part as the primary unattached action and does not show no-stock or permanent suggestion warnings", () => {
    render(<PartsRequestWorkbench model={model(null)} />);

    expect(screen.getByRole("button", { name: "Attach Part" })).toBeInTheDocument();
    expect(screen.queryByText("Use Inventory")).not.toBeInTheDocument();
    expect(screen.queryByText("No stock")).not.toBeInTheDocument();
    expect(screen.queryByText("Suggested match")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add to Work Order" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Receive" })).not.toBeInTheDocument();
  });

  it("attaches a generic oil-filter request without contaminating requested intent", async () => {
    const user = userEvent.setup();
    const onAttachInventory = vi.fn();

    render(<PartsRequestWorkbench model={model(null)} onAttachInventory={onAttachInventory} />);

    await user.click(screen.getByRole("button", { name: "Attach Part" }));
    await user.click(screen.getByLabelText(/ACDelco Oil Filter/i));
    await user.click(screen.getByRole("button", { name: "Attach Selected Part" }));

    await waitFor(() => expect(onAttachInventory).toHaveBeenCalledWith({
      itemId: "item-1",
      partId: "part-2",
      warningAccepted: false,
    }));

    expect(screen.getByDisplayValue("Oil filter")).toBeInTheDocument();
    expect(screen.getByText("OIL-FILTER-5")).toBeInTheDocument();
    expect(screen.getByText("ACDelco")).toBeInTheDocument();
    expect(screen.getByText("Selected: ACDelco Oil Filter")).toBeInTheDocument();
    expect(screen.getByText("79 on hand")).toBeInTheDocument();
    expect(screen.queryByText("Possible mismatch")).not.toBeInTheDocument();
  });


  it("separates inventory selection from the request-level package save", async () => {
    const user = userEvent.setup();
    const onAttachInventory = vi.fn(async () => ({ partId: "part-2", addedToWorkOrder: false }));
    const onCommitPackage = vi.fn();

    render(<PartsRequestWorkbench model={model(null)} onAttachInventory={onAttachInventory} onCommitPackage={onCommitPackage} />);

    await user.click(screen.getByRole("button", { name: "Attach Part" }));
    await user.click(screen.getByLabelText(/ACDelco Oil Filter/i));
    await user.click(screen.getByRole("button", { name: "Attach Selected Part" }));

    await waitFor(() => expect(onAttachInventory).toHaveBeenCalledTimes(1));
    expect(onCommitPackage).not.toHaveBeenCalled();
    expect(screen.getByText("Selected: ACDelco Oil Filter")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add to Work Order" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Change Part" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Save Parts Package to Work Order" }));
    expect(onCommitPackage).toHaveBeenCalledTimes(1);
  });

  it("hides Add to Work Order after the durable add state is loaded", () => {
    const attachedModel = model("part-2");
    attachedModel.items[0] = { ...attachedModel.items[0], addedToWorkOrder: true };

    render(<PartsRequestWorkbench model={attachedModel} />);

    expect(screen.getByText("Saved to work order")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add to Work Order" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Change Part" })).not.toBeInTheDocument();
  });

  it("does not perform Add to Work Order when mismatch acknowledgement is confirmed", async () => {
    const user = userEvent.setup();
    const onConfirmConflict = vi.fn();
    const onCommitPackage = vi.fn();
    const conflictModel = model("part-2");
    conflictModel.items[0] = {
      ...conflictModel.items[0],
      requestedPartNumber: "BRAKE-123",
      insights: [{ id: "mismatch", kind: "possible_mismatch", label: "Possible mismatch" }],
    };

    render(<PartsRequestWorkbench model={conflictModel} onConfirmConflict={onConfirmConflict} onCommitPackage={onCommitPackage} />);

    await user.click(screen.getByRole("button", { name: "Attach anyway" }));
    await user.click(screen.getAllByRole("button", { name: "Attach anyway" }).at(-1)!);

    expect(onConfirmConflict).toHaveBeenCalledWith("item-1");
    expect(onCommitPackage).not.toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith("Mismatch acknowledged. You can add the selected part now.");
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

describe("PartsRequestWorkbench inventory picker mobile layout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses a viewport-constrained dialog with sticky header/footer and an independently scrolling results body", async () => {
    const user = userEvent.setup();
    render(<PartsRequestWorkbench model={model(null)} />);

    await user.click(screen.getByRole("button", { name: "Attach Part" }));

    const dialog = screen.getByRole("dialog", { name: /Attach Part — Oil filter/i });
    expect(dialog).toHaveClass("max-h-[calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-1rem)]");
    expect(dialog).toHaveClass("flex-col");
    expect(dialog).toHaveClass("overflow-hidden");
    expect(screen.getByRole("heading", { name: /Attach Part — Oil filter/i }).parentElement?.parentElement?.parentElement).toHaveClass("shrink-0");
    expect(screen.getByTestId("inventory-picker-results-body")).toHaveClass("flex-1", "overflow-y-auto", "overscroll-contain");
    expect(screen.getByRole("button", { name: "Attach Selected Part" }).closest("div")?.parentElement).toHaveClass("shrink-0");
    expect(screen.getByRole("button", { name: "Attach Selected Part" })).toBeVisible();
    expect(document.body.style.overflow).toBe("hidden");
  });

  it("keeps the search visible, focused, and caps the displayed result count deterministically", async () => {
    const user = userEvent.setup();
    const denseModel = model(null);
    denseModel.inventoryResults = Array.from({ length: 75 }, (_, index) => ({
      value: `part-${index}`,
      label: `Inventory part ${String(index).padStart(2, "0")}`,
      sku: `SKU-${index}`,
      partNumber: `PN-${index}`,
      manufacturer: index % 2 === 0 ? "Fleetguard" : "ACDelco",
      onHandQty: index,
    }));

    render(<PartsRequestWorkbench model={denseModel} />);
    await user.click(screen.getByRole("button", { name: "Attach Part" }));

    await waitFor(() => expect(screen.getByRole("textbox", { name: "Search inventory" })).toHaveFocus());
    expect(screen.getByText("Showing 50 of 75 results. Refine search to narrow matches.")).toBeInTheDocument();
    expect(screen.getAllByRole("radio")).toHaveLength(50);

    await user.type(screen.getByRole("textbox", { name: "Search inventory" }), "SKU-74");
    expect(screen.getByText("1 result")).toBeInTheDocument();
    expect(screen.getByLabelText(/Inventory part 74/i)).toBeInTheDocument();
  });

  it("disables confirm until row selection, selects by row click, and submits the selected part once", async () => {
    const user = userEvent.setup();
    const onAttachInventory = vi.fn(async () => ({ partId: "part-2", addedToWorkOrder: false }));

    render(<PartsRequestWorkbench model={model(null)} onAttachInventory={onAttachInventory} />);
    await user.click(screen.getByRole("button", { name: "Attach Part" }));

    const confirm = screen.getByRole("button", { name: "Attach Selected Part" });
    expect(confirm).toBeDisabled();
    await user.click(screen.getByText("ACDelco Oil Filter"));
    expect(screen.getByLabelText(/ACDelco Oil Filter/i)).toBeChecked();
    expect(confirm).toBeEnabled();

    await Promise.all([user.click(confirm), user.click(confirm)]);

    await waitFor(() => expect(onAttachInventory).toHaveBeenCalledTimes(1));
    expect(onAttachInventory).toHaveBeenCalledWith({ itemId: "item-1", partId: "part-2", warningAccepted: false });
  });

  it("keeps the modal open on failure and closes it on success without emitting extra notifications", async () => {
    const user = userEvent.setup();
    const onAttachInventory = vi
      .fn()
      .mockRejectedValueOnce(new Error("Attach failed"))
      .mockResolvedValueOnce({ partId: "part-2", addedToWorkOrder: false });

    render(<PartsRequestWorkbench model={model(null)} onAttachInventory={onAttachInventory} />);
    await user.click(screen.getByRole("button", { name: "Attach Part" }));
    await user.click(screen.getByText("ACDelco Oil Filter"));
    await user.click(screen.getByRole("button", { name: "Attach Selected Part" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Attach failed");
    expect(screen.getByRole("dialog", { name: /Attach Part — Oil filter/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/ACDelco Oil Filter/i)).toBeChecked();
    expect(screen.getByRole("button", { name: "Attach Selected Part" })).toBeEnabled();
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Attach Selected Part" }));

    await waitFor(() => expect(screen.queryByRole("dialog", { name: /Attach Part — Oil filter/i })).not.toBeInTheDocument());
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });
});

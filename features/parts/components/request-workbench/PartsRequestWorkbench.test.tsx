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

  it("hides Add to Work Order after the durable add state is loaded, but keeps Change Part available", () => {
    const attachedModel = model("part-2");
    attachedModel.items[0] = { ...attachedModel.items[0], addedToWorkOrder: true };

    render(<PartsRequestWorkbench model={attachedModel} />);

    expect(screen.getByText("Saved to work order")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add to Work Order" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Change Part" })).toBeInTheDocument();
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

  it("selects multiple parts and prepares one supplier quote request", async () => {
    const user = userEvent.setup();
    const twoItemModel = model("part-1");
    twoItemModel.defaultSupplierId = "supplier-1";
    twoItemModel.supplierOptions = [
      { value: "supplier-1", label: "AutoValue Local" },
    ];
    twoItemModel.items = [
      {
        ...twoItemModel.items[0],
        id: "item-oil",
        description: "5W30 oil",
        qty: 6,
        poId: null,
      },
      {
        ...twoItemModel.items[0],
        id: "item-filter",
        description: "Oil filter",
        qty: 1,
        poId: null,
      },
    ];
    const onRequestSupplierQuote = vi.fn(async () => ({
      quoteRequestId: "quote-request-1",
      workOrderNumber: "EL00118",
      launchUrl: null,
      supplier: {
        id: "supplier-1",
        name: "AutoValue Local",
        email: "parts@autovalue.test",
        phone: null,
      },
      draft: {
        subject: "Quote request - EL00118",
        message: "Please quote these parts.",
      },
    }));

    render(
      <PartsRequestWorkbench
        model={twoItemModel}
        onRequestSupplierQuote={onRequestSupplierQuote}
      />,
    );

    await user.click(screen.getByRole("checkbox", { name: "Select all parts" }));
    await user.click(
      screen.getByRole("button", { name: "Request Supplier Quote (2)" }),
    );

    expect(screen.getByRole("dialog", { name: /Request quote for 2 items/i })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Supplier" })).toHaveValue("supplier-1");
    await user.click(screen.getByRole("button", { name: "Prepare quote email" }));

    await waitFor(() =>
      expect(onRequestSupplierQuote).toHaveBeenCalledWith(
        expect.objectContaining({
          supplierId: "supplier-1",
          itemIds: ["item-oil", "item-filter"],
          channel: "email",
          idempotencyKey: expect.any(String),
        }),
      ),
    );
    expect(screen.queryByRole("button", { name: "Create PO" })).not.toBeInTheDocument();
    expect(toast.success).toHaveBeenCalledWith(
      "Quote email prepared for AutoValue Local.",
    );
  });

  it("records one supplier response for the full quote batch", async () => {
    const user = userEvent.setup();
    const quoteModel = model(null);
    quoteModel.items[0] = {
      ...quoteModel.items[0],
      supplierId: "supplier-1",
      supplierQuoteStatus: "requested",
      latestSupplierQuoteRequestId: "quote-request-1",
      unitCost: null,
      sellPrice: null,
    };
    quoteModel.supplierQuoteRequests = [
      {
        id: "quote-request-1",
        supplierId: "supplier-1",
        supplierName: "AutoValue Local",
        status: "requested",
        itemIds: ["item-1"],
      },
    ];
    const onRecordSupplierQuote = vi.fn(async () => ({
      quoteRequestId: "quote-request-1",
      status: "received",
    }));

    render(
      <PartsRequestWorkbench
        model={quoteModel}
        onRecordSupplierQuote={onRecordSupplierQuote}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Record Supplier Quote" }),
    );
    await user.type(
      screen.getByLabelText("Oil filter supplier unit cost"),
      "12.50",
    );
    await user.type(
      screen.getByLabelText("Oil filter customer sell price"),
      "24.95",
    );
    await user.click(
      screen.getByRole("button", { name: "Record supplier quote" }),
    );

    await waitFor(() =>
      expect(onRecordSupplierQuote).toHaveBeenCalledWith(
        expect.objectContaining({
          quoteRequestId: "quote-request-1",
          idempotencyKey: expect.any(String),
          items: [
            expect.objectContaining({
              partRequestItemId: "item-1",
              quotedUnitCost: 12.5,
              quotedSellPrice: 24.95,
              status: "quoted",
            }),
          ],
        }),
      ),
    );
    expect(toast.success).toHaveBeenCalledWith(
      "Supplier quote recorded for AutoValue Local.",
    );
  });

  it("prompts the user to contact the supplier when an approved draft PO is ready", async () => {
    const user = userEvent.setup();
    const approvedModel = model(null);
    approvedModel.items[0] = {
      ...approvedModel.items[0],
      status: "ordered",
      poId: "po-1",
      supplierQuoteStatus: "received",
    };
    approvedModel.draftPurchaseOrders = [
      {
        id: "po-1",
        poNumber: "PO-1234ABCD",
        status: "draft",
        supplierId: "supplier-1",
        supplierName: "AutoValue Local",
        supplierEmail: "parts@autovalue.test",
        supplierPhone: "7805550101",
      },
    ];
    const onContactPurchaseOrder = vi.fn(async () => ({
      poId: "po-1",
      launchUrl: null,
      supplierName: "AutoValue Local",
    }));

    render(
      <PartsRequestWorkbench
        model={approvedModel}
        onContactPurchaseOrder={onContactPurchaseOrder}
      />,
    );

    expect(screen.getByText(/Customer approved. Draft PO ready/i)).toBeInTheDocument();
    expect(screen.getByText("PO PO-1234ABCD")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Email PO" }));

    await waitFor(() =>
      expect(onContactPurchaseOrder).toHaveBeenCalledWith({
        poId: "po-1",
        channel: "email",
        idempotencyKey: expect.any(String),
      }),
    );
  });

  it("submits an existing PO without requiring or forwarding a redundant supplier", async () => {
    const user = userEvent.setup();
    const existingPoModel = model("part-1");
    existingPoModel.defaultSupplierId = "";
    existingPoModel.supplierOptions = [
      { value: "supplier-other", label: "Different Supplier" },
    ];
    existingPoModel.poOptions = [
      {
        value: "po-existing",
        label: "PO existing • Canonical Supplier • open",
      },
    ];
    existingPoModel.items[0] = {
      ...existingPoModel.items[0],
      status: "approved",
    };
    const onSubmitOrder = vi.fn();

    render(
      <PartsRequestWorkbench
        model={existingPoModel}
        onSubmitOrder={onSubmitOrder}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Order" }));
    await user.selectOptions(
      screen.getByRole("combobox", { name: "PO option" }),
      "existing",
    );
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Existing PO" }),
      "po-existing",
    );
    await user.click(screen.getByRole("button", { name: "Create/reuse PO" }));

    expect(onSubmitOrder).toHaveBeenCalledWith(
      "item-1",
      expect.objectContaining({
        poMode: "existing",
        existingPoId: "po-existing",
        supplierId: "",
      }),
    );
    expect(toast.error).not.toHaveBeenCalledWith("Select a supplier.");
  });

  it("searches inventory inline from the Description field and links the chosen match", async () => {
    const user = userEvent.setup();
    const onAttachInventory = vi.fn(async () => ({ partId: "part-2", addedToWorkOrder: false }));

    render(<PartsRequestWorkbench model={model(null)} onAttachInventory={onAttachInventory} />);

    const descriptionField = screen.getByRole("combobox", {
      name: /Description for Oil filter/i,
    });
    await user.clear(descriptionField);
    await user.type(descriptionField, "ACDelco");

    const suggestion = await screen.findByRole("option", { name: /ACDelco Oil Filter/i });
    await user.click(suggestion);

    await waitFor(() =>
      expect(onAttachInventory).toHaveBeenCalledWith({
        itemId: "item-1",
        partId: "part-2",
        warningAccepted: undefined,
      }),
    );
    expect(screen.getByText("Selected: ACDelco Oil Filter")).toBeInTheDocument();
  });

  it("searches inventory inline from the Part # field and does not auto-substitute on typing alone", async () => {
    const user = userEvent.setup();
    const onAttachInventory = vi.fn();

    render(<PartsRequestWorkbench model={model(null)} onAttachInventory={onAttachInventory} />);

    const partNumberField = screen.getByRole("combobox", {
      name: /Part number for Oil filter/i,
    });
    await user.type(partNumberField, "OIL-FILTER-5");

    expect(await screen.findByRole("option", { name: /ACDelco Oil Filter/i })).toBeInTheDocument();
    // Typing alone must never attach a part — only an explicit pick does.
    expect(onAttachInventory).not.toHaveBeenCalled();
    expect(partNumberField).toHaveValue("OIL-FILTER-5");
  });

  it("still requires a supplier when creating a new PO", async () => {
    const user = userEvent.setup();
    const onSubmitOrder = vi.fn();
    const approvedModel = model("part-1");
    approvedModel.items[0] = {
      ...approvedModel.items[0],
      status: "approved",
    };

    render(
      <PartsRequestWorkbench
        model={approvedModel}
        onSubmitOrder={onSubmitOrder}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Order" }));
    await user.click(screen.getByRole("button", { name: "Create/reuse PO" }));

    expect(toast.error).toHaveBeenCalledWith("Select a supplier.");
    expect(onSubmitOrder).not.toHaveBeenCalled();
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
    expect(dialog).toHaveClass("inset-x-2", "bottom-2", "top-2", "min-h-0");
    expect(dialog.parentElement).toBe(document.body);
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

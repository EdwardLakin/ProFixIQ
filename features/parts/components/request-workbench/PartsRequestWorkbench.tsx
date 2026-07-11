"use client";

import React from "react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PartsRequestWorkbenchHeader } from "./PartsRequestWorkbenchHeader";
import { PartsRequestWorkbenchSummary } from "./PartsRequestWorkbenchSummary";
import { PartsRequestWorkbenchTable } from "./PartsRequestWorkbenchTable";
import { InventoryPickerModal } from "./InventoryPickerModal";
import { CreateInventoryItemModal } from "./CreateInventoryItemModal";
import { OrderPartModal } from "./OrderPartModal";
import { ReceivePartModal } from "./ReceivePartModal";
import type { CreateInventoryItemInput } from "./CreateInventoryItemModal";
import type { OrderPartInput } from "./OrderPartModal";
import { createInventoryDraftFromItem, createOrderDraftFromItem } from "./createWorkbenchDrafts";
import type { AttachInventoryInput, PartsRequestInventoryResult, PartsRequestWorkbenchItem, PartsRequestWorkbenchModel, SaveItemInput } from "./types";

type ActiveModal =
  | { type: "inventory"; itemId: string }
  | { type: "stock"; itemId: string }
  | { type: "order"; itemId: string }
  | { type: "receive"; itemId: string }
  | { type: "confirmConflict"; itemId: string }
  | null;

export function PartsRequestWorkbench({
  model,
  onSaveItem,
  onUseInventory,
  onAttachInventory,
  onOrderItem,
  onAddToJob,
  onSubmitOrder,
  onReceiveItem,
  onOpenReceiveDrawer,
  onAddToStock,
  onCreateInventoryItem,
  onClearMatch,
  onConfirmConflict,
  onResetConflictOverride,
  onDeleteItem,
}: {
  model: PartsRequestWorkbenchModel;
  onSaveItem?: (input: SaveItemInput) => Promise<void> | void;
  onUseInventory?: (itemId: string) => Promise<void> | void;
  onAttachInventory?: (input: AttachInventoryInput) => Promise<void> | void;
  onOrderItem?: (itemId: string) => Promise<void> | void;
  onAddToJob?: (item: PartsRequestWorkbenchItem) => Promise<void> | void;
  onSubmitOrder?: (itemId: string, input: OrderPartInput) => Promise<void> | void;
  onReceiveItem?: (itemId: string) => Promise<void> | void;
  onOpenReceiveDrawer?: (itemId: string) => Promise<void> | void;
  onAddToStock?: (itemId: string) => Promise<void> | void;
  onCreateInventoryItem?: (itemId: string, input: CreateInventoryItemInput) => Promise<void> | void;
  onClearMatch?: (itemId: string) => Promise<void> | void;
  onConfirmConflict?: (itemId: string) => Promise<void> | void;
  onResetConflictOverride?: (itemId: string) => Promise<void> | void;
  onDeleteItem?: (itemId: string) => Promise<void> | void;
}): JSX.Element {
  const [items, setItems] = useState<PartsRequestWorkbenchItem[]>(model.items);
  const [defaultSupplierId, setDefaultSupplierId] = useState(model.defaultSupplierId ?? "");
  const [activeModal, setActiveModal] = useState<ActiveModal>(null);
  const [inventoryQuery, setInventoryQuery] = useState("");
  const [selectedInventoryPartId, setSelectedInventoryPartId] = useState<string>("");
  const [createInventoryDraft, setCreateInventoryDraft] = useState<CreateInventoryItemInput>({
    name: "",
    partNumber: "",
    manufacturer: "",
    sku: "",
    category: "",
    cost: "",
    sellPrice: "",
    defaultSupplierId: "",
    initialQty: "",
  });
  const [orderDraft, setOrderDraft] = useState<OrderPartInput>({
    supplierId: defaultSupplierId,
    poMode: "existing",
    existingPoId: "",
    qty: "1",
    unitCost: "",
    expectedDate: "",
  });

  const activeItem = activeModal
    ? items.find((item) => item.id === activeModal.itemId) ?? null
    : null;

  const inventoryResults = model.inventoryResults ?? [];
  const conflictConfirmItem = activeModal?.type === "confirmConflict" ? activeItem : null;
  const conflictConfirmPart = conflictConfirmItem?.partId
    ? inventoryResults.find((part) => part.value === conflictConfirmItem.partId) ?? null
    : null;

  useEffect(() => {
    setItems(model.items);
  }, [model.items]);

  function positiveNumber(value: string, label: string): number | null {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      toast.error(`${label} must be greater than zero.`);
      return null;
    }
    return parsed;
  }

  function nonNegativeNumber(value: string, label: string): number | null {
    if (value.trim() === "") return null;
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) {
      toast.error(`${label} must be zero or greater.`);
      return null;
    }
    return parsed;
  }

  async function saveItem(itemId: string): Promise<void> {
    const item = items.find((candidate) => candidate.id === itemId);
    if (!item) return;

    const description = item.description.trim();
    if (!description) {
      toast.error("Description is required.");
      return;
    }

    if (!Number.isFinite(item.qty) || item.qty <= 0) {
      toast.error("Qty must be greater than zero.");
      return;
    }

    if (item.sellPrice != null && (!Number.isFinite(item.sellPrice) || item.sellPrice < 0)) {
      toast.error("Sell price must be zero or greater.");
      return;
    }

    await onSaveItem?.({
      itemId: item.id,
      description,
      requestedPartNumber: item.requestedPartNumber?.trim() || null,
      requestedManufacturer: item.requestedManufacturer?.trim() || null,
      qty: item.qty,
      sellPrice: item.sellPrice,
    });
  }

  return (
    <div className="space-y-4 p-4 text-white">
      <PartsRequestWorkbenchHeader
        requestLabel={model.requestLabel}
        status={model.status}
        workOrderId={model.workOrderId}
        workOrderCustomId={model.workOrderCustomId}
        jobContext={model.jobContext}
        createdBy={model.createdBy}
        createdAt={model.createdAt}
        defaultSupplierId={defaultSupplierId}
        supplierOptions={model.supplierOptions}
        onDefaultSupplierChange={setDefaultSupplierId}
        onCreatePo={() => {
          const firstItem = items[0];
          if (firstItem) setActiveModal({ type: "order", itemId: firstItem.id });
        }}
      />

      <PartsRequestWorkbenchSummary items={items} />

      <PartsRequestWorkbenchTable
        items={items}
        inventoryResults={inventoryResults}
        onItemsChange={setItems}
        onSave={saveItem}
        onUseInventory={async (itemId) => {
          setActiveModal({ type: "inventory", itemId });
          await onUseInventory?.(itemId);
        }}
        onAddToJob={onAddToJob}
        onConfirmConflict={(itemId) => setActiveModal({ type: "confirmConflict", itemId })}
        onResetConflictOverride={onResetConflictOverride}
        onOrder={async (itemId) => {
          const item = items.find((candidate) => candidate.id === itemId) ?? null;
          setOrderDraft(createOrderDraftFromItem(item, defaultSupplierId));
          setActiveModal({ type: "order", itemId });
          await onOrderItem?.(itemId);
        }}
        onReceive={async (itemId) => {
          setActiveModal({ type: "receive", itemId });
          await onReceiveItem?.(itemId);
        }}
        onAddToStock={async (itemId) => {
          const item = items.find((candidate) => candidate.id === itemId) ?? null;
          setCreateInventoryDraft(createInventoryDraftFromItem(item, defaultSupplierId));
          setActiveModal({ type: "stock", itemId });
          await onAddToStock?.(itemId);
        }}
        onClearMatch={async (itemId) => {
          await onResetConflictOverride?.(itemId);
          await onClearMatch?.(itemId);
        }}
        onDelete={onDeleteItem}
      />

      <ConfirmConflictDialog
        item={conflictConfirmItem}
        selectedPart={conflictConfirmPart}
        onCancel={() => setActiveModal(null)}
        onConfirm={async () => {
          if (!conflictConfirmItem) return;
          await onConfirmConflict?.(conflictConfirmItem.id);
          setActiveModal(null);
          toast.success("Mismatch acknowledged. You can add the selected part now.");
        }}
      />

      <InventoryPickerModal
        open={activeModal?.type === "inventory"}
        title={`Use Inventory${activeItem ? ` — ${activeItem.description}` : ""}`}
        results={inventoryResults.filter((part) => {
          const q = inventoryQuery.trim().toLowerCase();
          if (!q) return true;
          return [part.label, part.sku, part.partNumber, part.manufacturer]
            .filter(Boolean)
            .some((value) => String(value).toLowerCase().includes(q));
        })}
        query={inventoryQuery}
        onQueryChange={setInventoryQuery}
        selectedPartId={selectedInventoryPartId}
        onSelectedPartChange={setSelectedInventoryPartId}
        onAttach={async (result) => {
          if (!activeItem) return;

          const selectedPart = inventoryResults.find((part) => part.value === result.partId) ?? null;

          setItems((current) =>
            current.map((item) =>
              item.id === activeItem.id
                ? {
                    ...item,
                    partId: result.partId,
                    requestedPartNumber:
                      selectedPart?.partNumber ??
                      selectedPart?.sku ??
                      item.requestedPartNumber ??
                      "",
                    requestedManufacturer:
                      selectedPart?.manufacturer ??
                      item.requestedManufacturer ??
                      "",
                  }
                : item,
            ),
          );

          await onResetConflictOverride?.(activeItem.id);

          await onAttachInventory?.({
            itemId: activeItem.id,
            partId: result.partId,
            warningAccepted: result.warningAccepted,
          });

          setActiveModal(null);
        }}
        onClose={() => setActiveModal(null)}
      />

      <CreateInventoryItemModal
        open={activeModal?.type === "stock"}
        title={`Add to Stock${activeItem ? ` — ${activeItem.description}` : ""}`}
        value={createInventoryDraft}
        supplierOptions={model.supplierOptions}
        onChange={setCreateInventoryDraft}
        onSubmit={async () => {
          if (!activeItem) return;
          if (!createInventoryDraft.name.trim()) {
            toast.error("Inventory item name is required.");
            return;
          }
          if (nonNegativeNumber(createInventoryDraft.cost, "Cost") === null && createInventoryDraft.cost.trim() !== "") return;
          if (nonNegativeNumber(createInventoryDraft.sellPrice, "Sell price") === null && createInventoryDraft.sellPrice.trim() !== "") return;
          if (nonNegativeNumber(createInventoryDraft.initialQty, "Initial qty") === null && createInventoryDraft.initialQty.trim() !== "") return;
          await onCreateInventoryItem?.(activeItem.id, createInventoryDraft);
          setActiveModal(null);
        }}
        onClose={() => setActiveModal(null)}
      />

      <OrderPartModal
        open={activeModal?.type === "order"}
        title={`Order Part${activeItem ? ` — ${activeItem.description}` : ""}`}
        value={orderDraft}
        supplierOptions={model.supplierOptions}
        poOptions={model.poOptions}
        onChange={setOrderDraft}
        onSubmit={async () => {
          if (!activeItem) return;
          if (!orderDraft.supplierId) {
            toast.error("Select a supplier.");
            return;
          }
          if (orderDraft.poMode === "existing" && !orderDraft.existingPoId) {
            toast.error("Select an existing PO or choose Create new PO.");
            return;
          }
          if (positiveNumber(orderDraft.qty, "Qty") == null) return;
          if (nonNegativeNumber(orderDraft.unitCost, "Unit cost") === null && orderDraft.unitCost.trim() !== "") return;
          await onSubmitOrder?.(activeItem.id, orderDraft);
          setActiveModal(null);
        }}
        onClose={() => setActiveModal(null)}
      />

      <ReceivePartModal
        open={activeModal?.type === "receive"}
        title={`Receive Part${activeItem ? ` — ${activeItem.description}` : ""}`}
        hasPartId={!!activeItem?.partId}
        onOpenReceiveDrawer={async () => {
          if (!activeItem) return;
          setActiveModal(null);
          await onOpenReceiveDrawer?.(activeItem.id);
        }}
        onClose={() => setActiveModal(null)}
      />
    </div>
  );
}


function ConfirmConflictDialog({
  item,
  selectedPart,
  onCancel,
  onConfirm,
}: {
  item: PartsRequestWorkbenchItem | null;
  selectedPart: PartsRequestInventoryResult | null;
  onCancel: () => void;
  onConfirm: () => void;
}): JSX.Element | null {
  if (!item) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-amber-400/30 bg-neutral-950 p-5 text-white shadow-2xl">
        <div className="text-lg font-semibold text-amber-100">Confirm possible mismatch</div>
        <p className="mt-2 text-sm text-neutral-300">
          The requested part and selected inventory part may not match. Confirm only if you reviewed both values.
        </p>
        <div className="mt-4 grid gap-3 text-sm">
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <div className="text-xs uppercase tracking-[0.14em] text-neutral-500">Requested</div>
            <div className="mt-1 font-medium">{item.description || "—"}</div>
            <div className="mt-1 text-xs text-neutral-400">Part #: {item.requestedPartNumber || "—"}</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <div className="text-xs uppercase tracking-[0.14em] text-neutral-500">Selected inventory part</div>
            <div className="mt-1 font-medium">{selectedPart?.label ?? "Unknown selected part"}</div>
            <div className="mt-1 text-xs text-neutral-400">
              Part #: {selectedPart?.partNumber || selectedPart?.sku || "—"}
            </div>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="rounded-lg border border-white/10 px-3 py-2 text-sm text-neutral-200 hover:bg-white/5" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="rounded-lg border border-amber-300/40 bg-amber-500/15 px-3 py-2 text-sm font-medium text-amber-100 hover:bg-amber-500/25" onClick={onConfirm}>
            Use selected part anyway
          </button>
        </div>
      </div>
    </div>
  );
}

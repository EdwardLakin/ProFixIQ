"use client";

import React from "react";
import { PartsRequestWorkbenchRow } from "./PartsRequestWorkbenchRow";
import type { PartsRequestInventoryResult, PartsRequestWorkbenchItem, SmartInsight } from "./types";

export function PartsRequestWorkbenchTable({
  items,
  inventoryResults = [],
  selectedItemIds = [],
  selectableItemIds = [],
  onItemsChange,
  onSelectedItemIdsChange,
  onSave,
  onUseInventory,
  onOrder,
  onConfirmConflict,
  onResetConflictOverride,
  onReceive,
  onAddToStock,
  onClearMatch,
  onDelete,
  onOpenInsight,
}: {
  items: PartsRequestWorkbenchItem[];
  inventoryResults?: PartsRequestInventoryResult[];
  selectedItemIds?: string[];
  selectableItemIds?: string[];
  onItemsChange?: (items: PartsRequestWorkbenchItem[]) => void;
  onSelectedItemIdsChange?: (itemIds: string[]) => void;
  onSave?: (itemId: string) => void;
  onUseInventory?: (itemId: string) => void;
  onOrder?: (itemId: string) => void;
  onConfirmConflict?: (itemId: string) => void;
  onResetConflictOverride?: (itemId: string) => void;
  onReceive?: (itemId: string) => void;
  onAddToStock?: (itemId: string) => void;
  onClearMatch?: (itemId: string) => void;
  onDelete?: (itemId: string) => void;
  onOpenInsight?: (insight: SmartInsight) => void;
}): JSX.Element {
  const selected = new Set(selectedItemIds);
  const selectable = new Set(selectableItemIds);
  const allSelected =
    selectableItemIds.length > 0 &&
    selectableItemIds.every((itemId) => selected.has(itemId));

  function updateItem(next: PartsRequestWorkbenchItem): void {
    const previous = items.find((item) => item.id === next.id);
    if (previous && (
      previous.partId !== next.partId ||
      previous.description !== next.description ||
      (previous.requestedPartNumber ?? "") !== (next.requestedPartNumber ?? "")
    )) {
      onResetConflictOverride?.(next.id);
    }
    onItemsChange?.(items.map((item) => (item.id === next.id ? next : item)));
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-[color:var(--desktop-border)] bg-[color:var(--desktop-panel-bg-soft)]">
      <table className="min-w-[1040px] w-full text-left">
        <thead className="bg-[color:var(--theme-surface-subtle)] text-xs text-[color:var(--theme-text-secondary)]">
          <tr>
            <th className="w-12 p-3 font-medium">
              <input
                type="checkbox"
                aria-label="Select all parts"
                checked={allSelected}
                disabled={selectableItemIds.length === 0}
                onChange={(event) =>
                  onSelectedItemIdsChange?.(
                    event.target.checked ? selectableItemIds : [],
                  )
                }
                className="h-4 w-4 rounded border-[color:var(--desktop-border)] accent-emerald-600"
              />
            </th>
            <th className="p-3 font-medium">Description</th>
            <th className="p-3 font-medium">Part #</th>
            <th className="p-3 font-medium">Manufacturer</th>
            <th className="p-3 font-medium">Qty</th>
            <th className="p-3 font-medium">Sell Price</th>
            <th className="p-3 font-medium">Line Total</th>
            <th className="p-3 font-medium">Status</th>
            <th className="p-3 font-medium">Smart Insights</th>
            <th className="p-3 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <PartsRequestWorkbenchRow
              key={item.id}
              item={item}
              selected={selected.has(item.id)}
              selectionDisabled={!selectable.has(item.id)}
              selectedPart={inventoryResults.find((part) => part.value === item.partId) ?? null}
              onSelectedChange={(isSelected) => {
                const next = new Set(selectedItemIds);
                if (isSelected) next.add(item.id);
                else next.delete(item.id);
                onSelectedItemIdsChange?.([...next]);
              }}
              onChange={updateItem}
              onSave={onSave}
              onUseInventory={onUseInventory}
              onOrder={onOrder}
              onConfirmConflict={onConfirmConflict}
              onReceive={onReceive}
              onAddToStock={onAddToStock}
              onClearMatch={onClearMatch}
              onDelete={onDelete}
              onOpenInsight={onOpenInsight}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

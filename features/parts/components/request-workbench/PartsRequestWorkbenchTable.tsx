"use client";

import React from "react";
import { PartsRequestWorkbenchRow } from "./PartsRequestWorkbenchRow";
import type { PartsRequestInventoryResult, PartsRequestWorkbenchItem, SmartInsight } from "./types";

export function PartsRequestWorkbenchTable({
  items,
  inventoryResults = [],
  onItemsChange,
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
  onItemsChange?: (items: PartsRequestWorkbenchItem[]) => void;
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
              selectedPart={inventoryResults.find((part) => part.value === item.partId) ?? null}
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

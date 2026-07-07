"use client";

import { PartsRequestWorkbenchRow } from "./PartsRequestWorkbenchRow";
import type { PartsRequestWorkbenchItem, SmartInsight } from "./types";

export function PartsRequestWorkbenchTable({
  items,
  onItemsChange,
  onSave,
  onUseInventory,
  onOrder,
  _onAddToJob,
  onReceive,
  onAddToStock,
  onClearMatch,
  onDelete,
  onOpenInsight,
}: {
  items: PartsRequestWorkbenchItem[];
  onItemsChange?: (items: PartsRequestWorkbenchItem[]) => void;
  onSave?: (itemId: string) => void;
  onUseInventory?: (itemId: string) => void;
  onOrder?: (itemId: string) => void;
  onAddToJob?: (itemId: string) => void;
  onReceive?: (itemId: string) => void;
  onAddToStock?: (itemId: string) => void;
  onClearMatch?: (itemId: string) => void;
  onDelete?: (itemId: string) => void;
  onOpenInsight?: (insight: SmartInsight) => void;
}): JSX.Element {
  function updateItem(next: PartsRequestWorkbenchItem): void {
    onItemsChange?.(items.map((item) => (item.id === next.id ? next : item)));
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-[color:var(--desktop-border)] bg-[color:var(--desktop-panel-bg-soft)]">
      <table className="min-w-[1280px] w-full text-left">
        <thead className="bg-white/[0.03] text-xs text-neutral-400">
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
              onChange={updateItem}
              onSave={onSave}
              onUseInventory={onUseInventory}
              onOrder={onOrder}
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

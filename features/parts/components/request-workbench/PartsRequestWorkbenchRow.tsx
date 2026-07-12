"use client";

import React from "react";
import { SmartInsightBadges } from "./SmartInsightBadges";
import type { PartsRequestInventoryResult, PartsRequestWorkbenchItem, SmartInsight } from "./types";

function money(value: number | null): string {
  if (value == null) return "—";
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
  }).format(value);
}

export function PartsRequestWorkbenchRow({
  item,
  selectedPart,
  compactActions = false,
  onChange,
  onSave,
  onUseInventory,
  onOrder,
  onAddToJob,
  onConfirmConflict,
  onReceive,
  onAddToStock,
  onClearMatch,
  onDelete,
  onOpenInsight,
}: {
  item: PartsRequestWorkbenchItem;
  selectedPart?: PartsRequestInventoryResult | null;
  compactActions?: boolean;
  onChange?: (item: PartsRequestWorkbenchItem) => void;
  onSave?: (itemId: string) => void;
  onUseInventory?: (itemId: string) => void;
  onOrder?: (itemId: string) => void;
  onAddToJob?: (item: PartsRequestWorkbenchItem) => void;
  onConfirmConflict?: (itemId: string) => void;
  onReceive?: (itemId: string) => void;
  onAddToStock?: (itemId: string) => void;
  onClearMatch?: (itemId: string) => void;
  onDelete?: (itemId: string) => void;
  onOpenInsight?: (insight: SmartInsight) => void;
}): JSX.Element {
  const input =
    "w-full rounded-lg border border-[color:var(--desktop-border)] bg-neutral-950/25 px-2 py-2 text-sm text-white placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-sky-500/25";
  const action =
    "rounded-lg border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] px-2.5 py-2 text-xs text-neutral-100 hover:bg-white/5";

  const hasPossibleMismatch = item.insights?.some((insight) => insight.kind === "possible_mismatch") ?? false;
  const hasSelectedPart = !!item.partId && !!selectedPart;
  const isAddedToWorkOrder = item.addedToWorkOrder === true;

  return (
    <tr className="border-t border-[color:var(--desktop-border)] align-top">
      <td className="p-2">
        <input
          className={input}
          value={item.description}
          placeholder="Description"
          onChange={(event) => onChange?.({ ...item, description: event.target.value })}
        />
      </td>
      <td className="p-2">
        <input
          className={input}
          value={item.requestedPartNumber ?? ""}
          placeholder="Part #"
          onChange={(event) => onChange?.({ ...item, requestedPartNumber: event.target.value })}
        />
      </td>
      <td className="p-2">
        <input
          className={input}
          value={item.requestedManufacturer ?? ""}
          placeholder="Manufacturer"
          onChange={(event) => onChange?.({ ...item, requestedManufacturer: event.target.value })}
        />
      </td>
      <td className="p-2">
        <input
          className={`${input} max-w-20`}
          type="number"
          min="1"
          value={item.qty}
          onChange={(event) => onChange?.({ ...item, qty: Number(event.target.value) })}
        />
      </td>
      <td className="p-2">
        <input
          className={`${input} max-w-28`}
          type="number"
          min="0"
          step="0.01"
          value={item.sellPrice ?? ""}
          onChange={(event) =>
            onChange?.({
              ...item,
              sellPrice: event.target.value === "" ? null : Number(event.target.value),
            })
          }
        />
      </td>
      <td className="p-2 text-sm font-medium text-white">{money(item.qty * Math.max(0, item.sellPrice ?? 0))}</td>
      <td className="p-2">
        <span className="rounded-full border border-sky-400/30 bg-sky-950/20 px-2 py-1 text-xs text-sky-100">
          {item.status ?? "requested"}
        </span>
      </td>
      <td className="p-2">
        <div className="space-y-2">
          {selectedPart ? (
            <div className="rounded-xl border border-emerald-400/25 bg-emerald-950/15 p-2 text-xs text-emerald-100">
              <div className="font-medium">Selected: {selectedPart.label}</div>
              <div className="mt-1 text-emerald-100/80">
                {[selectedPart.partNumber || selectedPart.sku, selectedPart.manufacturer].filter(Boolean).join(" • ") || "No part metadata"}
              </div>
              <div className="mt-1 text-emerald-100/80">
                {selectedPart.onHandQty == null
                  ? "Stock unavailable"
                  : Number(selectedPart.onHandQty) > 0
                    ? `${Number(selectedPart.onHandQty)} on hand`
                    : "No stock"}
                {selectedPart.sellPrice != null ? ` • Sell price ${money(selectedPart.sellPrice)}` : ""}
              </div>
            </div>
          ) : null}
          <SmartInsightBadges insights={item.insights} onOpenInsight={onOpenInsight} />
          {hasPossibleMismatch ? (
            <div className="rounded-xl border border-amber-400/30 bg-amber-950/20 p-2 text-xs text-amber-100">
              <div className="font-medium">Advisory mismatch: review differences before attaching.</div>
              <div className="mt-1 text-amber-100/80">
                Selected: {selectedPart?.label ?? "Unknown part"}
                {selectedPart?.partNumber || selectedPart?.sku ? ` • ${selectedPart.partNumber || selectedPart.sku}` : ""}
              </div>
              <button
                type="button"
                className="mt-2 rounded-lg border border-amber-300/40 bg-amber-500/15 px-2 py-1 text-xs font-medium text-amber-50 hover:bg-amber-500/25"
                onClick={() => onConfirmConflict?.(item.id)}
              >
                Attach anyway
              </button>
            </div>
          ) : null}
        </div>
      </td>
      <td className="p-2">
        {compactActions ? (
          <select
            className={action}
            defaultValue=""
            onChange={(event) => {
              const value = event.target.value;
              event.currentTarget.value = "";
              if (value === "save") onSave?.(item.id);
              if (value === "inventory") onUseInventory?.(item.id);
              if (value === "add") onAddToJob?.(item);
              if (value === "order") onOrder?.(item.id);
              if (value === "receive") onReceive?.(item.id);
              if (value === "stock") onAddToStock?.(item.id);
              if (value === "confirm") onConfirmConflict?.(item.id);
              if (value === "clear") onClearMatch?.(item.id);
              if (value === "delete") onDelete?.(item.id);
            }}
          >
            <option value="">Actions</option>
            <option value="save">Save</option>
            {hasSelectedPart && !isAddedToWorkOrder ? <option value="add">Add to Work Order</option> : null}
            <option value="inventory">{hasSelectedPart ? "Change Part" : "Attach Part"}</option>
            <option value="order">Order</option>
            {item.poId || item.qtyReceived ? <option value="receive">Receive</option> : null}
            <option value="stock">Add to Stock</option>
            {hasPossibleMismatch ? <option value="confirm">Confirm Match</option> : null}
            <option value="clear">Clear Match</option>
            <option value="delete">Delete</option>
          </select>
        ) : (
          <div className="flex min-w-[12rem] flex-wrap gap-1.5">
            <button type="button" className={action} onClick={() => onSave?.(item.id)}>Save</button>
            {hasSelectedPart && !isAddedToWorkOrder ? <button type="button" className={action} onClick={() => onAddToJob?.(item)}>Add to Work Order</button> : null}
            {!isAddedToWorkOrder ? <button type="button" className={action} onClick={() => onUseInventory?.(item.id)}>{hasSelectedPart ? "Change Part" : "Attach Part"}</button> : null}
            {!isAddedToWorkOrder ? <button type="button" className={action} onClick={() => onOrder?.(item.id)}>Order</button> : null}
            {isAddedToWorkOrder ? <span className="rounded-lg border border-emerald-400/25 bg-emerald-500/10 px-2.5 py-2 text-xs text-emerald-100">Added to work order</span> : null}
            {item.poId || item.qtyReceived ? <button type="button" className={action} onClick={() => onReceive?.(item.id)}>Receive</button> : null}
            <select
              className={action}
              defaultValue=""
              onChange={(event) => {
                const value = event.target.value;
                event.currentTarget.value = "";
                if (value === "stock") onAddToStock?.(item.id);
                if (value === "confirm") onConfirmConflict?.(item.id);
                if (value === "clear") onClearMatch?.(item.id);
                if (value === "delete") onDelete?.(item.id);
              }}
            >
              <option value="">More</option>
              <option value="stock">Add to Stock</option>
              {hasPossibleMismatch ? <option value="confirm">Confirm Match</option> : null}
              <option value="clear">Clear Match</option>
              <option value="delete">Delete</option>
            </select>
          </div>
        )}
      </td>
    </tr>
  );
}

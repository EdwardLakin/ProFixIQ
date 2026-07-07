"use client";

import { SmartInsightBadges } from "./SmartInsightBadges";
import type { PartsRequestWorkbenchItem, SmartInsight } from "./types";

function money(value: number | null): string {
  if (value == null) return "—";
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
  }).format(value);
}

export function PartsRequestWorkbenchRow({
  item,
  compactActions = false,
  onChange,
  onSave,
  onUseInventory,
  onOrder,
  onAddToJob,
  onReceive,
  onAddToStock,
  onClearMatch,
  onDelete,
  onOpenInsight,
}: {
  item: PartsRequestWorkbenchItem;
  compactActions?: boolean;
  onChange?: (item: PartsRequestWorkbenchItem) => void;
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
  const input =
    "w-full rounded-lg border border-[color:var(--desktop-border)] bg-neutral-950/25 px-2 py-2 text-sm text-white placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-sky-500/25";
  const action =
    "rounded-lg border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] px-2.5 py-2 text-xs text-neutral-100 hover:bg-white/5";

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
        <SmartInsightBadges insights={item.insights} onOpenInsight={onOpenInsight} />
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
              if (value === "order") onOrder?.(item.id);
              if (value === "receive") onReceive?.(item.id);
              if (value === "stock") onAddToStock?.(item.id);
              if (value === "clear") onClearMatch?.(item.id);
              if (value === "delete") onDelete?.(item.id);
            }}
          >
            <option value="">Actions</option>
            <option value="save">Save</option>
            <option value="inventory">Use Inventory</option>
            <option value="order">Order</option>
            <option value="receive">Receive</option>
            <option value="stock">Add to Stock</option>
            <option value="clear">Clear Match</option>
            <option value="delete">Delete</option>
          </select>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            <button type="button" className={action} onClick={() => onSave?.(item.id)}>Save</button>
            <button type="button" className={action} onClick={() => onUseInventory?.(item.id)}>Use Inventory</button>
            <button type="button" className={action} onClick={() => onOrder?.(item.id)}>Order</button>
            <button type="button" className={action} onClick={() => onAddToJob?.(item.id)}>Add to Job</button>
            <button type="button" className={action} onClick={() => onReceive?.(item.id)}>Receive</button>
            <select
              className={action}
              defaultValue=""
              onChange={(event) => {
                const value = event.target.value;
                event.currentTarget.value = "";
                if (value === "stock") onAddToStock?.(item.id);
                if (value === "clear") onClearMatch?.(item.id);
                if (value === "delete") onDelete?.(item.id);
              }}
            >
              <option value="">More</option>
              <option value="stock">Add to Stock</option>
              <option value="clear">Clear Match</option>
              <option value="delete">Delete</option>
            </select>
          </div>
        )}
      </td>
    </tr>
  );
}
